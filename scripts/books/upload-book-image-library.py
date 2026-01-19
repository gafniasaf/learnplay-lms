#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Upload (and optimize) book image libraries to Supabase Storage.

Why:
- We do NOT store image binaries in Postgres.
- We upload images to the private `books` bucket and generate a per-book
  `images-index.json` mapping for later integration with CanonicalBook rendering.

Input layout (local):
  books/{book_slug}/images/{files...}

Output layout (Supabase Storage bucket `books`):
  library/{book_slug}/images/{original_filename}            (when preserved)
  library/{book_slug}/images/{original_filename}.{ext}      (when converted)
  library/{book_slug}/images-index.json

Notes:
- Very large / non-web-friendly formats (TIFF/PSD) are converted to JPEG/PNG.
- We cap the max pixel dimension to keep uploads practical while preserving print readability.
- Secrets are resolved from env + local env files without printing values.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote

import requests
from PIL import Image, ImageOps
from PIL import UnidentifiedImageError


# -----------------------------
# Env resolution (no printing)
# -----------------------------

ENV_FILE_CANDIDATES = [
    Path("supabase/.deploy.env"),
    Path("learnplay.env"),
    Path(".env"),
    Path(".env.local"),
    Path(".env.development"),
    Path(".env.production"),
]


def _parse_dotenv_file(path: Path) -> Dict[str, str]:
    """
    Parse KEY=VALUE dotenv files, and also support the repo's legacy "heading-style"
    learnplay.env format where values appear on the next line after a label.
    """
    out: Dict[str, str] = {}
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return out

    lines = content.splitlines()

    # Pass 1: KEY=VALUE
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        key = k.strip()
        val = v.strip().strip('"').strip("'")
        if key and val:
            out[key] = val

    # Pass 2: heading-style (only fill missing keys)
    for i, raw in enumerate(lines):
        line = raw.strip().lower()
        if not line or line.startswith("#"):
            continue
        if i + 1 >= len(lines):
            continue
        nxt = lines[i + 1].strip()
        if not nxt:
            continue

        # Mirror tests/helpers/parse-learnplay-env.ts without printing values.
        if "project url" in line and "SUPABASE_URL" not in out:
            out["SUPABASE_URL"] = nxt
        if "anon public" in line and "SUPABASE_ANON_KEY" not in out:
            out["SUPABASE_ANON_KEY"] = nxt
        if "service role key" in line and "SUPABASE_SERVICE_ROLE_KEY" not in out:
            out["SUPABASE_SERVICE_ROLE_KEY"] = nxt
        if "supabase token" in line and "SUPABASE_ACCESS_TOKEN" not in out:
            out["SUPABASE_ACCESS_TOKEN"] = nxt

    return out


def resolve_env(required: List[str]) -> Dict[str, str]:
    resolved: Dict[str, str] = {}

    # 1) process.env
    for k in required:
        v = os.environ.get(k)
        if v and v.strip():
            resolved[k] = v.strip()

    # 2+) local env files (do not print values)
    for env_path in ENV_FILE_CANDIDATES:
        if all(k in resolved for k in required):
            break
        if not env_path.exists():
            continue
        data = _parse_dotenv_file(env_path)
        for k in required:
            if k in resolved:
                continue
            v = data.get(k)
            if v and v.strip():
                resolved[k] = v.strip()

    missing = [k for k in required if k not in resolved]
    if missing:
        print("[BLOCKED] Missing required env vars: " + ", ".join(missing), file=sys.stderr)
        print("          Resolve order: process.env -> supabase/.deploy.env -> learnplay.env -> .env*", file=sys.stderr)
        sys.exit(1)

    return resolved


# -----------------------------
# Image processing
# -----------------------------


SUPPORTED_PRESERVE_EXTS = {"jpg", "jpeg", "png", "webp", "gif", "svg"}
CONVERT_FROM_EXTS = {"tif", "tiff", "psd"}


