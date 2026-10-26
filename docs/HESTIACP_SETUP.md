# RubricMaker — HestiaCP VPS Setup Guide

This guide covers everything needed to host RubricMaker on a VPS managed by **HestiaCP**. RubricMaker is a static React/TypeScript SPA — no Node.js runtime is needed in production. The built output is plain HTML, CSS, and JavaScript served by Nginx + Apache (HestiaCP's default stack) or Nginx only.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [VPS & HestiaCP Requirements](#2-vps--hestiacp-requirements)
3. [Create the Web Domain in HestiaCP](#3-create-the-web-domain-in-hestiacp)
4. [Enable SSL with Let's Encrypt](#4-enable-ssl-with-lets-encrypt)
5. [Web Server Configuration](#5-web-server-configuration)
    - [Nginx + Apache (default)](#51-nginx--apache-default)
    - [Nginx only (alternative)](#52-nginx-only-alternative)
6. [Node.js for Building (optional)](#6-nodejs-for-building-optional)
7. [Environment Variables](#7-environment-variables)
8. [First Deployment](#8-first-deployment)
9. [Automated CI/CD with GitHub Actions](#9-automated-cicd-with-github-actions)
10. [Supabase Setup (optional)](#10-supabase-setup-optional)
11. [Maintenance](#11-maintenance)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### On your local machine

- Git, Node.js 22+, npm
- SSH key pair (for deploying without a password)
- Access to the GitHub repository secrets (for CI/CD)

### On the VPS

- A fresh VPS with at least **1 GB RAM / 1 vCPU / 10 GB disk**  
  (Ubuntu 22.04 / 24.04 LTS or Debian 11 / 12 — all officially supported by HestiaCP)
- **HestiaCP** already installed. If not, run the official installer:

```bash
wget https://raw.githubusercontent.com/hestiacp/hestiacp/release/install/hst-install.sh
sudo bash hst-install.sh
```

The installer takes 5–10 minutes. Access the control panel at `https://YOUR_VPS_IP:8083`.

---

## 2. VPS & HestiaCP Requirements

| Component  | Minimum                  | Recommended        |
| ---------- | ------------------------ | ------------------ |
| RAM        | 1 GB                     | 2 GB               |
| vCPU       | 1                        | 2                  |
| Disk       | 10 GB                    | 20 GB              |
| OS         | Ubuntu 22.04 / Debian 12 | Ubuntu 24.04 LTS   |
| HestiaCP   | 1.8+                     | Latest stable      |
| Web server | Nginx + Apache 2.4       | Nginx + Apache 2.4 |

RubricMaker stores all data in the browser's **localStorage** by default; the Supabase integration is optional. The server only needs to serve static files — no database or backend server is required on the VPS.

---

## 3. Create the Web Domain in HestiaCP

### 3.1 Log into HestiaCP

Open `https://YOUR_VPS_IP:8083` in a browser and log in as `admin` (or another admin account).

### 3.2 Create a user for the domain (recommended)

Running each site under its own Unix user isolates it from other sites on the server.

1. Click **Edit User** (top right) or navigate to **Users → Add User**.
2. Fill in:
    - **Username:** `rubricmaker` (becomes the Unix account)
    - **Password:** choose a strong password
    - **Email:** an address for renewal alerts
3. Click **Save**.

> **Skip this step** if you want to host RubricMaker directly under the `admin` account. Replace `rubricmaker` with `admin` in every path below.

### 3.3 Add the web domain

1. Switch to the `rubricmaker` user (or stay as admin).
2. Click **Web → Add Web Domain**.
3. Fill in:
    - **Domain:** `rubricmaker.example.com`
    - Leave **Create DNS Zone** and **Create Mail Domain** ticked if you want them.
    - Under **Web Template**, leave the default (`default` or `proxy`).
4. Click **Save**.

HestiaCP creates:

- Unix user: `rubricmaker`
- Home directory: `/home/rubricmaker/`
- Web root: **`/home/rubricmaker/web/rubricmaker.example.com/public_html/`**
- Nginx + Apache vhost configs: `/home/rubricmaker/conf/web/rubricmaker.example.com/`

### 3.4 Point your DNS

In your DNS provider, add an **A record**:

```
rubricmaker.example.com.  IN  A  YOUR_VPS_IP
```

Allow up to 15 minutes for propagation before requesting an SSL certificate.

---

## 4. Enable SSL with Let's Encrypt

1. In HestiaCP, go to **Web** and click the **Edit** icon next to your domain.
2. Scroll to the **SSL** section.
3. Tick **Enable SSL for this domain**.
4. Tick **Use Let's Encrypt to obtain SSL certificate**.
5. Optionally tick **Enable automatic HTTPS redirect**.
6. Click **Save**.

HestiaCP obtains the certificate, configures Nginx and Apache to use it, and sets up automatic renewal via cron.

---

## 5. Web Server Configuration

RubricMaker uses React's **HashRouter** (`/#/route`), so the server never sees sub-routes. The configurations below add security headers, caching rules, and gzip compression for best performance.

### 5.1 Nginx + Apache (default)

HestiaCP's default stack runs **Nginx as a reverse proxy in front of Apache** (Apache listens on `127.0.0.1:8080`). Apache handles file serving and the `.htaccess` file controls SPA routing, security headers, and caching.

**Upload `deploy/.htaccess` into the web root** (the deploy script does this automatically — see §8). No changes to the auto-generated vhost files are needed for basic operation.

To additionally apply Nginx-level cache and security headers, copy the snippet file to the server:

```bash
scp deploy/nginx-hestiacp.conf \
    rubricmaker@YOUR_VPS_IP:/home/rubricmaker/conf/web/rubricmaker.example.com/nginx.ssl.conf_after
```

Then rebuild the Nginx config:

```bash
ssh rubricmaker@YOUR_VPS_IP "sudo hestia-nginx rebuild"
# or if that command isn't available:
ssh root@YOUR_VPS_IP "systemctl reload nginx"
```

> **What the `nginx.ssl.conf_after` file does:** HestiaCP appends `*.conf_after` files to the end of the matching `server {}` block. The file in `deploy/nginx-hestiacp.conf` adds security headers and 1-year cache rules for hashed static assets at the Nginx layer — before Apache even sees the request.

For Apache-level directives (an alternative to `.htaccess`), see `deploy/apache-hestiacp.conf`. Paste the `<Directory>` block into:

```
/home/rubricmaker/conf/web/rubricmaker.example.com/apache2.conf_after
```

Then rebuild:

```bash
ssh root@YOUR_VPS_IP "systemctl reload apache2"
```

### 5.2 Nginx only (alternative)

If you configured HestiaCP to use **Nginx only** (no Apache):

1. Open `deploy/nginx-hestiacp.conf`.
2. Scroll to the `NGINX-ONLY STACK` comment block at the bottom and uncomment it.
3. Replace `rubricmaker.example.com` and `/home/rubricmaker` with your actual values.
4. Place the file at `/home/rubricmaker/conf/web/rubricmaker.example.com/nginx.ssl.conf_after`  
   or paste the `server {}` block into HestiaCP's custom template.
5. Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Node.js for Building (optional)

You have two build strategies:

| Strategy                | Where the build runs | When to use                                                    |
| ----------------------- | -------------------- | -------------------------------------------------------------- |
| **Local build + rsync** | Your laptop          | Simplest; no Node on server needed                             |
| **Server-side build**   | VPS                  | Useful if CI/CD deploys source code instead of built artefacts |

### Option A — Local build (recommended)

No Node.js is needed on the server. See §8.

### Option B — Build on the server

Install Node.js 22 via NodeSource on the VPS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v22.x.x
```

Then on the server:

```bash
cd /home/rubricmaker/
git clone https://github.com/YOUR_ORG/RubricMaker.git app
cd app
npm ci
VITE_SUPABASE_URL="https://xxxx.supabase.co" \
VITE_SUPABASE_ANON_KEY="eyJ..." \
npm run build
cp -r dist/* /home/rubricmaker/web/rubricmaker.example.com/public_html/
```

---

## 7. Environment Variables

RubricMaker has two **optional** build-time environment variables. The app is fully functional without them — users can enter their own Supabase credentials in the Settings page.

| Variable                 | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `VITE_SUPABASE_URL`      | Pre-fills the Supabase URL in Settings      |
| `VITE_SUPABASE_ANON_KEY` | Pre-fills the Supabase anon key in Settings |

### Setting them for a local build

Create a `.env` file in the project root (never commit this file):

```bash
cp .env.example .env
# Edit .env and fill in your values
```

`.env.example`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The build command picks them up automatically:

```bash
npm run build
```

### Setting them in GitHub Actions

Add these repository secrets in **GitHub → Settings → Secrets and variables → Actions**:

| Secret name              | Value                                         |
| ------------------------ | --------------------------------------------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL (optional)          |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon (public) key (optional)    |
| `SUPABASE_PUBLIC_URL`    | Public URL of the Supabase API (optional)     |
| `VPS_HOST`               | Your VPS IP address or hostname               |
| `VPS_DOMAIN`             | Your domain, e.g. `rubricmaker.example.com`   |
| `VPS_SSH_KEY`            | Private key of the deploy key pair (see §9.1) |

The workflows deploy as `root` into the `rubricmaker` user's web root, so there is no `VPS_USER` secret; see §9 for using a different HestiaCP user.

---

## 8. First Deployment

### 8.1 Add your SSH public key to the server

On your local machine, if you don't have a key pair yet:

```bash
ssh-keygen -t ed25519 -C "rubricmaker-deploy"
# Default path: ~/.ssh/id_ed25519
```

Copy the public key to the server:

```bash
ssh-copy-id rubricmaker@YOUR_VPS_IP
# Or manually: append ~/.ssh/id_ed25519.pub to /home/rubricmaker/.ssh/authorized_keys
```

Test it:

```bash
ssh rubricmaker@YOUR_VPS_IP "echo connected"
```

### 8.2 Configure `deploy.sh`

The repository ships a template, `scripts/deploy.example.sh`. Copy it to the project root (`deploy.sh` is git-ignored, so your values are never committed):

```bash
cp scripts/deploy.example.sh deploy.sh
chmod +x deploy.sh
```

Fill in your values at the top of the file:

```bash
DOMAIN="rubricmaker.example.com"
VPS_USER="rubricmaker"
VPS_HOST="YOUR_VPS_IP"
SSH_KEY=""          # optional, e.g. ~/.ssh/id_ed25519
```

The HestiaCP web root is already the active `REMOTE_PATH` (`/home/${VPS_USER}/web/${DOMAIN}/public_html`); the Virtualmin line above it stays commented out. The script refuses to run while `DOMAIN` or `VPS_HOST` still hold the example values.

### 8.3 Run the deploy script

```bash
./deploy.sh
```

The script will:

1. Load the `VITE_*` values from `.env` (if present) and run `npm run build` to produce `dist/`
2. Rsync `dist/` → `/home/rubricmaker/web/rubricmaker.example.com/public_html/` on the VPS (with `--delete` to clean stale files)
3. Upload `deploy/.htaccess` → web root

### 8.4 Verify

Open `https://rubricmaker.example.com` in a browser. You should see the RubricMaker dashboard. Check:

- [ ] Page loads without a blank screen
- [ ] Navigation between pages works
- [ ] Browser console shows no 404 errors for JS/CSS assets
- [ ] `https://` padlock is shown (SSL active)

---

## 9. Automated CI/CD with GitHub Actions

Two jobs deploy to the VPS:

| Where                                               | When it runs                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy-hestiacp` job in `.github/workflows/ci.yml` | Automatically on a push to `main`, but only after **every** CI job passed (type-check, lint, unit tests, all e2e shards, Supabase e2e, the accessibility gate, bundle analysis) **and** the push changed app files. Docs- or CI-only pushes skip it. |
| `.github/workflows/deploy-hestiacp.yml`             | Manually only (**Actions → Deploy to HestiaCP VPS → Run workflow**), to deploy without waiting on CI.                                                                                                                                                |

Both run in the `production` GitHub environment (add required reviewers there under **Settings → Environments** if you want to approve each deploy) and do the same thing:

1. `npm ci` and `npm run build` on Node 24, with the `VITE_SUPABASE_*`, `SUPABASE_PUBLIC_URL` secrets and the `VITE_STRESS_TEST_LOGGING` variable.
2. Rsync `dist/` to `/home/rubricmaker/web/<VPS_DOMAIN>/public_html/` with `--delete`, connecting as **`root`**.
3. Rsync `deploy/.htaccess` into the same web root.

Both rsync steps pass `--chown=rubricmaker:rubricmaker`. Without it the files keep the runner's uid/gid 1001, which is `hestiamail` on a HestiaCP server, and a later HestiaCP domain rebuild can drop the default skeleton `index.html` back into the web root.

**Different HestiaCP user?** The user name `rubricmaker` is written into both workflows (`remote_path` and `--chown`). If your web domain belongs to another user, change it in both files.

### 9.1 Create a dedicated deploy SSH key

Generate a key pair that GitHub Actions will use (do **not** use your personal key):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/rubricmaker_deploy -N ""
```

Add the **public key** to **root's** `authorized_keys` on the VPS, since the workflows connect as `root`:

```bash
cat ~/.ssh/rubricmaker_deploy.pub | ssh root@YOUR_VPS_IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Use this key for deploys only. To limit what it can do, prefix its line in `authorized_keys` with `restrict` (no port, agent or X11 forwarding and no terminal; rsync still works).

Add the **private key** as a GitHub secret:

```
Secret name : VPS_SSH_KEY
Secret value: (paste the entire contents of ~/.ssh/rubricmaker_deploy, including the -----BEGIN----- lines)
```

### 9.2 Add the remaining secrets

Add these as repository secrets (**GitHub → repo → Settings → Secrets and variables → Actions → New repository secret**) or as secrets of the `production` environment (**Settings → Environments → production**); the deploy jobs can read both:

```
VPS_HOST   = YOUR_VPS_IP
VPS_DOMAIN = rubricmaker.example.com
VITE_SUPABASE_URL      = https://xxxx.supabase.co   (optional)
VITE_SUPABASE_ANON_KEY = eyJ...                     (optional)
SUPABASE_PUBLIC_URL    = https://supabase.example.com (optional)
```

### 9.3 Trigger a deployment

Push an app change to `main` and wait for CI to pass, or go to **Actions → Deploy to HestiaCP VPS → Run workflow** to deploy straight away.

### 9.4 Keep `.htaccess` in the build output (optional)

Place `deploy/.htaccess` in `public/` so Vite includes it in every build automatically. The workflows' separate "Upload .htaccess" step then becomes redundant (it is harmless to keep):

```bash
cp deploy/.htaccess public/.htaccess
```

Commit and push — from that point forward, every CI/CD run deploys the latest `.htaccess` as part of `dist/`.

---

## 10. Supabase Setup (optional)

RubricMaker works entirely offline (localStorage) without Supabase. Enable it only if you want cloud sync across devices or multi-user access.

### 10.1 Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) (free tier available).
2. Click **New project** and choose a region close to your VPS.
3. Note your **Project URL** and **anon public key** (Project Settings → API).

### 10.2 Run migrations

Apply all migrations using the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --include-all
```

This applies every file in `supabase/migrations/` in order. Keep `--include-all` on every later push too: one early migration (`20260617093844_delete_old_attachments_fn.sql`) has a timestamp version that sorts after all the numbered `NNN_` files, so once it is applied the CLI otherwise refuses newer numbered migrations as being older than the last remote version. The schema includes tables for rubrics, students, classes, grades, attachments, comment snippets, essays, speaking sessions, site configuration, and school/admin management.

If you prefer to apply migrations manually via the **SQL Editor**, open each file in `supabase/migrations/` in order (001 through the highest number) and run them sequentially, then run `20260617093844_delete_old_attachments_fn.sql` last — the same order the CLI uses. It defines the attachment-retention lookup that the `delete-old-attachments` cleanup relies on.

### 10.3 Configure auth

In Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://rubricmaker.example.com`
- **Redirect URLs:** `https://rubricmaker.example.com/#/`

Enable the sign-in providers you want under **Authentication → Providers**: Email (one-time code), Google, and Azure (Microsoft personal and Entra ID accounts). The login page shows one button per provider listed in the `auth_providers` row of `public.site_config`; see _Login providers_ in [SELF_HOSTING_OPS.md](SELF_HOSTING_OPS.md#login-providers).

### 10.4 Connect in the app

Users can enter credentials under **Settings → Database** inside RubricMaker, or you can pre-fill them at build time via the `VITE_SUPABASE_*` environment variables (§7).

---

## 11. Maintenance

This section covers the web domain. For the backend (migrations, edge functions, backups, the health-check script and recommended cron jobs) see the wiki page [HestiaCP: updates & maintenance](https://github.com/NesiciCoding/RubricMaker/wiki/HestiaCP-Maintenance) and [SELF_HOSTING_OPS.md](SELF_HOSTING_OPS.md).

### Updating the application

```bash
# Pull latest changes
git pull origin main

# Re-deploy
./deploy.sh
```

Or push to `main` and let CI deploy it once every check has passed (§9).

### Renewing the SSL certificate

HestiaCP renews Let's Encrypt certificates automatically via a cron job. To manually renew:

HestiaCP panel → **Web → Edit domain → SSL → Let's Encrypt → Save**  
(HestiaCP will trigger an immediate renewal attempt.)

Or via CLI as root:

```bash
sudo /usr/local/hestia/bin/v-add-letsencrypt-domain rubricmaker rubricmaker.example.com www.rubricmaker.example.com
```

### Checking web server logs

HestiaCP stores logs per domain inside the user's home directory:

```bash
# Nginx access / error logs
sudo tail -f /home/rubricmaker/web/rubricmaker.example.com/log/nginx.access.log
sudo tail -f /home/rubricmaker/web/rubricmaker.example.com/log/nginx.error.log

# Apache access / error logs
sudo tail -f /home/rubricmaker/web/rubricmaker.example.com/log/access.log
sudo tail -f /home/rubricmaker/web/rubricmaker.example.com/log/error.log
```

Or via the HestiaCP panel: **Web → domain → Log** icon.

### Disk usage

```bash
du -sh /home/rubricmaker/web/rubricmaker.example.com/public_html/
```

The built `dist/` is typically 3–6 MB.

---

## 12. Troubleshooting

### Blank page / white screen after deploy

- Check the browser console for 404 errors on `.js` / `.css` assets.
- Ensure Vite's `vite.config.ts` has `base: './'` (it does by default in this project) so asset paths are relative.
- Confirm files were actually uploaded:
    ```bash
    ls /home/rubricmaker/web/rubricmaker.example.com/public_html/
    ```

### HashRouter vs "page not found" errors

Because this app uses **HashRouter**, all navigation is encoded in the URL hash (`/#/route`). You will not hit 404 errors from the server when refreshing. If you do get 404s, confirm that `index.html` is in the web root.

### SSH key rejected during deploy

```bash
# Test connection manually
ssh -i ~/.ssh/rubricmaker_deploy rubricmaker@YOUR_VPS_IP "echo ok"

# Ensure the key is in authorized_keys on the server
cat /home/rubricmaker/.ssh/authorized_keys
```

### Apache `mod_headers` or `mod_rewrite` not enabled

```bash
sudo a2enmod headers rewrite
sudo systemctl reload apache2
```

### HestiaCP regenerates conf files after changes

HestiaCP may rebuild vhost configs when you save domain settings in the panel. Always use:

- `.htaccess` for Apache directives (persists because it's in `public_html/`), **or**
- The `*.conf_after` extension files under `/home/user/conf/web/domain/` — HestiaCP preserves these and includes them in every rebuild.

Never edit the auto-generated files in `/home/user/conf/web/domain/` directly (e.g., `apache2.conf`, `nginx.conf`) — HestiaCP will overwrite them.

### Files not updating after deploy (browser cache)

Vite hashes asset filenames by default (e.g. `index-abc123.js`), so browsers fetch new files automatically. If `index.html` itself is stale, clear the browser cache or add `Cache-Control: no-cache` for HTML files (already set in `deploy/.htaccess`).

### 502 Bad Gateway (Nginx + Apache stack)

This means Nginx can't reach Apache on port 8080:

```bash
# Check Apache is running
sudo systemctl status apache2

# Check it's listening on 8080
ss -tlnp | grep 8080

# Restart Apache
sudo systemctl restart apache2
```

---

## File Reference

| File                                    | Purpose                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/deploy.example.sh`             | Template for the local build + rsync deploy script; copy to `deploy.sh` (see §8.2)     |
| `deploy/.htaccess`                      | Apache SPA config, security headers, caching (works with both Virtualmin and HestiaCP) |
| `deploy/apache-hestiacp.conf`           | Apache `<Directory>` block for HestiaCP vhost extension (`apache2.conf_after`)         |
| `deploy/nginx-hestiacp.conf`            | Nginx snippet for HestiaCP (`nginx.ssl.conf_after`) + Nginx-only reference block       |
| `.github/workflows/ci.yml`              | CI; its `deploy-hestiacp` job deploys after every check passes on `main` (see §9)      |
| `.github/workflows/deploy-hestiacp.yml` | Manual deploy to HestiaCP that skips CI                                                |
| `.env.example`                          | Template for local environment variables                                               |
| `supabase/migrations/`                  | Database schema SQL files                                                              |
