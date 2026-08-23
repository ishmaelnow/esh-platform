# Product Workspace Foundation — Production Manual Test

Run after Migration 2 has passed its dark-rollout test and Migration 3 has been applied. All checks
below are read-only.

## 1. Catalog and tenant coverage

```sql
select workspace_key, display_name from public.product_workspace_catalog order by sort_order;

select workspace_key, status, count(*)
from public.tenant_product_workspaces
group by workspace_key, status
order by workspace_key, status;
```

Expected: exactly `transportation` and `community`; existing tenants have Transportation enabled
and Community disabled.

## 2. Compatibility backfill and separation

```sql
select e.workspace_key, r.role_key, count(*)
from public.tenant_workspace_enrollments e
join public.tenant_workspace_role_assignments r using (enrollment_id, tenant_id, workspace_key)
where e.status = 'active' and r.status = 'active'
group by e.workspace_key, r.role_key
order by e.workspace_key, r.role_key;
```

Expected: existing owner/admin access appears as `transportation / transportation_admin`. There
must be no Community rows before deliberate enrollment.

```sql
select count(*) as community_enrollments
from public.tenant_workspace_enrollments
where workspace_key = 'community';
```

Expected: `0`.

## 3. No Rider/Driver coupling

```sql
select count(*) as rider_or_driver_without_explicit_community_enrollment
from public.tenant_memberships membership
where exists (
  select 1 from public.rider_profiles rider
  where rider.tenant_id = membership.tenant_id and rider.person_id = membership.person_id
)
or exists (
  select 1 from public.driver_profiles driver
  where driver.tenant_id = membership.tenant_id and driver.person_id = membership.person_id
);
```

This establishes the comparison population. Independently confirm the Community enrollment count
remains zero; Rider/Driver records must not create Community rows.

## 4. Existing Admin regression

Sign in to `https://admin.eshapp.com` as the existing Yahooemail administrator. Confirm the current
Transportation administration remains available. Community must remain hidden while its workspace
and capability are disabled. Rider and Driver portals must remain unchanged.

Record SQL output and UI observations. Do not enable Community or create an enrollment during this
dark-rollout test.
