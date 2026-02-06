# Nginx/Reverse Proxy Configuration
*Last updated: 2025-06-25*

This document provides a basic configuration example for running **Cicero_V2** behind `nginx` or another reverse proxy. The setup is optional but helps prevent direct access to the application port.

## 1. Prerequisites

- The application is running with `npm start` on the port defined in `.env` (default `3000`).
- Nginx is installed on the server.

## 2. Example Configuration

Create a configuration file such as `/etc/nginx/sites-available/cicero` and add:

```nginx
server {
    listen 80;
    server_name example.domain.com;

    location / {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Enable the configuration:

```bash
sudo ln -s /etc/nginx/sites-available/cicero /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The above forwards all requests on port 80 to the Node.js app running on `localhost:3000`.

## 3. HTTPS (Optional)

If using HTTPS, configure a certificate via `certbot` or another provider. Update the `server` block with `listen 443 ssl;` and the appropriate `ssl_certificate` options.

## 4. Further Reference

See [docs/server_migration.md](server_migration.md) for a complete guide to preparing a new server.
