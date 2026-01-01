# Book Images: Updated Images Pack Ingest Status (2025-12-30)

This doc records the current state of ingesting the **“Updated images”** package into the IgniteZero **book image library** (`books` Storage bucket under `library/<bookId>/...`).

## What’s implemented

- **Per-book image libraries uploaded** via `scripts/books/upload-book-image-library.py`
  - Uploads binaries to: `books` bucket → `library/<bookId>/images/<file>`
  - Writes index: `books` bucket → `library/<bookId>/images-index.json`
- **Canonical-aware srcMap enrichment** via `scripts/books/upsert-library-index-from-updated-images.ts`
  - Adds `srcMap` keys for:
    - `source_link_name` aliases (e.g. `MAF_Ch4_Img_4.13.TIF`)
    - `figure_id` aliases (e.g. `Afbeelding_4.13.png`)
    - `num_key_guess` aliases (e.g. `Afbeelding_4.13.png` from `4.13`)
    - canonical path aliases (e.g. `new_pipeline/assets/figures/ch4/Afbeelding_4.13.png`)
  - Adds **opener aliases** for `Book_chapter_opener.(jpg|png)` when possible.
- **Strict audit gate**: `npx tsx scripts/books/audit-images-for-canonical-versions.ts`
  - Calls `supabase/functions/book-version-input-urls` in strict mode to ensure render inputs can be resolved without `assets.zip`.

## Current strict audit status

Source: `tmp/canonicaljsonsfrommacbook.image-audit.json`

- **Strict OK** (image library present + all mappings resolve):
  - `9789083251363` (MBO A&F 3)
  - `mbo-aandf-4` (MBO A&F 4 / Common Core)
  - `9789083251394` (MBO Methodisch werken)
  - `9789083412016` (MBO Pathologie nivo 4)
  - `9789083412023` (MBO Persoonlijke Verzorging)
  - `9789083412030` (MBO Praktijkgestuurd klinisch redeneren)
  - `9789083412061` (MBO Wetgeving)
  - `mbo-aandf-common-core-basisboek-n3-focus-auto` (MBO A&F Common Core basisboek N3-focus [auto])
  - `mbo-vth-nivo-4` (MBO VTH nivo 4)

## Resolved: Common Core (N3-focus) missing figures

The “Updated images” package did **not** include 10 figure assets required by:
- canonical: `canonicaljsonsfrommacbook/ROOT__canonical_book_with_figures.json`
- bookId: `mbo-aandf-common-core-basisboek-n3-focus-auto`

These were provided separately under `figures/` and uploaded to the book image library.

- `new_pipeline/assets/figures/ch1/Afbeelding_1.10.png`
- `new_pipeline/assets/figures/ch4/Afbeelding_4.6.png`
- `new_pipeline/assets/figures/ch5/Afbeelding_5.1.png`
- `new_pipeline/assets/figures/ch5/Afbeelding_5.10.png`
- `new_pipeline/assets/figures/ch5/Afbeelding_5.16.png`
- `new_pipeline/assets/figures/ch8/Afbeelding_8.15.png`
- `new_pipeline/assets/figures/ch9/Afbeelding_9.6.png`
- `new_pipeline/assets/figures/ch11/Afbeelding_11.15.png`
- `new_pipeline/assets/figures/ch12/Afbeelding_12.1.png`
- `new_pipeline/assets/figures/ch12/Afbeelding_12.10.png`

Detail report (local-only):
- `tmp/common-core.missing-images.report.csv`
- `tmp/common-core.missing-images.report.json`

### Notes on how this was resolved

1. The missing PNGs were placed into:
   - `books/mbo-aandf-common-core-basisboek-n3-focus-auto/images/`
2. Uploaded and index regenerated:

```powershell
python scripts/books/upload-book-image-library.py --root books --only-book mbo-aandf-common-core-basisboek-n3-focus-auto --upsert
```

3. IMPORTANT: Re-apply placements-based index enrichment afterwards (the uploader overwrites `images-index.json`):

```powershell
npx --yes tsx scripts/books/upsert-library-index-from-updated-images.ts --bookId mbo-aandf-common-core-basisboek-n3-focus-auto --placements "Updated images\\Updated images\\MBO A&F 4_9789083251370_03\\placements.csv"
```

4. Re-run strict audit:

```powershell
npx --yes tsx scripts/books/audit-images-for-canonical-versions.ts
```

## Notes / gotchas

- Some canonicals reference the conventional opener path: `new_pipeline/assets/images/ch1/Book_chapter_opener.jpg`.
  - The ingest flow supports this by adding opener aliases in `images-index.json`.
- If you see `strict=FAIL:missing_image_library`, it means `library/<bookId>/images-index.json` is missing.
- If you see `strict=FAIL:missing_image_mappings`, it means `images-index.json` exists but canonical `img.src` values can’t be mapped to uploaded storage objects.


