# Server Migration Guide
*Last updated: 2025-06-25*

This document explains how to move the **Cicero_V2** application to a new server. It is intended for system administrators so the migration is safe and no data is lost.

## 1. Preparation

1. **Back up the database** using `pg_dump` or a similar tool.
2. **Record environment variables** from the old `.env` file (database credentials, API tokens, Redis configuration, etc.).
3. Make sure the Node.js version on the new server is compatible with the project (`package.json`).

## 2. Setting Up the New Server

1. Install basic dependencies: `git`, `node`, `npm`, and `postgresql` or your chosen database.
2. Clone this repository to a directory of your choice:
   ```bash
   git clone https://github.com/cicero78M/Cicero_V2.git
   ```
3. Copy the `.env` file from the old server to the project root.
4. Run `npm install` to download dependencies.
5. Import the database backup:
   ```bash
   psql -U <user> -d <dbname> -f backup.sql
   ```
6. Adjust `nginx`/reverse proxy configuration if used (see [docs/reverse_proxy_config.md](reverse_proxy_config.md)).

## 3. Deploying the Application

1. Run the build script or simply `npm start` if no build step is needed.
2. Test all endpoints and the dashboard to ensure data reads correctly.
3. If background processes (cron) are used, make sure they are active on the new server.

## 4. Switching Services

1. Stop the application on the old server to prevent duplicate writes.
2. Point the DNS or public IP to the new server.
3. Monitor application logs and the dashboard to ensure there are no errors.

## 5. Rollback

Keep the original backup for a few days. If major issues arise, restore the backup to the old server or a new instance following the steps above.

---

See [enterprise_architecture](enterprise_architecture.md) for system architecture details.
