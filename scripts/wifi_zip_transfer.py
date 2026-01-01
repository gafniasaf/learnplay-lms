#!/usr/bin/env python3
"""
wifi_zip_transfer.py

Small, dependency-free WiFi file transfer helper (sender runs an HTTP server, receiver downloads).

Usage (Windows examples):
  py -3 scripts\\wifi_zip_transfer.py send "C:\\path\\file.zip" --port 8765
  py -3 scripts\\wifi_zip_transfer.py receive "http://192.168.1.10:8765/<token>" --out ".\\file.zip" --expect-sha256 "<sha>"

Security note:
  This uses plain HTTP (no TLS). Use only on a trusted network.
  A random token is required in the URL path to reduce accidental access.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import socket
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Iterable, Optional


CHUNK_SIZE = 1024 * 1024  # 1MB


def _human_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    units = ["KB", "MB", "GB", "TB"]
    size = float(n)
    for u in units:
        size /= 1024.0
        if size < 1024.0:
            return f"{size:.2f} {u}"
    return f"{size:.2f} PB"


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _local_ipv4s() -> list[str]:
    ips: set[str] = set()

    # Best-effort: infer the default outbound interface without sending data.
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        if ip and not ip.startswith("127."):
            ips.add(ip)
    except Exception:
        pass
    finally:
        try:
            s.close()
        except Exception:
            pass

    # Also include host-resolved addresses.
    try:
        host = socket.gethostname()
        _, _, addrs = socket.gethostbyname_ex(host)
        for ip in addrs:
            if ip and not ip.startswith("127."):
                ips.add(ip)
    except Exception:
        pass

    return sorted(ips)


def _iter_file(path: str) -> Iterable[bytes]:
    with open(path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk


def make_single_file_handler(
    *,
    file_path: str,
    token: str,
    filename: str,
    file_size: int,
    content_type: str,
    stop_after_first_download: bool,
) -> type[BaseHTTPRequestHandler]:
    # Mutable state captured by closure
    state = {"downloads": 0}

    class Handler(BaseHTTPRequestHandler):
        server_version = "wifi-zip-transfer/1.0"

        def _is_allowed(self) -> bool:
            # Only allow exact token path, e.g. /AbCdEf...
            return self.path.split("?", 1)[0] == f"/{token}"

        def _send_headers(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_HEAD(self) -> None:  # noqa: N802
            if not self._is_allowed():
                self.send_error(404, "Not Found")
                return
            self._send_headers()

        def do_GET(self) -> None:  # noqa: N802
            if not self._is_allowed():
                self.send_error(404, "Not Found")
                return

            try:
                self._send_headers()
                for chunk in _iter_file(file_path):
                    self.wfile.write(chunk)
                self.wfile.flush()
            except BrokenPipeError:
                # Client aborted download.
                return
            except Exception as e:
                # If headers already sent, we can only log.
                self.log_error("Error while sending file: %s", str(e))
                return
            finally:
                state["downloads"] += 1

            if stop_after_first_download and state["downloads"] >= 1:
                # Shutdown in another thread to avoid deadlock inside the request thread.
                threading.Thread(target=self.server.shutdown, daemon=True).start()

        def log_message(self, fmt: str, *args) -> None:
            # Keep logs minimal (one line per request)
            sys.stdout.write("[wifi_zip_transfer] " + (fmt % args) + "\n")

    return Handler


def cmd_send(args: argparse.Namespace) -> int:
    file_path = os.path.abspath(args.file)
    if not os.path.isfile(file_path):
        print(f"[wifi_zip_transfer] ❌ File not found: {file_path}", file=sys.stderr)
        return 2

    filename = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    token = args.token or secrets.token_urlsafe(16)

    if args.sha256:
        print("[wifi_zip_transfer] Computing sha256 (may take a moment)...")
        digest = sha256_file(file_path)
    else:
        digest = None

    handler_cls = make_single_file_handler(
        file_path=file_path,
        token=token,
        filename=filename,
        file_size=file_size,
        content_type="application/octet-stream",
        stop_after_first_download=not args.multi,
    )

    bind = args.bind
    port = args.port

    httpd = ThreadingHTTPServer((bind, port), handler_cls)

    ips = _local_ipv4s()
    print("\n[wifi_zip_transfer] ✅ Sender ready")
    print(f"[wifi_zip_transfer] File: {filename} ({_human_bytes(file_size)})")
    if digest:
        print(f"[wifi_zip_transfer] sha256: {digest}")
    print(f"[wifi_zip_transfer] Listening on: {bind}:{port}")

    if not ips:
        print("[wifi_zip_transfer] Could not auto-detect LAN IP. Use `ipconfig` and pick your WiFi IPv4.")
        ips = []

    print("\n[wifi_zip_transfer] Receiver download URL(s):")
    if ips:
        for ip in ips:
            print(f"  http://{ip}:{port}/{token}")
    else:
        print(f"  http://<YOUR_LAN_IP>:{port}/{token}")

    print("\n[wifi_zip_transfer] Notes:")
    print("- If Windows Firewall prompts, allow Python on Private networks.")
    print("- This is plain HTTP. Use only on trusted WiFi.")
    if args.multi:
        print("- Multi-download mode enabled (server stays up until you Ctrl+C).")
    else:
        print("- One-time mode enabled (server stops after the first successful download).")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[wifi_zip_transfer] Stopped by user.")
    finally:
        try:
            httpd.server_close()
        except Exception:
            pass

    return 0


def _parse_content_length(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    try:
        n = int(value)
        return n if n >= 0 else None
    except Exception:
        return None


def cmd_receive(args: argparse.Namespace) -> int:
    url = args.url.strip()
    out_path = os.path.abspath(args.out)

    out_dir = os.path.dirname(out_path)
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    print(f"[wifi_zip_transfer] Downloading: {url}")
    print(f"[wifi_zip_transfer] Saving to:   {out_path}")

    h = hashlib.sha256()
    downloaded = 0
    last_print = time.time()

    try:
        with urllib.request.urlopen(url) as resp:
            total = _parse_content_length(resp.headers.get("Content-Length"))

            with open(out_path, "wb") as f:
                while True:
                    chunk = resp.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    f.write(chunk)
                    h.update(chunk)
                    downloaded += len(chunk)

                    now = time.time()
                    if now - last_print >= 1.0:
                        if total:
                            pct = downloaded / total * 100.0
                            print(f"[wifi_zip_transfer] ... {_human_bytes(downloaded)} / {_human_bytes(total)} ({pct:.1f}%)")
                        else:
                            print(f"[wifi_zip_transfer] ... {_human_bytes(downloaded)}")
                        last_print = now
    except Exception as e:
        print(f"[wifi_zip_transfer] ❌ Download failed: {e}", file=sys.stderr)
        return 2

    digest = h.hexdigest()
    print(f"[wifi_zip_transfer] ✅ Download complete ({_human_bytes(downloaded)})")
    print(f"[wifi_zip_transfer] sha256: {digest}")

    if args.expect_sha256:
        expected = args.expect_sha256.strip().lower()
        if digest.lower() != expected:
            print("[wifi_zip_transfer] ❌ sha256 mismatch!", file=sys.stderr)
            print(f"[wifi_zip_transfer] expected: {expected}", file=sys.stderr)
            print(f"[wifi_zip_transfer] got:      {digest}", file=sys.stderr)
            return 3

    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="wifi_zip_transfer.py",
        description="Transfer a file over WiFi using a tiny HTTP server (send) and downloader (receive).",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    send = sub.add_parser("send", help="Serve a file over HTTP (sender machine).")
    send.add_argument("file", help="Path to the .zip (or any file) to send.")
    send.add_argument("--bind", default="0.0.0.0", help="Bind address (default: 0.0.0.0).")
    send.add_argument("--port", type=int, default=8765, help="Port to listen on (default: 8765).")
    send.add_argument(
        "--token",
        default=None,
        help="Optional fixed token for the URL path. If omitted, a random token is generated.",
    )
    send.add_argument(
        "--sha256",
        action="store_true",
        help="Compute and print sha256 of the file for verification.",
    )
    send.add_argument(
        "--multi",
        action="store_true",
        help="Allow multiple downloads (server keeps running until Ctrl+C).",
    )
    send.set_defaults(func=cmd_send)

    recv = sub.add_parser("receive", help="Download a file from a sender URL (receiver machine).")
    recv.add_argument("url", help='URL printed by sender, e.g. "http://192.168.1.10:8765/<token>".')
    recv.add_argument("--out", required=True, help="Output path to save the downloaded file.")
    recv.add_argument(
        "--expect-sha256",
        default=None,
        help="Optional expected sha256. If set and mismatch, exits non-zero.",
    )
    recv.set_defaults(func=cmd_receive)

    return p


def main(argv: list[str]) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))



