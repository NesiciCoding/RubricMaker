# Browser error reporting

Production JavaScript errors are recorded in the app's own `client_logs` table. There is no Sentry,
GlitchTip or other third party. This page explains what is recorded, how to switch it on, and how
to turn a recorded frame back into source code.

## What is recorded

Switch it on with the build flag `VITE_ERROR_REPORTING=true`. It needs a connected Supabase database
(otherwise there is nowhere to write) and migration `035_client_logs.sql` and `089_client_logs_bounds.sql`.

Only rows with `category = 'error'` are written: no actions, page views or metrics. Those still need
`VITE_STRESS_TEST_LOGGING=true`, which keeps its full behaviour. Both flags can be on together.

An error row holds:

| Column / field                               | Value                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `name`                                       | Where it was caught: `unhandled_rejection`, `window_error`, `react_error_boundary`, `scan_ocr_failed`                       |
| `meta.errorName`                             | `TypeError`, `RangeError`, … (identifier-shaped names only)                                                                 |
| `meta.messageHash`                           | A hash of the message with quoted text, numbers, urls, emails and ids removed. **The message itself is never stored.**      |
| `meta.signature`                             | Hash of error name + message hash + top frame. The same failure has the same signature in every session.                    |
| `meta.frames`                                | Up to 5 `assets/<file>.js:line:col` positions in **our own** bundle. Other origins, function names and queries are dropped. |
| `meta.componentFrames`                       | Up to 3 component-stack positions, for React boundary catches                                                               |
| `path`                                       | The route **pattern**: `/rubrics/:id/grade`, `/essay/:id`. Record ids and share codes become `:id`.                         |
| `app_version`                                | The build: the first 12 characters of the commit SHA (`dev` for a local build)                                              |
| `role`, `school_id`, `user_id`, `session_id` | What `client_logs` already stored (a random per-tab session id)                                                             |

A session records at most 20 error rows and drops a repeat of the same signature. Rows older than 30 days
are deleted nightly by `client-logs-cleanup` (migration 089).

The rule is enforced in code, not by convention: `src/services/logging/errorSanitizer.ts` builds the
payload, and in errors-only mode any other caller's `meta` is reduced to numbers, booleans and
identifier-shaped strings, so a sentence cannot get through by accident.

## Turning it on

- **GitHub Actions (production VPS):** on by default for the Hestia deploy build. Set the repository
  variable `VITE_ERROR_REPORTING` to `false` to switch it off.
- **Docker:** set `VITE_ERROR_REPORTING=true` in `.env` and rebuild the image (see `.env.docker.example`).
- **Local build:** `VITE_ERROR_REPORTING=true npm run build`.

## Finding the failure

In Grafana, **Client Diagnostics → Top error signatures** groups the rows by signature with the
occurrence count, the number of sessions, the release and the top frame. The alert **Burst of browser
errors** fires when 5 or more sessions report errors (at least 10 rows) within 15 minutes.

## Decoding a frame

The build writes **hidden** source maps (`build.sourcemap: 'hidden'`: no `sourceMappingURL` comment, so
browsers never request them) and `scripts/extract-sourcemaps.mjs` moves them out of `dist/` straight
after the build. They are **never deployed**. CI keeps them for 90 days as the artifact
`sourcemaps-<full commit sha>` on the deploy run.

1. Take the `release` (`app_version`) and a frame, for example `assets/index-BtRH-A10.js:1:48213`.
2. Download the artifact `sourcemaps-<sha>` whose commit starts with that release, and unzip it.
3. Run:

    ```bash
    node scripts/decode-error-frame.mjs path/to/unzipped assets/index-BtRH-A10.js:1:48213
    # assets/index-BtRH-A10.js:1:48213
    #   → ../../src/pages/RubricBuilder.tsx:412:9  (handleSave)
    ```

    Several frames can be passed at once. The script uses `source-map-js`, which ships with Vite, so
    nothing extra needs installing. A missing map means the wrong release artifact.

A local `npm run build` also leaves its maps in `sourcemaps/` (git-ignored), so you can decode a
frame from your own build the same way.
