# Safe Exam Browser integration

RubricMaker can require [Safe Exam Browser](https://safeexambrowser.org/) (SEB) for a test or an essay assignment. This page describes what the app generates, how a student gets in and out, and what SEB itself guarantees (and does not).

## Flows

### Teacher

1. Tick **Require Safe Exam Browser** in the test builder or the essay builder.
2. Assign the class. Test assignments auto-save, and **Print QR slips** produces one slip per student.
3. When the test requires SEB, every slip carries an **SEB required** badge plus the line "Install Safe Exam Browser first, then open this slip inside SEB."
4. Essays additionally offer **Download SEB config** in the assignment dialog; tests do not need it there because the student gate generates the same config on demand.

### Student

1. Scan the slip's QR code (or open the printed URL) in a normal browser.
2. The gate blocks the test and shows three steps: install SEB, download this test's `.seb` config, open it. It also links to the official SEB download page and offers the config download directly.
3. Opening the `.seb` file (or scanning the config on an iPad) starts SEB at that student's own link.
4. After submitting inside SEB, the page navigates to the quit URL two seconds later, which ends the kiosk session. The submitted test and essay screens also show a manual **Quit Safe Exam Browser** button, for the cases where the automatic navigation is blocked or the student submitted before SEB finished loading.

## The `.seb` file

`get-seb-config` builds the file on the server and the gate downloads it as `<test-or-essay-name>.seb`. The client keeps `src/utils/sebConfig.ts` as an offline fallback (no database, or the edge runtime is unreachable), and both paths render through the same `supabase/functions/_shared/sebConfig.ts`, so the bytes match.

Generation belongs on the server because the config embeds the app base URL. Built in the teacher's browser it depended on whichever origin and path that browser was using, so the same assignment could produce different files on different devices. The function derives the base from `APP_URL` only — never the request's `Origin` header, which a caller controls — which also gives each assignment a stable file — the prerequisite for a one-scan `sebs://` launcher and for config-key verification later.

`GET /functions/v1/get-seb-config?code=<assignment code>` returns 404 for an unknown code, 410 when the assignment has expired, and 409 when it does not require SEB. The assignment code is the credential and the file contains no answers or keys, so the function runs with `verify_jwt = false` (see `supabase/config.toml`).

Set `APP_URL` in the function environment (for example `https://school.example/rubricmaker`, no trailing slash). Without it the function returns 500 instead of guessing from the caller's `Origin` — trusting that header would let anyone with a valid assignment code point a student's SEB lockdown at an attacker-controlled domain.

The bytes are:

- outer gzip
- `plnd` block prefix (plain, unencrypted data)
- inner gzip of the XML plist

That is the shape SEB's file-format specification describes. A raw XML plist also opens — macOS checks for `<?xm` explicitly and Windows' `XmlParser` accepts it after `BinaryParser` rejects the missing prefix — but only as an undocumented fallback, so the app always writes the gzipped form.

The plist sets:

| Key                            | Value                        | Why                                                                     |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| `startURL`                     | the student's test/essay URL | SEB opens the exam, not a generic page                                  |
| `allowQuit`                    | `false`                      | students cannot leave the kiosk mid-exam                                |
| `quitURL`                      | `<app base>?seb-done=1`      | real document navigation, see below                                     |
| `quitURLConfirm`               | `false`                      | submitting exits without an extra prompt                                |
| `browserWindowAllowAddressBar` | `false`                      | no address bar in the exam window                                       |
| `URLFilterEnable`              | `true`                       | main-frame navigation restricted to the app                             |
| `URLFilterEnableContentFilter` | `false`                      | content requests (XHR/auth/assets) stay allowed, see below              |
| `URLFilterRules`               | allow `<app base>.*`         | anything else in the main frame is blocked by SEB's default-deny filter |

### Why the quit URL is a query, not a hash

SEB quits when it detects a navigation to the quit URL. The app is a hash-routed SPA, so quitting to `#/seb-done` changes only the fragment: no new document, no request, and SEB's `OnBeforeBrowse` never sees a matching URL on Windows (and the quit URL match fails on macOS too). Students would stay locked in with `allowQuit=false`.

`?seb-done=1` on the app's own base path is a real navigation, so SEB detects it, and because it addresses the existing base path it also works on sub-path deployments such as GitHub Pages (`base: './'`). `buildSebQuitUrl()` is the single source of truth, used both for the config and for the post-submit redirect in the test and essay pages.

`useSebQuitRedirect(submitted)` owns the automatic redirect (two seconds after submission, cancelled if submission is rolled back), and `quitSafeExamBrowser()` is the navigation both the hook and the manual button use, so the button cannot drift from the config's quit URL.

### URL filtering and Supabase

On Windows the request filter only processes content requests when `URLFilterEnableContentFilter` is set; the setting defaults to `false`. With this config only main-frame navigations are filtered, so the app's Supabase traffic (anonymous auth, edge functions, realtime, storage assets) is not blocked. Setting `URLFilterEnableContentFilter` to `true` without allow-listing the Supabase host would break the exam, which is why the config pins it to `false` explicitly.

## Known limits

- **Detection is user-agent sniffing.** The gate and the live monitor both look for `SEB` in the user agent. SEB's own integration guide calls this check easy to spoof and does not recommend it. Treat the requirement as a deterrent, not enforcement.
- **Chromebooks cannot run SEB.** There is no ChromeOS build. Windows, macOS and iOS (including iPad) are supported.
- **The config is unencrypted.** Anyone holding the `.seb` file can read or edit it. It also means no settings password and no config-key verification.
- **Configs are generated per student device time.** The start URL is the page the student is on, and the quit/filter URLs come from that deployment's origin and path, so a config downloaded from a preview host points at that host.

## Verification checklist before a live exam

1. Install the current SEB release on the exam device (Windows 3.10 or later, macOS 3.7, iOS 3.7).
2. Take a test that requires SEB, from the slip through submission, and confirm SEB quits afterwards.
3. Confirm the test loads inside SEB with a Supabase-backed assignment (not only an embedded offline link).
4. Print a slip and confirm the badge and instruction fit on paper at 2 and 4 columns.
