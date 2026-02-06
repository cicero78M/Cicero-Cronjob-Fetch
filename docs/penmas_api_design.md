# Penmas News Backend Design
*Last updated: 2025-08-30*

This document proposes a basic backend structure to support the **Penmas News** Android app. The application currently stores data in `SharedPreferences`. The following design migrates those records to a PostgreSQL database and exposes RESTful endpoints.

## Database Schema

### `users`
Stores login credentials and profile data.

```sql
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL, -- penulis/editor
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `editorial_event`
Events from the editorial calendar.

```sql
CREATE TABLE editorial_event (
  event_id SERIAL PRIMARY KEY,
  event_date TIMESTAMP NOT NULL,
  topic TEXT NOT NULL,
  judul_berita TEXT,
  assignee VARCHAR(50),
  status VARCHAR(20) DEFAULT 'draft',
  content TEXT,
  summary TEXT,
  image_path TEXT,
  tag TEXT,
  kategori TEXT,
  created_by INTEGER REFERENCES users(user_id),
  updated_by INTEGER REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

The `tag` and `kategori` columns store optional keywords and category labels
submitted by the Android client.

The `event_date` column uses a timestamp so the schedule can include time of day.
In list views, the API returns `event_date` formatted as `dd/mm/yyyy`.

### `approval_request`
Records waiting for editor approval.

```sql
CREATE TABLE approval_request (
  request_id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES editorial_event(event_id),
  requested_by INTEGER REFERENCES users(user_id),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `change_log`
Tracks changes to articles.

```sql
CREATE TABLE change_log (
  log_id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES editorial_event(event_id),
  user_id INTEGER REFERENCES users(user_id),
  status VARCHAR(20),
  changes TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Data Migration Steps

1. Extract the JSON arrays from `SharedPreferences` (`editorial_events`, `approval_requests`, and `change_logs`).
2. For each item, insert a row into the corresponding table above. Use a one-off script or an Android `WorkManager` task that runs once.
3. After verifying the migration, remove the local storage calls and rely solely on the API.

## REST Endpoints

### Authentication
- `POST /api/auth/penmas-login` – body: `{ username, password }` → returns `{ success, token, user }`.
- `POST /api/auth/penmas-register` – body: `{ username, password, role }` → returns `{ success, user_id }`.

### Editorial Calendar
- `GET /api/events` – list events created by or assigned to the authenticated user.
- `POST /api/events` – create a new event.
- `PUT /api/events/:id` – update an event.
- `DELETE /api/events/:id` – remove an event.

### Approval Workflow
- `GET /api/approvals` – list pending approval requests.
- `POST /api/approvals` – create a new approval request for an event.
- `PUT /api/approvals/:id` – update the status (`approved`/`rejected`).

### Change Logs
- `GET /api/events/:id/logs` – view change history for an event.
- `POST /api/events/:id/logs` – append a new log entry.

All routes require JWT authentication except registration and login. Roles (`penulis`, `editor`) determine access permissions.

