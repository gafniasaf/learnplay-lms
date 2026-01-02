-- Book figure placements (semantic membership)
--
-- Persist LLM-derived figure -> paragraph placements per book_version_id so
-- text-only canonicals can attach library figures correctly (no filename heuristics).

alter table public.book_versions
  add column if not exists figure_placements jsonb;

alter table public.book_versions
  add column if not exists figure_placements_updated_at timestamptz;


