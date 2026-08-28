# Community service directory

The service directory is a typed Community domain, separate from ordinary feed posts. Listings belong to a tenant and a verified/provider profile, and may optionally reference a Community service area. A member/provider can submit a listing only when the tenant enables provider posting and the caller owns the provider profile. New listings are `pending` and never appear in the public directory until a Community moderator approves them.

The directory is exposed through a security-definer snapshot RPC, with tenant, Community capability, active-provider, active-listing, and product-session checks. Moderators review listings through a separate RPC that records reviewer, timestamp, reason, and an immutable tenant audit event. SMS, payment, advertising, reviews, and booking remain deferred.