def _optional_import(name: str):
    try:
        return __import__(name)
    except Exception:
        return None


def sha256_bytes(b: bytes) -> str:
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()

def safe_storage_filename(name: str, *, max_len: int = 180) -> str:
    """
    Supabase Storage validates object keys. We keep filenames deterministic and safe:
    - allow only [A-Za-z0-9._-]
    - normalize other chars to "_"
    - cap length (keeping extension) and append a short hash if truncated
    """
    raw = str(name or "").strip()
    if not raw:
        raw = "file"

    # Preserve multi-extension (e.g. ".tif.jpg") by sanitizing the full name and then fixing dots.
    # First split once for extension handling.
    base, ext = os.path.splitext(raw)
    ext = ext.lower()

    safe_base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    safe_base = re.sub(r"_+", "_", safe_base).strip("._-")
    if not safe_base:
        safe_base = "file"

    # Cap length (including extension)
    max_base = max(16, max_len - len(ext))
    if len(safe_base) > max_base:
        h = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
        keep = max(8, max_base - (len(h) + 1))
        safe_base = f"{safe_base[:keep]}_{h}"

    return f"{safe_base}{ext}"


def mime_for_ext(ext: str) -> str:
    e = ext.lower().lstrip(".")
    if e in ("jpg", "jpeg"):
        return "image/jpeg"
    if e == "png":
        return "image/png"
    if e == "webp":
        return "image/webp"
    if e == "gif":
        return "image/gif"
    if e == "svg":
        return "image/svg+xml"
    if e in ("tif", "tiff"):
        return "image/tiff"
    if e == "psd":
        return "image/vnd.adobe.photoshop"
    return "application/octet-stream"


def should_convert(path: Path, *, max_upload_mb: int) -> bool:
    ext = path.suffix.lower().lstrip(".")
    if ext in CONVERT_FROM_EXTS:
        return True
    try:
        size_mb = path.stat().st_size / (1024 * 1024)
    except Exception:
        return True
    # Anything too large for typical Storage uploads should be converted down.
    return size_mb > max_upload_mb


@dataclass
class OptimizedImage:
    output_bytes: bytes
    output_ext: str
    width: int
    height: int
    mode: str


def optimize_image(path: Path, *, max_px: int, jpeg_quality: int, alpha_mode: str) -> OptimizedImage:
    """
    Convert to a render-friendly JPEG/PNG and downscale to max_px.
    """
    try:
        with Image.open(path) as im:
            # Fix common orientation issues based on EXIF (JPEG)
            im = ImageOps.exif_transpose(im)

            # Normalize modes
            has_alpha = ("A" in im.getbands()) or (im.mode in ("LA", "RGBA"))

            # Convert CMYK/P/etc to RGB/RGBA
            if has_alpha:
                if im.mode != "RGBA":
                    im = im.convert("RGBA")
            else:
                if im.mode != "RGB":
                    im = im.convert("RGB")

            # Downscale (do not upscale)
            w, h = im.size
            if max(w, h) > max_px:
                im.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)

            out_w, out_h = im.size

            # Encode
            from io import BytesIO

            buf = BytesIO()
            if has_alpha:
                if alpha_mode == "flatten-white-jpeg":
                    # Many textbook PNGs contain alpha for anti-aliased edges, but are rendered
                    # on white pages. Flattening to white preserves print readability while
                    # allowing JPEG compression (much smaller than PNG at full resolution).
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    bg.paste(im, mask=im.split()[-1])
                    bg.save(
                        buf,
                        format="JPEG",
                        quality=jpeg_quality,
                        optimize=True,
                        progressive=True,
                    )
                    return OptimizedImage(buf.getvalue(), "jpg", out_w, out_h, "RGB")

                # Default: preserve transparency as PNG
                im.save(buf, format="PNG", optimize=True)
                return OptimizedImage(buf.getvalue(), "png", out_w, out_h, im.mode)
            else:
                im.save(
                    buf,
                    format="JPEG",
                    quality=jpeg_quality,
                    optimize=True,
                    progressive=True,
                )
                return OptimizedImage(buf.getvalue(), "jpg", out_w, out_h, im.mode)
    except UnidentifiedImageError:
        # Some very large/complex TIFFs cannot be decoded by Pillow on Windows.
        # Fall back to a streaming downsample using tifffile + imagecodecs + zarr.
        ext = path.suffix.lower().lstrip(".")
        if ext not in ("tif", "tiff"):
            raise
        return optimize_tiff_streaming(path, max_px=max_px, jpeg_quality=jpeg_quality)


