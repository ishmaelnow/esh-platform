-- Disposable minimal schema only. Never run on an existing database.
alter table public.rider_profiles add column photo_storage_bucket text, add column photo_storage_path text, add column photo_mime_type text;
alter table public.driver_evidence add column storage_bucket text, add column storage_path text, add column mime_type text;
alter table public.driver_evidence alter column evidence_id set default gen_random_uuid();
alter table public.driver_evidence alter column submitted_at set default now();
alter table public.driver_evidence alter column created_at set default now();
