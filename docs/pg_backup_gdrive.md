# PostgreSQL Backup Automation to Google Drive
*Last updated: 2025-06-25*

This guide explains how to back up a PostgreSQL database to Google Drive using `cron` and `rclone`.

## Documentation Outline

1. Prerequisites
2. Install and configure rclone
3. Create a backup script
4. Manual testing
5. Schedule a cron job
6. Troubleshooting
7. Summary

---

### 1. Prerequisites

* Shell access on a Linux server (Ubuntu/Debian).
* PostgreSQL installed with database `cicero_db` hosted on `localhost:5432`.
* A PostgreSQL account `cicero` with privileges on `cicero_db`.
* Tools required: `pg_dump`, `gzip`, `rclone`, and `cron`.

---

### 2. Install and Configure rclone

1. **Install**
   ```bash
   curl https://rclone.org/install.sh | sudo bash
   ```
2. **Configure the remote**
   ```bash
   rclone config
   ```
   - Choose `n` to create a new remote named `GDrive`.
   - Select storage type `drive`.
   - When asked `Use auto config?`, choose `n` and follow the verification steps from your browser.
3. **Verify**
   ```bash
   rclone listremotes
   rclone ls GDrive:backups/postgres
   ```

---

### 3. Create the Backup Script

Create `/usr/local/bin/pg_backup.sh` with the following content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
backup_dir="/var/backups/postgres"
REMOTE="GDrive:backups/postgres"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="cicero"
DB_NAME="cicero_db"

DATE=$(date +"%Y-%m-%d_%H%M")
FILENAME="${DB_NAME}_${DATE}.sql.gz"
PG_DUMP_BIN="/usr/bin/pg_dump"
RCLONE_BIN="/usr/bin/rclone"

mkdir -p "${backup_dir}"
"${PG_DUMP_BIN}" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "${backup_dir}/${FILENAME}"
"${RCLONE_BIN}" copy "${backup_dir}/${FILENAME}" "$REMOTE" --quiet
find "${backup_dir}" -type f -name "${DB_NAME}_*.sql.gz" -mtime +7 -delete

echo "Backup ${FILENAME} completed at $(date)" >> "${backup_dir}/backup.log"
```

Make it executable:

```bash
sudo chmod 755 /usr/local/bin/pg_backup.sh
```

---

### 4. Manual Script Test

Run the script as the user that owns the rclone config:

```bash
sudo -u gonet /usr/local/bin/pg_backup.sh
```
Verify the results:

```bash
ls -lh /var/backups/postgres
tail -n 5 /var/backups/postgres/backup.log
rclone ls GDrive:backups/postgres
```

---

### 5. Schedule the Cron Job

Edit the `gonet` user's crontab:

```bash
crontab -u gonet -e
```
Add the following line to run daily at 02:30:

```cron
30 2 * * * /usr/local/bin/pg_backup.sh >> /var/backups/postgres/cron.log 2>&1
```
Ensure the cron service is active:

```bash
sudo systemctl enable --now cron
systemctl status cron
```

For quick testing you can temporarily set the schedule to `* * * * *` and monitor the log.

---

### 6. Troubleshooting

* **`didn't find section in config file`** – run the script with the same user used during rclone configuration.
* **`command not found`** – check the paths for `pg_dump` and `rclone`.
* **Empty logs** – append `>> cron.log 2>&1` to capture errors.
* **Permissions** – ensure the backup directory is writable by the cron user.
* **Cron not triggering** – check `/var/log/syslog` or `grep CRON /var/log/syslog`.

---

### 7. Summary

Following these steps you will:

* Install and configure rclone for Google Drive.
* Create an automated PostgreSQL backup script with compression.
* Upload the results to Google Drive and remove local backups older than seven days.
* Schedule the script via cron with logging and rotation.

Your backup system will then run automatically and safely archive your data in the cloud.