def optimize_tiff_streaming(path: Path, *, max_px: int, jpeg_quality: int) -> OptimizedImage:
    """
    Streaming downsample for TIFFs that Pillow cannot decode (e.g., huge CMYK+alpha LZW strips).

    Strategy:
    - Use tifffile.aszarr() to access strips as chunks (rowsperstrip chunks)
    - Sample rows/cols via slicing to keep output <= max_px
    - Convert CMYK -> RGB (ignore extra samples) and encode JPEG
    """
    tf = _optional_import("tifffile")
    zarr = _optional_import("zarr")
    np = _optional_import("numpy")
    if tf is None or zarr is None or np is None:
        raise RuntimeError(
            "BLOCKED: TIFF streaming fallback requires python packages: tifffile, zarr, numpy (and imagecodecs for compressed TIFFs)."
        )

    # Disable decompression bomb limits for trusted local assets.
    Image.MAX_IMAGE_PIXELS = None

    with tf.TiffFile(str(path)) as tif:
        page = tif.pages[0]
        shape = page.shape
        if len(shape) < 2:
            raise RuntimeError("Unsupported TIFF shape")
        height = int(shape[0])
        width = int(shape[1])
        samples = int(shape[2]) if len(shape) >= 3 else 1

        # Compute step so output <= max_px
        step_y = max(1, int(math.ceil(height / float(max_px))))
        step_x = max(1, int(math.ceil(width / float(max_px))))

        store = page.aszarr()
        arr = zarr.open(store, mode="r")
        # Slice reads only required strip chunks; columns are still full-width per chunk (TIFF strip layout),
        # but we reduce chunk count by step_y.
        sampled = arr[0:height:step_y, 0:width:step_x]

        if sampled.ndim == 2:
            sampled = sampled[:, :, None]

        # Convert to RGB
        if samples >= 4:
            # Many textbook exports are CMYK (+ optional extra). Use first 4 as CMYK.
            cmyk = sampled[:, :, 0:4].astype(np.float32)
            C = cmyk[:, :, 0]
            M = cmyk[:, :, 1]
            Y = cmyk[:, :, 2]
            K = cmyk[:, :, 3]
            r = 255.0 * (1.0 - C / 255.0) * (1.0 - K / 255.0)
            g = 255.0 * (1.0 - M / 255.0) * (1.0 - K / 255.0)
            b = 255.0 * (1.0 - Y / 255.0) * (1.0 - K / 255.0)
            rgb = np.stack([r, g, b], axis=-1).clip(0, 255).astype(np.uint8)
            pil = Image.fromarray(rgb, mode="RGB")
            out_w, out_h = pil.size
            from io import BytesIO
            buf = BytesIO()
            pil.save(buf, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)
            return OptimizedImage(buf.getvalue(), "jpg", out_w, out_h, "RGB")

        if samples == 3:
            rgb = sampled[:, :, 0:3].astype(np.uint8)
            pil = Image.fromarray(rgb, mode="RGB")
            out_w, out_h = pil.size
            from io import BytesIO
            buf = BytesIO()
            pil.save(buf, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)
            return OptimizedImage(buf.getvalue(), "jpg", out_w, out_h, "RGB")

        # Grayscale
        gray = sampled[:, :, 0].astype(np.uint8)
        pil = Image.fromarray(gray, mode="L").convert("RGB")
        out_w, out_h = pil.size
        from io import BytesIO
        buf = BytesIO()
        pil.save(buf, format="JPEG", quality=jpeg_quality, optimize=True, progressive=True)
        return OptimizedImage(buf.getvalue(), "jpg", out_w, out_h, "RGB")


