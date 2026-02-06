# Backend Login Best Practices for PenmasNews
*Last updated: 2025-07-16*

This document outlines a recommended workflow to implement a dedicated user login system for the **PenmasNews** Android application. The backend uses Node.js/Express and follows the structure of the Cicero_V2 project.

## 1. Create a `penmas_user` Table

- Table name: `penmas_user`
- Columns:
  - `user_id` (primary key, string)
  - `username` (unique, string)
  - `password_hash` (string)
  - `role` (enum: `penulis`, `editor`, `admin`)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

Use `bcrypt` to hash passwords before storing them.

```sql
CREATE TABLE penmas_user (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 2. Register Endpoint

Expose `/api/auth/penmas-register` in `src/routes/authRoutes.js`.

1. Validate `username`, `password`, and optionally `role` from the request body.
2. Ensure the username is not already taken in `penmas_user`.
3. Generate a `user_id` using `uuid.v4()` and hash the password with `bcrypt.hash`.
4. Insert the new record into `penmas_user` and return `201 Created` with the `user_id`.

Example payload:

```json
{
  "username": "@papiqo",
  "password": "12345",
  "role": "penulis"
}
```

## 3. Login Endpoint

Expose `/api/auth/penmas-login` in `src/routes/authRoutes.js`.

1. Validate `username` and `password` from the request body.
2. Retrieve the user from `penmas_user` and compare the password hash using `bcrypt.compare`.
3. On success, generate a JWT containing `user_id` and `role`.
4. Store the token in Redis with a two‑hour expiry and return it in the response and a `token` cookie.

Example payload:

```json
{
  "username": "@papiqo",
  "password": "12345"
}
```

## 4. Middleware Protection

Create middleware `verifyPenmasToken` in `src/middleware`:

1. Check `Authorization: Bearer <token>` or the `token` cookie.
2. Verify the JWT using `process.env.JWT_SECRET`.
3. Ensure the token exists in Redis.
4. Attach `req.penmasUser` with the user info on success.
5. Respond with HTTP `401` if invalid.

Apply this middleware to private PenmasNews routes.

## 5. Logout Endpoint

Provide `/api/auth/penmas-logout` to delete the token from Redis and clear the cookie.

## 6. Token Renewal

When the token is close to expiry, allow the client to hit `/api/auth/penmas-refresh` to obtain a new token. Validate the old token, issue a new one, and update Redis.

## 7. Best Practices

- Use HTTPS in production to protect credentials and cookies.
- Limit login attempts to mitigate brute force attacks.
- Use secure password policies and rotate JWT secrets periodically.
- Keep `JWT_SECRET` and database credentials in `.env` files and never commit them.
- Add indexes on `username` and `user_id` for efficient lookup.
- Log successful and failed logins in a separate table for auditing.

Follow the conventions described in [docs/login_api.md](login_api.md) and keep function names in camelCase as defined in [docs/naming_conventions.md](naming_conventions.md).
