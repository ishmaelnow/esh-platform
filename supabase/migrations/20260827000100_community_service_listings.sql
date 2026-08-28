-- Community service directory listings. Provider identity and verification remain
-- separate from listing content and publication state.

create table public.community_service_listings (
  listing_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete restrict,
  provider_id uuid not null,
  service_category text not null,
  title text not null,
  description text not null,
  service_area_id uuid,
  rate_text text,
  contact_email text,
  contact_phone text,
  website_url text,
  status text not null default 'pending',
  created_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  updated_by_person_id uuid not null references public.person_profiles (person_id) on delete restrict,
  reviewed_by_person_id uuid references public.person_profiles (person_id) on delete restrict,
  reviewed_at timestamptz,
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, listing_id),
  foreign key (tenant_id, provider_id) references public.community_provider_profiles (tenant_id, provider_id) on delete restrict,
  foreign key (tenant_id, service_area_id) references public.community_areas (tenant_id, area_id) on delete restrict,
  constraint community_service_listings_category_check check (length(btrim(service_category)) between 1 and 80),
  constraint community_service_listings_title_check check (length(btrim(title)) between 1 and 160),
  constraint community_service_listings_description_check check (length(btrim(description)) between 1 and 5000),
  constraint community_service_listings_status_check check (status in ('pending', 'active', 'suspended', 'inactive', 'rejected')),
  constraint community_service_listings_contact_check check (contact_email is not null or contact_phone is not null or website_url is not null)
);

create index community_service_listings_directory_idx
  on public.community_service_listings (tenant_id, status, service_category, updated_at desc);
create index community_service_listings_area_idx
  on public.community_service_listings (tenant_id, service_area_id, status);

alter table public.community_service_listings enable row level security;
revoke all on public.community_service_listings from anon, authenticated;
grant select on public.community_service_listings to authenticated;

create policy community_service_listings_member_select
  on public.community_service_listings for select to authenticated
  using (
    status = 'active'
    and public.community_public_enabled(tenant_id)
    and public.has_community_permission(tenant_id, 'community.content.create')
  );

create policy community_service_listings_owner_select
  on public.community_service_listings for select to authenticated
  using (public.owns_community_provider(tenant_id, provider_id));

create or replace function public.community_service_directory_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'listing_id', listing.listing_id,
    'provider_id', listing.provider_id,
    'provider_name', provider.display_name,
    'provider_status', provider.status,
    'service_category', listing.service_category,
    'title', listing.title,
    'description', listing.description,
    'service_area_id', listing.service_area_id,
    'service_area_name', area.name,
    'rate_text', listing.rate_text,
    'contact_email', listing.contact_email,
    'contact_phone', listing.contact_phone,
    'website_url', listing.website_url,
    'updated_at', listing.updated_at
  ) order by listing.updated_at desc), '[]'::jsonb)
  from (
    select * from public.community_service_listings
    where tenant_id = target_tenant_id and status = 'active'
    order by updated_at desc
    limit greatest(1, least(coalesce(result_limit, 50), 100))
  ) listing
  join public.community_provider_profiles provider
    on provider.tenant_id = listing.tenant_id and provider.provider_id = listing.provider_id
  left join public.community_areas area
    on area.tenant_id = listing.tenant_id and area.area_id = listing.service_area_id
  where provider.status = 'active'
    and public.community_public_enabled(target_tenant_id)
  limit greatest(1, least(coalesce(result_limit, 50), 100));
$$;

revoke all on function public.community_service_directory_snapshot(uuid, integer) from public, anon, authenticated;
grant execute on function public.community_service_directory_snapshot(uuid, integer) to authenticated;

