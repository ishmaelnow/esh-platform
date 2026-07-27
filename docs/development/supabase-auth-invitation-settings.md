# Supabase Auth Settings for Invitations

Tenant invitations use two separate email systems:

- Resend sends application invitation emails.
- Supabase Auth sends account confirmation and password recovery emails.

Do not send password-reset or auth-confirmation emails through Resend in V1.

## V1 Email Confirmation Decision

V1 does not bypass Supabase Auth confirmation settings.

For local and pilot environments, the simplest supported setup is:

- Email confirmation may be disabled in Supabase Auth for faster pilot onboarding.
- If email confirmation is enabled, newly invited users must confirm through the Supabase Auth email
  before they can accept the invitation.

The application handles this by requiring an authenticated Supabase session before acceptance. If
Supabase returns no session after signup, the user is told to check email and reopen the invitation.

## Required Local URLs

Set the Supabase Auth Site URL to:

```text
http://localhost:3000
```

Add these Redirect URLs:

```text
http://localhost:3000/invite/accept
http://localhost:3000/auth/reset-password
http://localhost:3000/**
```

If Tenant Administration runs on a separate local port, also allow:

```text
http://localhost:3001/**
```

## Future Production URLs

When production domains are selected, add:

```text
https://admin.example.com/invite/accept
https://admin.example.com/auth/reset-password
https://admin.example.com/**
https://tenant.example.com/**
```

The exact production domains may change. Keep `INVITATION_BASE_URL` and `TENANT_ADMIN_BASE_URL`
environment-driven.

Driver applicant email verification returns to the tenant-specific application page. Add this production
Supabase Auth redirect pattern:

```text
https://admin.eshapp.com/apply/driver/**
```

Use explicitly authorized origins for preview deployments rather than arbitrary redirect destinations.

## Password Recovery

Password recovery starts from the invitation page. The app asks Supabase Auth to send the recovery
email and passes this redirect URL:

```text
{INVITATION_BASE_URL}/auth/reset-password?token={invitation-token}
```

After the password update succeeds, the user is sent back to:

```text
/invite/accept?token={invitation-token}
```
