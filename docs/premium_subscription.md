# Premium Subscription

Premium subscription data is stored in the `user` table and mirrored for dashboard
users.

Each `user` record includes:

- `premium_status` – boolean flag, `true` when the user has access.
- `premium_end_date` – optional expiry date.

Dashboard users can have structured subscription records in
`dashboard_user_subscriptions` with:

- `subscription_id` (UUID) – primary key.
- `dashboard_user_id` – references `dashboard_user`.
- `tier` – subscription tier label.
- `status` – current state (for example `active`, `pending`, `canceled`).
- `started_at` – start timestamp (defaults to `now()`).
- `expires_at` – expiry timestamp.
- `canceled_at` – optional cancelation timestamp.
- `metadata` – optional JSONB payload for provider details.

For quick access, `dashboard_user` also tracks:

- `premium_status` – boolean flag, `true` when the subscription is active.
- `premium_tier` – latest tier label.
- `premium_expires_at` – cached expiry timestamp.

Routes that validate dashboard-user access should first read the cached
`dashboard_user` columns and only fall back to `dashboard_user_subscriptions`
when detailed history is required.

## Data Access Helpers

- `src/model/dashboardSubscriptionModel.js` provides basic CRUD helpers:
  - `create`, `findActiveByUser`, `expire`, `cancel`, and `renew` rely on
    parameterized queries.
- `src/service/dashboardSubscriptionService.js` wraps subscription mutations
  in lightweight transactions and updates the cached premium fields on
  `dashboard_user` to keep login responses aligned with the latest state.

During dashboard login, premium status, tier, and expiry are attached to
the JWT payload using the cached columns or the latest active subscription.

### Dashboard session validation

Every dashboard API call rehydrates `req.dashboardUser`/`req.user` from
`dashboard_user` and `dashboard_user_clients` after JWT verification. Requests
are denied when the dashboard account no longer exists, is inactive, or has no
mapped clients, guaranteeing that premium checks always use the freshest client
scope and cached premium flags rather than potentially stale JWT claims.

### Dashboard premium guard middleware

- `src/middleware/dashboardPremiumGuard.js` enforces dashboard premium access on
  protected routes. The middleware reads `premium_status`, `premium_tier`, and
  `premium_expires_at` from `req.dashboardUser` and refreshes missing fields
  using `dashboardSubscriptionService.getPremiumSnapshot` to avoid stale or
  empty cache values.
- Expired subscriptions return HTTP 403 with a message describing the expired
  status. Allowed tiers can be passed as an array; a 403 is returned when the
  caller's normalized tier is not in the permitted list.
- A list of allowed tiers for dashboard routes can be configured via the
  `DASHBOARD_PREMIUM_ALLOWED_TIERS` env var (comma-separated, defaults to
  `tier1,tier2,premium_1`). Routes reuse this list to keep premium tier handling
  consistent across environments.
- Requests that pass the guard expose `req.premiumGuard` with
  `{ premiumStatus, premiumTier, premiumExpiresAt }` so downstream handlers can
  log or branch on the resolved subscription context without re-parsing the
  request.

## Expiry enforcement

- Mobile premium grants automatically set `premium_end_date` to 30 days after
  approval when `premiumService.grantPremium` is called. Expiry sweeps reset
  `premium_status` to `false` once the end date passes to keep access aligned
  with paid periods.
- `src/service/dashboardSubscriptionExpiryService.js` filters active subscription
  rows whose `expires_at` is past the current time, expires them through
  `expireSubscription`, refreshes the dashboard cache, and sends a WhatsApp
  alert via the gateway client when a destination number is available.
- `src/cron/cronDashboardSubscriptionExpiry.js` schedules the expiry sweep every
  30 minutes (Asia/Jakarta) using `scheduleCronJob`; the module is loaded through
  the cron manifest so WhatsApp readiness checks are honored before delivery.
- `src/service/premiumExpiryService.js` finds mobile users whose
  `premium_end_date` is in the past and revokes their premium flag.
- `src/cron/cronPremiumExpiry.js` runs daily at midnight (Asia/Jakarta) to call
  `processExpiredPremiumUsers`, ensuring mobile access windows close on time.

## Premium Request Workflow

Mobile users from the `pegiat_medsos_apps` can request a premium
subscription through the `/premium-requests` API. A request is created with the
name of the account holder, the account number and the originating bank. After
the user transfers the fee they upload the proof of payment and confirm the
request. Only at this confirmation stage does the system notify the
administrators via WhatsApp.
 
Administrators approve by replying `grantsub#<id>` or reject with
`denysub#<id>`. Approval sets `premium_status` to `true` for the user.

## Dashboard premium access requests (dashboard users)

Migration `20260601_recreate_dashboard_premium_request.sql` reinstates
`dashboard_premium_request` and `dashboard_premium_request_audit` to track
premium applications from dashboard users:

- `dashboard_premium_request` stores the request payload, payment proof, expiry
  deadline, and a unique `request_token` used in admin approvals.
- `dashboard_premium_request_audit` captures lifecycle transitions (`created`,
  `confirmed`, `approved`, `denied`, `expired`) with the acting dashboard user
  or admin WhatsApp ID.

### API workflow

- `POST /api/premium/request` (dashboard JWT required) creates a pending request
  with bank/account metadata and a default expiry window.
- `PUT /api/premium/request/:token/confirm` attaches payment proof, moves the
  request to `confirmed`, extends the expiry window, and notifies admins via
  WhatsApp (`sendDashboardPremiumRequestNotification`).
- `GET /api/premium/request/:token` returns the request for the authenticated
  dashboard user.
