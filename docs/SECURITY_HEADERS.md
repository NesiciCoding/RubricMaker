# Security headers across the deploy configs

The app ships as static files, so each front end sets its own headers: `deploy/nginx-*.conf`,
`deploy/apache-*.conf`, `deploy/.htaccess`, and `docker/nginx.prod.conf` (fronted by
`docker/Caddyfile`, which terminates TLS in the Docker stack).

Those files had drifted, because nothing compared them. `src/__tests__/deploySecurityHeaders.test.ts`
now parses every one of them in the normal unit-test run, so the same CI job that runs the rest of the
suite fails when:

- a required header disappears — `Content-Security-Policy`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and `Strict-Transport-Security`
  wherever the file terminates TLS;
- the CSP loses a hardening directive — `default-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'self'`, and a `blob:` worker (the signature pad and the
  recorder need it);
- the CSP stops allowing a host the app calls, or still allows a host it no longer calls;
- `Permissions-Policy` stops allowing the camera and microphone for self;
- the configs' external host allowlists disagree with each other.

## Adding an external service

1. Add the host to `REQUIRED_CSP_HOSTS` in the test.
2. Allow it in every config — in `connect-src` for a fetch, and in `script-src` / `worker-src` for
   anything that loads or runs JavaScript.
3. `npx vitest run src/__tests__/deploySecurityHeaders.test.ts`.

Each deployment keeps its own Supabase host (`supabase.example.com` in the templates,
`supabase.rubricmaker.nl` on the school server); the test normalises those before comparing configs,
so a placeholder and a real hostname are not treated as a disagreement.

## Why jsDelivr is in the policy

tesseract.js — the handwriting scan — loads its worker and core from `cdn.jsdelivr.net` on first use.
Only `deploy/.htaccess` allowed that origin, so on nginx and in the Docker image the scan was blocked
by CSP even though the feature was configured correctly. All the configs now allow it in
`script-src`, `worker-src` and `connect-src`; if the OCR paths are ever self-hosted, remove it from
all three and from the test together.

## Why the Google Fonts hosts are gone

The fonts are vendored into `public/fonts` (see `scripts/vendor-fonts.mjs`) and loaded from
`index.html`, so allowing `fonts.googleapis.com` and `fonts.gstatic.com` was a stale entry that
widened the policy for no reason.

## Why Caddy has no CSP of its own

`docker/Caddyfile` terminates TLS and proxies to `docker/nginx.prod.conf`, which sets the content
policy. Caddy is therefore only checked for HSTS and the headers it adds itself.
