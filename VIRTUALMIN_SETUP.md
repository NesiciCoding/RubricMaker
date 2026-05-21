# RubricMaker — Virtualmin VPS Setup Guide

This guide covers everything needed to host RubricMaker on a VPS managed by **Virtualmin**. RubricMaker is a static React/TypeScript SPA — no Node.js runtime is needed in production. The built output is plain HTML, CSS, and JavaScript served by Apache or Nginx.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [VPS & Virtualmin Requirements](#2-vps--virtualmin-requirements)
3. [Create the Virtual Server in Virtualmin](#3-create-the-virtual-server-in-virtualmin)
4. [Enable SSL with Let's Encrypt](#4-enable-ssl-with-lets-encrypt)
5. [Web Server Configuration](#5-web-server-configuration)
   - [Apache (default)](#51-apache-default)
   - [Nginx (alternative)](#52-nginx-alternative)
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
  (Ubuntu 22.04 LTS or Debian 12 recommended — both are well-tested with Virtualmin)
- **Virtualmin GPL** already installed. If not, run the official installer:

```bash
wget -O install.sh https://software.virtualmin.com/gpl/scripts/virtualmin-install.sh
sudo sh install.sh
```

  The installer takes 5–10 minutes. Access the control panel at `https://YOUR_VPS_IP:10000`.

---

## 2. VPS & Virtualmin Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 1 GB | 2 GB |
| vCPU | 1 | 2 |
| Disk | 10 GB | 20 GB |
| OS | Ubuntu 22.04 / Debian 12 | Ubuntu 22.04 LTS |
| Virtualmin | GPL | GPL or Pro |
| Web server | Apache 2.4 | Apache 2.4 or Nginx 1.24+ |

RubricMaker stores all data in the browser's **localStorage** by default; the Supabase integration is optional. This means the server only needs to serve static files — no database or backend server is required on the VPS.

---

## 3. Create the Virtual Server in Virtualmin

### 3.1 Log into Virtualmin

Open `https://YOUR_VPS_IP:10000` in a browser and log in as root (or your sudo user).

### 3.2 Create a new Virtual Server

1. In the left sidebar click **Create Virtual Server**.
2. Fill in the form:
   - **Domain name:** `rubricmaker.example.com` (replace with your actual domain)
   - **Administration password:** Choose a strong password (this becomes the Unix user's password)
   - **Administration username:** leave as auto-generated, e.g. `rubricmaker`
   - Leave **Create home directory**, **Create Apache website**, **Setup DNS zone**, and **Create mailbox for admin** ticked.
3. Click **Create Server**.

Virtualmin creates:
- Unix user: `rubricmaker`
- Home directory: `/home/rubricmaker/`
- Web root: **`/home/rubricmaker/public_html/`**
- Apache virtual host config: `/etc/apache2/sites-enabled/rubricmaker.example.com.conf`

> **Note:** If you are adding RubricMaker as a **sub-server** under an existing account, the web root will be  
> `/home/PARENT_USER/domains/rubricmaker.example.com/public_html/`

### 3.3 Point your DNS

In your DNS provider, add an **A record**:

```
rubricmaker.example.com.  IN  A  YOUR_VPS_IP
```

Allow up to 15 minutes for propagation before requesting an SSL certificate.

---

## 4. Enable SSL with Let's Encrypt

1. In Virtualmin, select your virtual server from the dropdown.
2. Go to **Server Configuration → SSL Certificate**.
3. Click the **Let's Encrypt** tab.
4. Set **Months between automatic renewal** to `2`.
5. Click **Request Certificate**.

Virtualmin will obtain a certificate and automatically configure Apache/Nginx to use it, including an HTTP→HTTPS redirect.

---

## 5. Web Server Configuration

RubricMaker uses React's **HashRouter** (`/#/route`), so deep-link support is built into the URL scheme. However, the configurations below also add security headers, caching rules, and gzip compression for best performance.

### 5.1 Apache (default)

Virtualmin uses Apache by default. The easiest way to customise Apache without touching the auto-generated vhost file (which Virtualmin may overwrite) is a `.htaccess` file placed in the web root.

**Copy `deploy/.htaccess` into your web root** (see §8 for deployment steps). The file is included in this repository at `deploy/.htaccess`.

If you prefer to edit the vhost file directly (more robust), see `deploy/apache-virtualmin.conf` for a ready-to-paste `<Directory>` block. Apply it via:

1. Virtualmin → **Server Configuration → Website Options**
2. Scroll to **Apache directives** and paste the block from `deploy/apache-virtualmin.conf`.
3. Click **Save**.

Or edit `/etc/apache2/sites-enabled/rubricmaker.example.com.conf` directly and reload:

```bash
sudo apachectl configtest   # sanity check
sudo systemctl reload apache2
```

### 5.2 Nginx (alternative)

If you have switched Virtualmin's stack to Nginx:

1. Copy `deploy/nginx-virtualmin.conf` from this repository.
2. Replace every occurrence of `rubricmaker.example.com` with your actual domain.
3. Place the file at `/etc/nginx/conf.d/rubricmaker.example.com.conf`  
   (or paste its `server {}` block into the relevant Virtualmin-managed file).
4. Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Node.js for Building (optional)

You have two build strategies:

| Strategy | Where the build runs | When to use |
|----------|---------------------|-------------|
| **Local build + rsync** | Your laptop | Simplest; no Node on server needed |
| **Server-side build** | VPS | Useful if CI/CD deploys source code instead of built artefacts |

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
cp -r dist/* /home/rubricmaker/public_html/
```

---

## 7. Environment Variables

RubricMaker has two **optional** build-time environment variables. The app is fully functional without them — users can enter their own Supabase credentials in the Settings page.

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Pre-fills the Supabase URL in Settings |
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

| Secret name | Value |
|-------------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon (public) key |
| `VPS_USER` | Virtualmin Unix username, e.g. `rubricmaker` |
| `VPS_HOST` | Your VPS IP address or hostname |
| `VPS_DOMAIN` | Your domain, e.g. `rubricmaker.example.com` |
| `VPS_SSH_KEY` | Private SSH key (see §9.1) |

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

Edit `deploy.sh` in the project root with your actual values:

```bash
DOMAIN="rubricmaker.example.com"
VPS_USER="rubricmaker"          # Virtualmin Unix user
VPS_HOST="YOUR_VPS_IP"
```

The script builds locally and rsyncs `dist/` to the correct Virtualmin web root.

### 8.3 Run the deploy script

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. Run `npm run build` to produce `dist/`
2. Rsync `dist/` → `/home/rubricmaker/public_html/` on the VPS (with `--delete` to clean stale files)

### 8.4 Copy web server config files

After the first deploy, upload the `.htaccess` (for Apache) so SPA routing and security headers are active:

```bash
scp deploy/.htaccess rubricmaker@YOUR_VPS_IP:/home/rubricmaker/public_html/.htaccess
```

### 8.5 Verify

Open `https://rubricmaker.example.com` in a browser. You should see the RubricMaker dashboard. Check:

- [ ] Page loads without a blank screen
- [ ] Navigation between pages works
- [ ] Browser console shows no 404 errors for JS/CSS assets
- [ ] `https://` padlock is shown (SSL active)

---

## 9. Automated CI/CD with GitHub Actions

The workflow at `.github/workflows/deploy-vps.yml` builds the app and rsyncs to the VPS on every push to `main`.

### 9.1 Create a dedicated deploy SSH key

Generate a key pair that GitHub Actions will use (do **not** use your personal key):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/rubricmaker_deploy -N ""
```

Add the **public key** to the VPS:

```bash
cat ~/.ssh/rubricmaker_deploy.pub | ssh rubricmaker@YOUR_VPS_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Add the **private key** as a GitHub secret:

```
Secret name : VPS_SSH_KEY
Secret value: (paste the entire contents of ~/.ssh/rubricmaker_deploy, including the -----BEGIN----- lines)
```

### 9.2 Add the remaining secrets

Go to **GitHub → repo → Settings → Secrets and variables → Actions → New repository secret** and add:

```
VPS_USER   = rubricmaker
VPS_HOST   = YOUR_VPS_IP
VPS_DOMAIN = rubricmaker.example.com
VITE_SUPABASE_URL      = https://xxxx.supabase.co   (optional)
VITE_SUPABASE_ANON_KEY = eyJ...                     (optional)
```

### 9.3 Trigger a deployment

Push any commit to `main`, or go to **Actions → Deploy to VPS → Run workflow**.

The workflow:
1. Checks out the repository
2. Installs Node 22 + npm dependencies
3. Runs `npm run build` with Supabase env vars injected
4. Rsyncs `dist/` to `/home/rubricmaker/public_html/` on the VPS

> **Note:** The workflow does **not** copy `.htaccess` automatically. After the first manual deploy (§8.4), the `.htaccess` file persists on the server because the rsync uses `--delete` only for the `dist/` contents. To include it automatically, add it to `dist/` via a post-build step or add it to `public/` (Vite copies everything in `public/` to `dist/`).

### 9.4 Keep `.htaccess` in the build output (recommended)

Place `deploy/.htaccess` in `public/` so Vite includes it in every build automatically:

```bash
cp deploy/.htaccess public/.htaccess
```

Commit and push — from that point forward, every CI/CD run will deploy the latest `.htaccess`.

---

## 10. Supabase Setup (optional)

RubricMaker works entirely offline (localStorage) without Supabase. Enable it only if you want cloud sync across devices or multi-user access.

### 10.1 Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) (free tier available).
2. Click **New project** and choose a region close to your VPS.
3. Note your **Project URL** and **anon public key** (Project Settings → API).

### 10.2 Run migrations

Apply the four migration files in order. You can use the Supabase dashboard SQL editor or the Supabase CLI:

```bash
# Using the Supabase CLI
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or paste each file manually in the **SQL Editor**:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_storage_buckets.sql`
4. `supabase/migrations/004_profile_trigger.sql`

### 10.3 Configure auth

In Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://rubricmaker.example.com`
- **Redirect URLs:** `https://rubricmaker.example.com/#/`

Enable **Email (magic-link)** under **Authentication → Providers**.

### 10.4 Connect in the app

Users can enter credentials under **Settings → Database** inside RubricMaker, or you can pre-fill them at build time via the `VITE_SUPABASE_*` environment variables (§7).

---

## 11. Maintenance

### Updating the application

```bash
# Pull latest changes
git pull origin main

# Re-deploy
./deploy.sh
```

Or push to `main` and let GitHub Actions handle it automatically.

### Renewing the SSL certificate

Virtualmin renews Let's Encrypt certificates automatically via a cron job. To manually renew:

Virtualmin → your virtual server → **Server Configuration → SSL Certificate → Let's Encrypt → Request Certificate**

### Checking Apache / Nginx logs

```bash
# Apache access log (adjust path if Virtualmin differs)
sudo tail -f /var/log/virtualmin/rubricmaker.example.com_access_log

# Apache error log
sudo tail -f /var/log/virtualmin/rubricmaker.example.com_error_log

# Or via Virtualmin UI:
# Logs and Reports → Apache Access Log
```

### Disk usage

```bash
du -sh /home/rubricmaker/public_html/
```

The built `dist/` is typically 3–6 MB.

---

## 12. Troubleshooting

### Blank page / white screen after deploy

- Check the browser console for 404 errors on `.js` / `.css` assets.
- Ensure Vite's `vite.config.ts` has `base: './'` (it does by default in this project) so asset paths are relative.
- Confirm files were actually uploaded: `ls /home/rubricmaker/public_html/`

### HashRouter vs "page not found" errors

Because this app uses **HashRouter**, all navigation is encoded in the URL hash (`/#/route`). You will not hit 404 errors from the server when refreshing. If you do get 404s, check that the web root contains `index.html`.

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

### Virtualmin overwrites Apache vhost config

Virtualmin may regenerate the vhost file on configuration changes. Always use `.htaccess` for custom directives (§5.1) rather than editing the vhost file directly. Alternatively, use Virtualmin's **"Apache directives"** text box under **Server Configuration → Website Options**, which it preserves.

### Files not updating after deploy (browser cache)

Vite hashes asset filenames by default (e.g. `index-abc123.js`), so browsers fetch new files automatically. If `index.html` itself is stale, clear the browser cache or add `Cache-Control: no-cache` for HTML files (already set in `deploy/.htaccess`).

---

## File Reference

| File | Purpose |
|------|---------|
| `deploy.sh` | Local build + rsync deploy script |
| `deploy/.htaccess` | Apache SPA config, security headers, caching |
| `deploy/apache-virtualmin.conf` | Apache `<Directory>` block (vhost alternative to `.htaccess`) |
| `deploy/nginx-virtualmin.conf` | Nginx server block for Virtualmin Nginx stacks |
| `.github/workflows/deploy-vps.yml` | GitHub Actions CI/CD pipeline |
| `.env.example` | Template for local environment variables |
| `supabase/migrations/` | Database schema SQL files |