- `GET /api/premium/request/latest` returns the latest `pending`/`confirmed`
  request for the authenticated dashboard user (identified from the dashboard
  JWT). When no open request exists it returns a success payload with
  `hasOpenRequest: false` so the frontend can disable the “Ajukan” button
  without showing an error.
- The `/api/premium/request/latest` route is registered before the tokenized
  lookup to prevent the literal path segment `latest` from being parsed as a
  `request_token`. This avoids database errors from UUID parsing when clients
  query the endpoint.
- Duplicate submissions are blocked: if a user already has a `pending` or
  `confirmed` request that has not expired, `POST /api/premium/request` returns
  HTTP 409 with a message indicating the previous request is still being
  processed so the frontend can surface the warning.
- When a dashboard user creates a request, the service reloads their profile
  through `dashboardUserModel.findById` to obtain the permitted `client_ids`.
  The `client_id` written to the request (and sent in notifications) is resolved
  from that list: an explicit payload value must be included in `client_ids`,
  a single allowed client is chosen automatically, and unknown or missing
  values are rejected.
- When admins approve or deny via WhatsApp commands, identifiers are treated as
  `dashboard_user_id` values only when they are valid UUIDs; other strings fall
  back to username lookups to avoid database errors from invalid UUID inputs.
- When creating a request, the service re-fetches the dashboard user profile by
  `dashboard_user_id` to populate `username` and `whatsapp`, ensuring the insert
  never writes a `NULL` username even if the JWT payload is missing fields.

On approval, `dashboardPremiumRequestService.approveDashboardPremiumRequest`
creates an active `dashboard_user_subscriptions` row, refreshes cached premium
flags on `dashboard_user`, and records the audit entry. Denials are persisted
with `denied` status and an audit log entry. WhatsApp approvals (`grant access` /
`grantdashsub`) always apply a 30-day expiry from the approval timestamp and
ignore any `subscription_expires_at` included in the request payload to keep
access windows consistent for chat-based grants.

### WhatsApp commands

Admins can respond to confirmed requests directly from WhatsApp:

- Approve (new format): `grant access#<username>` (or `grant access#<dashboard_user_id>`)
- Deny (new format): `deny access#<username>` (or `deny access#<dashboard_user_id>`)
- Legacy format (still supported): `grantdashsub#<request_token>` or `denydashsub#<request_token>`

Admin broadcast now fires as soon as a request is created (pending), so Ditbinmas
admins see the submission immediately even if the requester has not uploaded a
payment proof yet. The confirmation step still updates the request to `confirmed`
and will only re-send the WhatsApp broadcast if the initial send failed (a guard
prevents double delivery when proof is uploaded later).

Confirmation messages sent to admins include the token, client, tier, transfer
amount, and proof URL to streamline verification. Pending requests call out the
missing proof explicitly.

Admin notifications now include the full payment payload so approvers can verify
the transfer before replying. The message template is:

```
📢 permintaan akses premium

User dashboard:
- Username: <username>
- WhatsApp: <wa_id>
- Dashboard User ID: <dashboard_user_id>

Detail permintaan:
- Tier: <premium_tier>
- Client ID: <client_id>
- Username (request): <username>
- Dashboard User ID (request): <dashboard_user_id>
- Request Token (request): <request_token>
- Status Bukti Transfer: <sudah upload bukti transfer|belum upload bukti transfer>

Detail transfer:
- Bank: <bank_name>
- Nomor Rekening: <account_number>
- Nama Pengirim: <sender_name>
- Jumlah Transfer: Rp <amount>
- Bukti Transfer: <proof_url|Belum upload bukti>

Request ID: <request_id>

Balas dengan <response pesan grant access#<username>> untuk menyetujui atau
<response pesan deny access<username>> untuk menolak.
```

Only WhatsApp IDs configured in `ADMIN_WHATSAPP` are allowed to execute these
commands. Attempts from other senders are rejected and logged, and audit entries
store the validated admin WhatsApp ID so subscription history always reflects an
authorized actor.

### Expiry enforcement

- `expireDashboardPremiumRequests` marks pending/confirmed rows as `expired` once
  `expired_at` is reached, writes an audit row, and returns the affected
  requests.
- `src/cron/cronDashboardPremiumRequestExpiry.js` runs hourly (Asia/Jakarta),
  notifying requesters via the gateway client and sending an admin summary via
  `sendWAReport`.

## Frontend status check before submitting a new request

Dashboard clients should check whether a user already has an in-flight premium
request before enabling the submission UI. Use the authenticated dashboard
token and call:

```
GET /api/premium/request/latest
Authorization: Bearer <dashboard JWT>
```

Possible responses:

- Open request exists:

```json
{
  "success": true,
  "hasOpenRequest": true,
  "request": {
    "request_id": "<uuid>",
    "request_token": "<token>",
    "dashboard_user_id": "<dashboard_user_id>",
    "status": "pending" | "confirmed",
    "client_id": "<client_id>",
    "username": "<username>",
    "bank_name": "<bank>",
    "account_number": "<account>",
    "sender_name": "<sender>",
    "transfer_amount": 100000,
    "premium_tier": "gold",
    "proof_url": "<url|null>",
    "expired_at": "<iso timestamp>",
    "metadata": { "...": "..." }
  }
}
```

- No open request (preferred for disabling the button):

```json
{
  "success": true,
  "hasOpenRequest": false,
  "request": null
}
```

If the caller needs to fetch a specific token (for example, a bookmarked link),
`GET /api/premium/request/:token` remains available and returns `404` when the
token does not belong to the authenticated dashboard user.