# -----------------------------
# Supabase Storage upload
# -----------------------------


def storage_upload(
    *,
    session: requests.Session,
    supabase_url: str,
    service_role_key: str,
    bucket: str,
    object_path: str,
    content_type: str,
    body: bytes,
    upsert: bool,
    timeout_s: int,
) -> None:
    url = f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{quote(object_path, safe='/')}"
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": content_type,
        "x-upsert": "true" if upsert else "false",
    }
    r = session.post(url, headers=headers, data=body, timeout=timeout_s)
    if r.status_code >= 400:
        # Avoid printing secrets; response body is safe.
        raise RuntimeError(f"Upload failed ({r.status_code}): {r.text[:300]}")

def storage_upload_with_retries(
    *,
    session: requests.Session,
    supabase_url: str,
    service_role_key: str,
    bucket: str,
    object_path: str,
    content_type: str,
    body: bytes,
    upsert: bool,
    timeout_s: int,
    retries: int,
) -> None:
    attempt = 0
    while True:
        try:
            storage_upload(
                session=session,
                supabase_url=supabase_url,
                service_role_key=service_role_key,
                bucket=bucket,
                object_path=object_path,
                content_type=content_type,
                body=body,
                upsert=upsert,
                timeout_s=timeout_s,
            )
            return
        except (requests.RequestException, RuntimeError) as e:
            attempt += 1
            if attempt > retries:
                raise
            # Exponential backoff with cap; no secret printing.
            sleep_s = min(60.0, 1.5 ** attempt)
            print(f"  [WARN] upload retry {attempt}/{retries} after error: {str(e)[:120]}", file=sys.stderr)
            time.sleep(sleep_s)

