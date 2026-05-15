# Rubric Maker

A comprehensive, offline-first rubric creation and grading tool built with React and TypeScript. This application allows educators to design complex rubrics, grade students efficiently, and analyze performance statistics.

## ✨ Features

### 1. Rubric Builder
*   **Flexible Structure**: Create rubrics with custom criteria and performance levels.
*   **Scoring Modes**: diverse scoring options including **Total Points** (raw score) and **Weighted Scored** (percentage-based).
*   **Advanced Level Options**:
    *   **Sub-items**: Checklists within a level for granular scoring.
    *   **Point Ranges**: Define min/max points for a level to allow fine-tuning.

### 2. Grading Interface
*   **Student Management**: Manage students and organize them into classes.
*   **Interactive Grading**: Click to select levels, toggle sub-items, or use the slider for point ranges.
*   **Comment Bank**: Create and tag reusable feedback snippets for quick insertion.
*   **Overall Feedback**: Add general comments and attachments to graded rubrics.

### 3. Analytics & Reporting
*   **Statistics Dashboard**: View class performance including Average, Median, Highest, and Lowest scores.
*   **Visualization**: Charts for grade distribution and per-criterion performance.
*   **Comparative Grading**: Simultaneously grade two students side-by-side to ensure rubric consistency.
*   **Universal Attachment Viewer**: Rich inline rendering of `.docx` Word Documents, PDFs, and images within the grading flow.
*   **Export**:
    *   **PDF**: Generate individual student reports or bulk export for the whole class.
    *   **Word (.docx)**: Export raw data or use custom Word templates with mail-merge fields.
    *   **CSV**: Export raw data for use in Excel or other gradebooks.

### 4. Standards Integration
*   **Common Standards Project**: Link rubric criteria to state and national standards (CCSS, NGSS, etc.) via the CSP API.
*   **Favorites**: Save frequently used standards for quick access.

### 5. Data Management
*   **Local Storage**: All data is saved locally in your browser. No account required.
*   **Backup & Restore**: Export your entire dataset to a JSON file for backup or transferring to another device.

---

## 🚀 Development

To run the project locally:

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Start the development server**:
    ```bash
    npm run dev
    ```

3.  Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Deployment

RubricMaker works in two modes:

- **Offline-only** — data lives in the browser's local storage. No server needed. Works on GitHub Pages, SharePoint, or any static host.
- **With database sync** — add an optional Supabase backend for multi-device sync, email login, and rubric sharing between teachers. Hosted on your own infrastructure.

---

### 🐳 Docker (recommended — includes database sync)

The easiest way to run the full stack. Requires [Docker](https://docs.docker.com/get-docker/).

**Your own laptop or school LAN:**

```bash
cp .env.docker.example .env   # defaults work as-is for localhost
docker-compose up -d --build
```

Open [http://localhost:8080](http://localhost:8080). To make it accessible to other teachers on the network, set `SITE_URL=http://<your-ip>:8080` in `.env` first.

**VPS with a domain name (HTTPS):**

```bash
cp .env.docker.example .env
# Edit .env:
#   DOMAIN=rubricmaker.school.nl
#   SITE_URL=https://rubricmaker.school.nl
#   JWT_SECRET=<random 64-char string>   ← change this!
#   POSTGRES_PASSWORD=<strong password>  ← change this!
docker-compose --profile https up -d --build
```

Caddy obtains a free Let's Encrypt certificate automatically. Open ports 80 and 443 on your firewall.

**Enabling email login (OTP):**

Without SMTP, teachers log in anonymously. To allow email-linked accounts (needed for sharing rubrics across devices):

```bash
# In .env:
MAILER_AUTOCONFIRM=false
SMTP_HOST=smtp.office365.com   # or smtp.gmail.com, smtp-relay.brevo.com
SMTP_USER=rubricmaker@school.nl
SMTP_PASS=your-app-password

docker-compose up -d --force-recreate auth
```

**Backup and restore:**

```bash
./scripts/backup.sh              # saves to ./backups/YYYYMMDD_HHMMSS/
./scripts/restore.sh backups/20260515_120000
```

**Updating to a new version:**

```bash
git pull
docker-compose up -d --build    # rebuilds the app image, restarts services
# Migrations run automatically on next startup
```

---

### 🌐 Static hosting (offline mode only)

No database sync — all data stays in the browser. Works on any static host.

**Build:**
```bash
npm run build   # output in dist/
```

Deploy the `dist/` folder to GitHub Pages, Vercel, Netlify, or any web server.

**SharePoint:**

1. Run `npm run build`
2. In `dist/`, rename `index.html` → `index.aspx`
3. Upload the entire `dist/` folder to a SharePoint Document Library
4. Click `index.aspx` to launch

> For Standards Integration on SharePoint, add the SharePoint domain to your Common Standards Project API key's allowed origins.
