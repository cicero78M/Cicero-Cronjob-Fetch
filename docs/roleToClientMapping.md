# Role to Client Behavior

This guide outlines how session roles map to client data and how the `roleFlag` option scopes dashboard reports.

## Roles

- **admin** – unrestricted; can request data for any client. Rekap handlers receive `roleFlag: 'admin'` and treat it as unfiltered access.
- **Directorate roles** (e.g. `DITBINMAS`, `DITLANTAS`, `BIDHUMAS`, `DITSAMAPTA`) – `session.role` equals the directorate ID. Rekap handlers aggregate across subordinate clients and use `roleFlag` to query with `getUsersByDirektorat`.
- **Client roles** – regular users tied to specific clients. Their `session.role` is forwarded as `roleFlag` so rekap handlers call `getUsersByClient(clientId, roleFlag)` and limit results to that role.
- **operator** – dashboard stats are always scoped to `req.user.client_id`. Any `client_id` provided in query string or headers is ignored, and missing `client_id` on the session is rejected.
- **Directorate normalization** – when a dashboard user only has satu `client_id` bertipe `direktorat`, `session.role` dan JWT `role` akan diset ke `client_id` tersebut dalam lowercase (mis. `DITSAMAPTA` → `ditsamapta`). Kombinasi peran lain tidak menimpa normalisasi ini.

## Dashboard flow

1. `dashRequestHandlers` stores the current role on `session.role`.
2. `performAction` passes this value as `roleFlag` to the selected rekap handler.
3. Rekap handlers use `roleFlag` to filter users: either by client (`getUsersByClient`) or directorate (`getUsersByDirektorat`).
4. If `session.role` is missing, the handlers fall back to `session.user.role` ensuring accurate filtering.

Maintaining this mapping guarantees that each dashboard user sees only the content permitted for their role.

### User directory and listing endpoints

`GET /users/list` now recognizes `client_id=DITSAMAPTA` the same way as other directorate clients. Requests targeting `DITSAMAPTA` are routed through `getUsersByDirektorat`, so admins and directorate users can pull directory listings for DITSAMAPTA-flagged accounts without using the ORG client alias.

Operators are also allowed to call `GET /users/list`. The handler now supports multi-client operator tokens: if a `client_id` query param is provided it must match (case-insensitive) one of the `req.user.client_ids`, otherwise a single `client_id` in the token is used as the default. Requests for a `client_id` outside the token list are rejected with HTTP 403 (`client_id tidak diizinkan`) to keep listings scoped to authorized clients.

Operator UI flows that create users are supported by the operator allowlist in `authMiddleware`. Operator tokens may access `POST /users` (mounted as `POST /api/users`) and `POST /users/create` so the user creation screen can submit either route without triggering the operator `403 Forbidden` guard.

Operator tokens can also update a user record via `PUT /users/:id`. The auth middleware now allows operator requests when the method is `PUT` and the path matches `/users/<id>`; other `/users/*` paths still rely on the explicit allowlist entries above.

`GET /users/list` also honors the `scope` and `role` query params when present. Use `scope=DIREKTORAT` to return all personnel who carry the requested directorate role (`role=ditbinmas`, `role=ditlantas`, `role=bidhumas`, or `role=ditsamapta`). Use `scope=ORG` to return personnel whose `client_id` matches the request and who also have the requested role. Invalid directorate roles return HTTP 400.

The listing payload now includes `regional_id` (sourced from the matched `clients` row) for each user entry, so directory consumers can identify the regional scope alongside `client_id`.

`GET /users/by-client/:client_id` and `GET /users/by-client-full/:client_id` always pass the authenticated `role` as `roleFilter`. For operator logins this forces the user query to require `role_name = 'operator'` in `user_roles`, ensuring the response only includes operator personnel tied to the requested client. Operator requests must also target a `client_id` that exists in `req.user.client_id` or `req.user.client_ids`; otherwise the API returns HTTP 403.

Example error response:

```json
{
  "success": false,
  "message": "client_id tidak diizinkan"
}
```
