# Tenant Governance Context — Production Manual Test

## Purpose

Verify shared tenant governance remains neutral infrastructure while every product-specific action
names and isolates one tenant and one product. The test must not change operational product data.

## Tenant Scope

1. Open `https://admin.eshapp.com/governance` as a tenant owner with more than one tenant.
2. Confirm the header says **Tenant governance**, not Transportation or Community Administration.
3. Choose **Community Hub** in the tenant selector.
4. Confirm the governance panel repeats **Community Hub** under **Governance tenant**.
5. Confirm the page says every change applies only to that tenant.
6. Switch to Yahooemail and confirm the repeated tenant scope changes before any product control is
   used.

## Product Scope

1. Select Community Hub again.
2. Confirm entitled products appear as separate product-scope controls rather than a mutable
   Workspace field inside the enrollment form.
3. Select **Community**.
4. Confirm the page says **Community access governance** and explicitly names Community Hub.
5. Confirm only Community roles appear and only Community enrollments are listed.
6. Select **Transportation** on a tenant entitled to it.
7. Confirm the page says **Transportation access governance**, exposes only the Transportation
   administrator role, and lists no Community enrollment.

## Safe Enrollment Review

Without submitting a change, choose an available member and inspect the form:

1. The member comes from the active tenant only.
2. The role belongs to the selected product only.
3. The reason placeholder names the selected product.
4. The submit button says **Enroll in Community** or **Enroll in Transportation**.
5. Existing removal buttons name the selected product.
6. Switching product clears or recalculates the eligible member and role selection.

## Pass Criteria

- Tenant scope remains visible throughout governance.
- Exactly one product context is active for product access changes.
- No mixed-product enrollment list or role selector appears.
- Product status prompts name both the product and tenant.
- Product operations remain absent from governance.
- No database migration or environment change is required.
