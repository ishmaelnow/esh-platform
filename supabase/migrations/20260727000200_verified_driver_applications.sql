-- Require verified Supabase identities for public driver applications.

alter table public.driver_applications
  add column applicant_auth_user_id uuid references auth.users (id) on delete restrict,
  add column email_verified_at timestamptz;

create unique index driver_applications_open_identity_idx
  on public.driver_applications (tenant_id, applicant_auth_user_id)
  where applicant_auth_user_id is not null
    and application_status in ('submitted', 'under_review');

create or replace function public.submit_driver_application(
  target_tenant_id uuid,
  applicant_name text,
  applicant_email text,
  applicant_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  application_id uuid;
  applicant_user_id uuid := auth.uid();
  verified_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if applicant_user_id is null or verified_email = '' then
    raise exception 'A verified email session is required';
  end if;
  if verified_email <> lower(btrim(applicant_email)) then
    raise exception 'Application email must match the verified email';
  end if;
  if length(btrim(applicant_name)) < 2 then
    raise exception 'A valid name is required';
  end if;

  insert into public.driver_applications (
    tenant_id, applicant_auth_user_id, email_verified_at, full_name, email, phone
  )
  values (
    target_tenant_id, applicant_user_id, now(), btrim(applicant_name), verified_email,
    nullif(btrim(applicant_phone), '')
  )
  returning driver_application_id into application_id;

  return application_id;
exception
  when unique_violation then
    raise exception 'An open application already exists for this verified email';
end;
$$;

revoke execute on function public.submit_driver_application(uuid, text, text, text) from anon;
grant execute on function public.submit_driver_application(uuid, text, text, text) to authenticated;

revoke execute on function public.submit_transport_driver_application(text, text, text, text)
  from anon;
grant execute on function public.submit_transport_driver_application(text, text, text, text)
  to authenticated;
