create table if not exists public.org_settings (
  org_id uuid primary key,
  publish_thresholds jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_org_settings_updated_at on public.org_settings;
create trigger trg_org_settings_updated_at before update on public.org_settings
for each row execute procedure public.set_updated_at();

comment on table public.org_settings is 'Per-org configuration for publish thresholds, e.g., { "variantsCoverageMin": 0.9 }';