create or replace function public.create_my_community_service_listing(
  target_tenant_id uuid, target_provider_id uuid, category_value text, title_value text,
  description_value text, service_area_id_value uuid default null, rate_text_value text default null,
  contact_email_value text default null, contact_phone_value text default null, website_url_value text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor_id uuid := public.current_person_id(); new_id uuid;
begin
  if not public.has_community_permission(target_tenant_id, 'community.services.manage_own')
    or not coalesce((select service_provider_posting_enabled from public.tenant_community_settings where tenant_id = target_tenant_id), false)
    or not public.owns_community_provider(target_tenant_id, target_provider_id)
  then raise exception 'Community service listing access is required'; end if;
  if nullif(btrim(category_value), '') is null or nullif(btrim(title_value), '') is null
    or nullif(btrim(description_value), '') is null
    or (nullif(btrim(contact_email_value), '') is null and nullif(btrim(contact_phone_value), '') is null and nullif(btrim(website_url_value), '') is null)
  then raise exception 'Category, title, description, and one contact method are required'; end if;
  insert into public.community_service_listings
    (tenant_id, provider_id, service_category, title, description, service_area_id, rate_text, contact_email, contact_phone, website_url, created_by_person_id, updated_by_person_id)
  values (target_tenant_id, target_provider_id, btrim(category_value), btrim(title_value), btrim(description_value), service_area_id_value,
    nullif(btrim(rate_text_value), ''), nullif(btrim(contact_email_value), ''), nullif(btrim(contact_phone_value), ''), nullif(btrim(website_url_value), ''), actor_id, actor_id)
  returning listing_id into new_id;
  return new_id;
end;
$$;

create or replace function public.community_service_moderation_snapshot(target_tenant_id uuid, result_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(entry) order by entry.updated_at desc), '[]'::jsonb)
  from (
    select listing.listing_id, listing.provider_id, provider.display_name as provider_name,
      listing.service_category, listing.title, listing.description, listing.status,
      listing.service_area_id, area.name as service_area_name, listing.rate_text,
      listing.contact_email, listing.contact_phone, listing.website_url,
      listing.moderation_reason, listing.created_at, listing.updated_at
    from public.community_service_listings listing
    join public.community_provider_profiles provider
      on provider.tenant_id = listing.tenant_id and provider.provider_id = listing.provider_id
    left join public.community_areas area
      on area.tenant_id = listing.tenant_id and area.area_id = listing.service_area_id
    where listing.tenant_id = target_tenant_id
      and listing.status in ('pending', 'active', 'suspended', 'rejected')
      and public.has_community_permission(target_tenant_id, 'community.services.moderate')
    order by listing.updated_at desc
    limit greatest(1, least(coalesce(result_limit, 50), 100))
  ) entry;
$$;

create or replace function public.review_community_service_listing(
  target_listing_id uuid, decision_value text, reason_value text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare listing_row public.community_service_listings%rowtype; actor_id uuid := public.current_person_id();
begin
  select * into listing_row from public.community_service_listings where listing_id = target_listing_id for update;
  if listing_row.listing_id is null then raise exception 'Service listing not found'; end if;
  if not public.has_community_permission(listing_row.tenant_id, 'community.services.moderate') then
    raise exception 'Community service moderation access is required';
  end if;
  if decision_value not in ('active', 'suspended', 'inactive', 'rejected') then
    raise exception 'Unsupported service listing decision';
  end if;
  if nullif(btrim(reason_value), '') is null then raise exception 'A moderation reason is required'; end if;
  update public.community_service_listings
    set status = decision_value, moderation_reason = btrim(reason_value), reviewed_by_person_id = actor_id,
        reviewed_at = now(), updated_by_person_id = actor_id, updated_at = now()
    where listing_id = target_listing_id;
  insert into public.tenant_audit_events
    (tenant_id, event_name, actor_type, actor_person_id, reason, correlation_id, resource_type, resource_id, metadata)
  values
    (listing_row.tenant_id, 'community.service_listing_reviewed', 'person', actor_id, btrim(reason_value),
     gen_random_uuid(), 'community_service_listing', target_listing_id::text,
     jsonb_build_object('decision', decision_value));
  return true;
end;
$$;

revoke all on function public.create_my_community_service_listing(uuid, uuid, text, text, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_my_community_service_listing(uuid, uuid, text, text, text, uuid, text, text, text, text) to authenticated;
revoke all on function public.community_service_moderation_snapshot(uuid, integer) from public, anon, authenticated;
grant execute on function public.community_service_moderation_snapshot(uuid, integer) to authenticated;
revoke all on function public.review_community_service_listing(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_community_service_listing(uuid, text, text) to authenticated;