def write_json_atomic(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="books", help="Local root folder containing book directories.")
    parser.add_argument("--bucket", default="books", help="Supabase Storage bucket (default: books).")
    parser.add_argument("--prefix", default="library", help="Storage prefix under the bucket.")
    parser.add_argument("--max-px", type=int, default=3000, help="Max pixel dimension for optimized images.")
    parser.add_argument("--jpeg-quality", type=int, default=85, help="JPEG quality for optimized images.")
    parser.add_argument("--max-upload-mb", type=int, default=40, help="Convert files larger than this MB.")
    parser.add_argument(
        "--convert-all",
        action="store_true",
        help="Force conversion/optimization for ALL non-SVG images (even if below --max-upload-mb). Useful to reduce PDF size by converting small RGB PNGs to JPEG.",
    )
    parser.add_argument(
        "--alpha-mode",
        type=str,
        default="png",
        choices=["png", "flatten-white-jpeg"],
        help="How to encode images with an alpha channel: png=preserve transparency (larger), flatten-white-jpeg=flatten onto white and encode JPEG (smaller).",
    )
    parser.add_argument("--upsert", action="store_true", help="Overwrite existing objects.")
    parser.add_argument("--timeout-s", type=int, default=600, help="HTTP timeout per upload request.")
    parser.add_argument("--retries", type=int, default=5, help="Retry count for transient upload errors.")
    parser.add_argument("--state-dir", default="tmp/book-images-upload-state", help="Local resume state dir (gitignored).")
    parser.add_argument("--no-resume", action="store_true", help="Disable resume and reprocess every file.")
    parser.add_argument("--only-book", default="", help="Process only a single book slug (for smoke tests).")
    parser.add_argument("--limit", type=int, default=0, help="Max files per book (0 = no limit).")
    parser.add_argument("--dry-run", action="store_true", help="Do not upload; just report what would happen.")
    args = parser.parse_args()

    env = resolve_env(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
    supabase_url = env["SUPABASE_URL"]
    service_key = env["SUPABASE_SERVICE_ROLE_KEY"]

    root = Path(args.root)
    if not root.exists():
        print(f"[BLOCKED] root folder not found: {root}", file=sys.stderr)
        sys.exit(1)

    book_dirs = [p for p in root.iterdir() if p.is_dir()]
    if args.only_book:
        book_dirs = [p for p in book_dirs if p.name == args.only_book]
        if not book_dirs:
            print(f"[BLOCKED] --only-book '{args.only_book}' not found under {root}", file=sys.stderr)
            sys.exit(1)

    total_uploaded = 0
    start = time.time()
    session = requests.Session()

    for book_dir in sorted(book_dirs, key=lambda p: p.name):
        book_slug = book_dir.name
        images_dir = book_dir / "images"
        if not images_dir.exists():
            continue

        state_dir = Path(args.state_dir)
        state_path = state_dir / f"{book_slug}.json"
        resume_enabled = not args.no_resume and not args.dry_run
        state: Dict[str, object] = {}
        if resume_enabled and state_path.exists():
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
            except Exception:
                state = {}
        uploaded_by_original = state.get("uploadedByOriginal", {}) if isinstance(state.get("uploadedByOriginal"), dict) else {}

        files = [p for p in images_dir.iterdir() if p.is_file()]
        if args.limit and args.limit > 0:
            files = files[: args.limit]

        print(f"\nBOOK {book_slug}: {len(files)} files")

        index: Dict[str, object] = {
            "bookSlug": book_slug,
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "maxPx": args.max_px,
            "jpegQuality": args.jpeg_quality,
            "alphaMode": args.alpha_mode,
            "entries": [],
            "srcMap": {},
        }
        used_names: Dict[str, int] = {}

        for i, path in enumerate(files, start=1):
            original_name = path.name
            ext = path.suffix.lower().lstrip(".")

            if resume_enabled and original_name in uploaded_by_original:
                entry = uploaded_by_original.get(original_name)
                if isinstance(entry, dict) and isinstance(entry.get("storagePath"), str):
                    index["entries"].append(entry)  # type: ignore
                    index["srcMap"][original_name] = entry["storagePath"]  # type: ignore
                    if i % 50 == 0 or i == len(files):
                        print(f"  [OK] resume-skip {i}/{len(files)}")
                    continue

            try:
                original_size = path.stat().st_size
            except Exception:
                original_size = 0

            # Decide whether to preserve as-is or optimize
            do_convert = (
                args.convert_all
                or should_convert(path, max_upload_mb=args.max_upload_mb)
                or ext not in SUPPORTED_PRESERVE_EXTS
            )

            object_name: str
            content_type: str
            body: bytes
            width = None
            height = None
            mode = None
            output_ext: str

            if ext == "svg" and not do_convert:
                body = path.read_bytes()
                output_ext = "svg"
                object_name = safe_storage_filename(original_name)
                content_type = "image/svg+xml"
            else:
                if do_convert:
                    # Adaptive: if output is still too large, downscale further until under max_upload_mb.
                    max_bytes = int(args.max_upload_mb * 1024 * 1024)
                    cur_px = int(args.max_px)
                    cur_q = int(args.jpeg_quality)
                    last_err: Optional[Exception] = None
                    opt: Optional[OptimizedImage] = None
                    for _ in range(8):
                        try:
                            opt = optimize_image(path, max_px=cur_px, jpeg_quality=cur_q, alpha_mode=args.alpha_mode)
                            if len(opt.output_bytes) <= max_bytes:
                                break
                            # Reduce size: lower px primarily, then quality if already small.
                            cur_px = max(800, int(cur_px * 0.85))
                            cur_q = max(65, int(cur_q - 4))
                        except Exception as e:
                            last_err = e
                            # If conversion failed, try a smaller target once more.
                            cur_px = max(800, int(cur_px * 0.85))
                            cur_q = max(65, int(cur_q - 4))
                            continue
                    if not opt:
                        raise RuntimeError(f"Failed to convert image: {type(last_err).__name__ if last_err else 'unknown'}")
                    if len(opt.output_bytes) > max_bytes:
                        raise RuntimeError(
                            f"BLOCKED: Optimized image is still too large ({len(opt.output_bytes)} bytes). "
                            f"Lower --max-px or --max-upload-mb and retry."
                        )

                    body = opt.output_bytes
                    output_ext = opt.output_ext
                    width, height, mode = opt.width, opt.height, opt.mode
                    # Ensure uniqueness and make mapping explicit (e.g. foo.tif.jpg)
                    object_name = f"{original_name}.{output_ext}" if output_ext != ext else original_name
                    object_name = safe_storage_filename(object_name)
                    content_type = mime_for_ext(output_ext)
                else:
                    body = path.read_bytes()
                    output_ext = ext
                    object_name = safe_storage_filename(original_name)
                    content_type = mime_for_ext(ext)

            # Ensure uniqueness within this book prefix (deterministic-ish): append counter if needed.
            if object_name in used_names:
                used_names[object_name] += 1
                base, ext2 = os.path.splitext(object_name)
                object_name = safe_storage_filename(f"{base}__dup{used_names[object_name]}{ext2}")
            else:
                used_names[object_name] = 0

            object_path = f"{args.prefix}/{book_slug}/images/{object_name}"

            entry = {
                "originalName": original_name,
                "storedName": object_name,
                "storagePath": object_path,
                "originalBytes": original_size,
                "storedBytes": len(body),
                "storedExt": output_ext,
                "storedMime": content_type,
                "storedSha256": sha256_bytes(body),
            }
            if width and height:
                entry["width"] = width
                entry["height"] = height
            if mode:
                entry["mode"] = mode

            # Index structures are created above; keep them simple and JSON-friendly.
            index["entries"].append(entry)  # type: ignore
            index["srcMap"][original_name] = object_path  # type: ignore

            if args.dry_run:
                if i % 25 == 0 or i == len(files):
                    print(f"  (dry-run) {i}/{len(files)}")
                continue

            try:
                storage_upload_with_retries(
                    session=session,
                    supabase_url=supabase_url,
                    service_role_key=service_key,
                    bucket=args.bucket,
                    object_path=object_path,
                    content_type=content_type,
                    body=body,
                    upsert=args.upsert,
                    timeout_s=int(args.timeout_s),
                    retries=int(args.retries),
                )
                total_uploaded += 1
            except Exception as e:
                msg = str(e)
                print(f"  [ERR] upload failed ({book_slug}/{original_name}): {msg[:200]}", file=sys.stderr)
                # Fail fast: these assets are required for later deterministic rendering.
                sys.exit(1)

            if resume_enabled:
                # Persist resume state incrementally to survive crashes.
                uploaded_by_original[original_name] = entry
                state = {
                    "bookSlug": book_slug,
                    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "uploadedByOriginal": uploaded_by_original,
                }
                write_json_atomic(state_path, state)

            if i % 25 == 0 or i == len(files):
                print(f"  [OK] uploaded {i}/{len(files)}")

        # Upload index JSON
        index_path = f"{args.prefix}/{book_slug}/images-index.json"
        index_bytes = json.dumps(index, ensure_ascii=False, indent=2).encode("utf-8")
        if args.dry_run:
            print(f"  (dry-run) would upload index: {index_path}")
        else:
            storage_upload_with_retries(
                session=session,
                supabase_url=supabase_url,
                service_role_key=service_key,
                bucket=args.bucket,
                object_path=index_path,
                content_type="application/json",
                body=index_bytes,
                upsert=True,
                timeout_s=int(args.timeout_s),
                retries=int(args.retries),
            )
            print(f"  [OK] uploaded index: {index_path}")

    dur = time.time() - start
    print(f"\n[OK] Done. Uploaded {total_uploaded} objects in {dur:.1f}s")


if __name__ == "__main__":
    main()


