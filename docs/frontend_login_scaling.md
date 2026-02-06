# Frontend Login Scaling Scenario

*Last updated: 2025-02-17*

This guide describes a secure approach for handling login and registration on the web dashboard. It introduces a dedicated table `dashboard_user` so credentials are separated from the existing `user` table. The workflow aligns with the current JWT authentication model used across Cicero_V2.

## 1. Database Table

```sql
CREATE TABLE dashboard_user (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status BOOLEAN DEFAULT TRUE,

  client_id VARCHAR REFERENCES clients(client_id),
  whatsapp TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

- `user_id` is generated with `uuid.v4()`.
- `password_hash` stores a bcrypt hash of the plaintext password.
- `role` can be `admin`, `operator` or other roles required by the dashboard.
- `status` is `true` when the account is active. Admin registrations start as `false` and must be approved via WhatsApp.

 - `client_id` links an account to a specific organisation if needed.
 - `whatsapp` stores the contact number for operator verification as digits only with a `62` prefix (minimum 8 digits; no `@c.us` suffix stored).

## 2. Registration Endpoint

Expose `/api/auth/dashboard-register`:

1. Validate `username`, `password`, `whatsapp` and optional `role` and `client_id`.
2. Ensure the username is unique in `dashboard_user`.
3. Hash the password with `bcrypt.hash` and insert the new row with `status=false`.
4. Send a WhatsApp notification to administrators containing the username, ID, role, WhatsApp number, and client ID. They can approve using `approvedash#<username>` or reject with `denydash#<username>`.
5. Return `201 Created` with the new `user_id` and current status.


## 3. Login Endpoint

Expose `/api/auth/dashboard-login`:

1. Validate `username` and `password`.
2. Fetch the record from `dashboard_user` and verify the password with `bcrypt.compare`.
3. Load premium cache columns (`premium_status`, `premium_tier`, `premium_expires_at`)
   from `dashboard_user`. If the cache is empty or expired, fetch the latest
   `active` record from `dashboard_user_subscriptions` to refresh the cache before
   proceeding.
4. If `premium_status` is `false` or `premium_expires_at` is in the past, reject
   the login with a `402 Payment Required` payload that contains the user id,
   detected tier, and suggested renewal steps.
5. On success generate a JWT containing `user_id`, `role`, and the premium fields
   so the frontend can gate premium-only pages without another lookup.
6. Store the token in Redis with a two-hour expiry and return it in the response
   and as a `token` cookie. Add the premium fields to the JSON response body.
7. Every successful login is reported to administrators via WhatsApp for auditing
   purposes. Include the premium tier and expiry in the audit text for quick
   triage when a renewal is close to expiration.

## 4. Middleware

Create `verifyDashboardToken` to protect private routes:

1. Check the `Authorization` header or `token` cookie.
2. Verify the JWT using `process.env.JWT_SECRET` and confirm the token exists in Redis.
3. Attach `req.dashboardUser` to the request object on success.

## 5. Client-Specific Requests

Operators who manage multiple clients can pass a `client_id` query parameter when calling endpoints that operate on a specific client's data, for example:

```
GET /api/analytics?client_id=demo_client
```

This parameter lets the dashboard switch contexts without requiring separate logins.

## 6. Premium Login Flow

Premium checks extend the login endpoint so dashboards can enforce entitlements:

1. Read cached premium flags from `dashboard_user`. If `premium_status` is `true`
   and `premium_expires_at` is in the future, continue without extra lookups.
2. Otherwise, query `dashboard_user_subscriptions` for the latest `active`
   interval ordered by `expires_at DESC`. Refresh the cache columns from the row
   when found; if none are active mark the cache as inactive.
3. If the refreshed data shows an expired or missing subscription, return a
   `402` error that includes `premium_status`, `premium_tier`, `premium_expires_at`,
   and a `renewal_url` so the frontend can redirect users to the billing page.
4. When the subscription is valid but expires within seven days, attach
   `premium_renewal_hint` to the login response so the UI can display a warning
   banner without blocking access.

## 7. Scaling Notes

- Use HTTPS in production and enforce rate limiting on the login routes.
- Store active tokens in Redis so the backend can invalidate sessions at any time.
- Index `username` and `user_id` in the database to keep lookups fast when the number of users grows.
- Log login attempts to monitor suspicious behaviour and audit access.

This setup mirrors the `penmas_user` flow and fits the current architecture, allowing the web frontend to scale independently from the mobile app login system.
