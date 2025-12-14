-- Fix: course_metadata.id must be TEXT (course file id).
-- Some deployments may still have course_metadata.id as an integer (legacy schema),
-- which breaks AI course generation when courseId is a string like "skeleton-...".
--
-- This migration is written to be idempotent:
-- - If course_metadata.id is already TEXT, it does nothing.
-- - If it is an integer type, it converts it to TEXT and repairs dependent FKs.

DO $$
DECLARE
  v_id_type text;
  r record;
BEGIN
  SELECT c.data_type
    INTO v_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'course_metadata'
    AND c.column_name = 'id';

  -- If the table doesn't exist yet, nothing to do.
  IF v_id_type IS NULL THEN
    RETURN;
  END IF;

  -- Only migrate if the id column is a numeric type.
  IF v_id_type IN ('smallint', 'integer', 'bigint') THEN
    RAISE NOTICE 'Migrating public.course_metadata.id from % to text', v_id_type;

    -- Drop any foreign keys that reference course_metadata(id) so we can change the type safely.
    FOR r IN
      SELECT conname, conrelid::regclass AS tbl
      FROM pg_constraint
      WHERE confrelid = 'public.course_metadata'::regclass
        AND contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
    END LOOP;

    -- Drop PK, alter type, recreate PK.
    EXECUTE 'ALTER TABLE public.course_metadata DROP CONSTRAINT IF EXISTS course_metadata_pkey';
    EXECUTE 'ALTER TABLE public.course_metadata ALTER COLUMN id TYPE text USING id::text';
    EXECUTE 'ALTER TABLE public.course_metadata ADD CONSTRAINT course_metadata_pkey PRIMARY KEY (id)';

    -- Ensure course_versions.course_id is TEXT as well (if it exists).
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'course_versions'
        AND column_name = 'course_id'
        AND data_type IN ('smallint', 'integer', 'bigint')
    ) THEN
      EXECUTE 'ALTER TABLE public.course_versions ALTER COLUMN course_id TYPE text USING course_id::text';
    END IF;

    -- Recreate a canonical FK (if course_versions exists and the FK isn't already present).
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'course_versions'
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.course_versions'::regclass
          AND contype = 'f'
          AND conname = 'course_versions_course_id_fkey'
      ) THEN
        EXECUTE 'ALTER TABLE public.course_versions ADD CONSTRAINT course_versions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course_metadata(id) ON DELETE CASCADE';
      END IF;
    END IF;
  END IF;
END $$;

