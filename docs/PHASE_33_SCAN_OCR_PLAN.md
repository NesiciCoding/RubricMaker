# Phase 33 — Scan & OCR of student handwriting — Implementation Plan

**Status:** Proposed (drafting pass). No code written yet — this document is the spec to approve before implementation.

**Goal:** Let a teacher capture or upload a photo/scan of a student's handwritten work (paper essay, worksheet, exam answer), run OCR on it, review and correct the extracted text, and attach both the image and the text to the relevant grading record — while respecting the app's offline-capable, Supabase-primary storage model and its GDPR posture.

**Scope guardrails (from the project's own rules):**

- **No AI generation.** OCR/ICR (turning an image into text) is transcription, not content generation, so it is in scope. Auto-grading, auto-feedback, or "improve this essay" on the recognised text stays out of scope (root `CLAUDE.md` → "No AI generation").
- **Offline-capable first.** The feature must degrade to a working local-only path when Supabase is absent, exactly like the rest of the app.
- **Never regress a shipped feature.** The existing image branch of `extractText()` (`src/utils/textExtraction.ts`) already OCRs images; Phase 33 extends that path, it does not replace or break it.

---

## Category 1 — Dependencies we already have that can do this

| Capability                       | Existing dependency / module                                             | Notes                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR engine                       | `tesseract.js ^7.0.0` (`src/utils/textExtraction.ts` → `extractFromImage`) | Already wired: `createWorker('eng')` → `worker.recognize(dataUrl)`. Runs fully client-side (WASM). Today it uses defaults only — one language, no preprocessing, no confidence/word data surfaced. |
| Image branch of the pipeline     | `extractText()` `mimeType.startsWith('image/')` branch                    | The entry point Phase 33 hooks into; already reports progress via `onProgress`.                                                                                                                        |
| Local binary (blob) storage      | `src/services/mediaStore.ts` (IndexedDB `rm_media`)                        | `putBlob/getBlob/deleteBlob/listIds/pruneOrphanedBlobs/estimateUsage`. This is the correct home for large scan images — **not** the base64 `dataUrl` on `Attachment`, which bloats `localStorage`.   |
| Cloud blob storage + RLS pattern | Supabase Storage buckets `attachments`, `recordings`, `feedback-audio`     | Precedent to copy: private bucket + `file_size_limit` + `allowed_mime_types`, RLS on `storage.objects` keyed to `(storage.foldername(name))[1] = auth.uid()`, path `{userId}/{id}`.                    |
| Blob ⇄ Supabase sync             | `src/services/database/RecordingSync.ts` + `recording_metadata` table      | Exact template for a new `ScanSync` + `scan_metadata` (metadata row in Postgres, bytes in the bucket, `storage_path` linking them).                                                                    |
| Analysis-result persistence      | `analysis_results` table + `src/components/Essay/DocumentAnalysisPanel.tsx` | OCR output already has a persistence home and a review surface to extend.                                                                                                                              |
| Attachment model & viewer        | `Attachment` type (`src/types/index.ts`), `AttachmentViewer.tsx`           | Scans can surface as a specialised attachment kind linked to a `studentId`/`rubricId`.                                                                                                                 |
| Media capture precedent          | `src/hooks/useMediaRecorder.ts` (getUserMedia for audio)                   | Establishes the permission/stream/cleanup pattern to mirror for a **camera photo** hook.                                                                                                              |
| Retention / auto-deletion        | `get_overdue_attachments()` SQL fn + `delete-old-attachments` edge function | Nightly Supabase Cron job driven by the owner's school `retention_years` (default 7). Directly reusable/extendable for scans.                                                                          |
| PDF rasterisation                | `pdfjs-dist ^6.3.289`                                                       | Lets a multi-page PDF scan be rendered page-by-page to a canvas for OCR (we currently only pull the PDF text layer, which a scanned PDF doesn't have).                                                 |
| Image resize/preprocess surface  | Browser Canvas 2D + `OffscreenCanvas`                                       | No dependency needed for grayscale, contrast, threshold, downscale/upscale — enough for a first preprocessing pass.                                                                                    |

**Takeaway:** the local capture → OCR → store → review → attach loop can be built almost entirely from what's already installed. New dependencies are only needed to materially *improve handwriting accuracy* (Category 2).

---

## Category 2 — Dependencies we will need to add

Ordered by how strongly they're needed. Each is weighed against bundle size and the offline-first / no-heavy-CDN conventions.

1. **Additional Tesseract language data (no new npm dep, new assets).**
   Handwriting recognition still benefits from the right traineddata. Ship the LSTM (`_best`) models for the languages we support UI-side (at least `eng`, `nld`, `fra`, `deu`, `spa`) and let the user pick, instead of hardcoding `'eng'`. Host the traineddata as a bundled/self-hosted asset (same principle as the self-hosted pdf worker in `textExtraction.ts`) — do not pull from an external CDN at runtime.

2. **A document/edge-detection + perspective-correction library — _recommended, evaluate first_.**
   A phone photo of paper is skewed, curved, and shadowed; flattening it is the single biggest OCR-quality win. Candidates:
    - **`jscanify`** (MIT, built on OpenCV.js) — auto edge detection + perspective warp; small wrapper but pulls OpenCV.js (~8 MB WASM).
    - **`opencv.js`** directly — full control (deskew, adaptive threshold, denoise) but heavy.
    - **Hand-rolled canvas pipeline** — no dep, but no reliable auto-crop.
      **Decision to make in 33.2:** if bundle budget allows, lazy-load OpenCV.js/jscanify *only* on the scan route (dynamic `import()`, never in the main chunk — same rule as `loadDb()`); otherwise ship the canvas-only pipeline plus a manual four-corner crop UI. **Default recommendation: manual-crop canvas pipeline first (zero dep), OpenCV auto-crop as a lazy-loaded enhancement in a later subphase.**

3. **(Optional, opt-in) A cloud handwriting-recognition provider — for the server-side path only.**
   Tesseract is trained on printed text; cursive/messy handwriting is where it fails hardest, and no local option closes that gap well. If we offer a high-accuracy path it means a cloud ICR API (e.g. Google Cloud Vision `DOCUMENT_TEXT_DETECTION`, Azure AI Vision Read, or AWS Textract). This is **not** an npm dependency in the frontend — it's an edge-function integration (Category 3) so keys stay server-side. Adds an operational dependency (API account + cost), so it must be **off by default and self-host-configurable**.

**Explicitly avoided:** no new state library, no CSS-in-JS, no AI content-generation SDK. A cloud OCR call transcribes an image; it must never be extended into auto-grading/feedback.

---

## Category 3 — Local device vs. server-side processing

**Recommendation: hybrid, local-first.**

| Path                                      | Where                                        | Pros                                                                                                | Cons                                                                                                                  |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Local (Tesseract.js + canvas prep)**    | Browser, WASM worker                         | Works offline; **no student image or text ever leaves the device** (best GDPR posture); zero per-use cost; matches offline-first design | Weak on cursive/messy handwriting; CPU-heavy on low-end devices; language pack download size                          |
| **Server-side (edge function → cloud ICR)** | Supabase edge function calling a cloud model | Dramatically better handwriting accuracy; offloads CPU from the teacher's device                    | Requires network (breaks offline); sends student work to a third party (consent/DPA needed); cost; opt-in complexity |

**Design:**

- **Preprocessing always runs locally** (grayscale/threshold/deskew/crop) regardless of which OCR path is chosen — it's cheap and improves both.
- **Local Tesseract is the default and the only offline path.** When Supabase is unconfigured or `!navigator.onLine`, the server path is simply unavailable and the UI hides it.
- **Server-side ICR is strictly opt-in**, gated behind a setting (`settings.scanOcr.serverSide`, default `false`) and only shown when (a) a Supabase connection is live and (b) the deployment has configured the provider. It routes through a new edge function (`ocr-handwriting`) that holds the API key via `Deno.env.get(...)` — never the client — mirroring `submit-essay`/`notify-student-graded`. The self-hosted Docker stack has no functions runtime, so this path is cloud-deployment-only and the UI must state that.
- **Confidence-driven suggestion:** after a local pass, if mean word confidence is below a threshold and the server path is available, offer "Try higher-accuracy recognition (sends this image to <provider>)" with an explicit consent line — never silently upload.

---

## Category 4 — Improving OCR for student handwriting

Handwriting is the hard part. Concrete, ordered levers (biggest win first):

1. **Preprocess the image before OCR (local, canvas/OpenCV).**
    - Auto or manual **perspective crop** to isolate the page (removes desk/background noise).
    - **Grayscale → adaptive/Otsu binarisation** (handwriting in blue/black ink on white → clean 1-bit).
    - **Deskew** (rotate to level text lines) and **denoise** (remove speckle/shadow gradients).
    - **Upscale to ~300 DPI equivalent** — Tesseract accuracy drops sharply below that.
2. **Configure Tesseract properly (we currently pass nothing).**
    - Set **OEM = LSTM-only** and pick a sensible **PSM** (e.g. `PSM.SINGLE_BLOCK` / `PSM.AUTO`) per capture type; expose "single column of text" vs "sparse" as a capture hint.
    - Load the **correct language** (student's subject language), not always `eng`; allow multi-language (`eng+nld`).
    - Supply **`user_words` / `user_patterns`** dictionaries seeded from the rubric/assignment vocabulary and the class's known names so domain terms resolve better.
3. **Surface confidence and keep a human in the loop.**
    - Read Tesseract's per-word confidence (`data.words`), **highlight low-confidence spans** in the review UI, and jump the teacher to them. The extracted text is *always* teacher-editable before it's saved — OCR is a first draft, never the final grade input.
    - Show the **image and text side-by-side** so correction is fast (extend `DocumentAnalysisPanel`).
4. **Manage expectations by capture quality.**
    - Neat block capitals / printed worksheets → local Tesseract is usable.
    - Cursive / dense handwriting → recommend the opt-in server ICR path (Category 3); document this honestly in the in-app docs rather than over-promising local accuracy.
5. **(Future, no-AI-safe) feedback loop.** Store teacher corrections alongside the OCR draft so we can measure accuracy over time and tune preprocessing/PSM defaults. Corrections are used for *tuning our pipeline*, not for training a generative model.

---

## Category 5 — Storing scanned images & deletion policy

Scans are photos of children's schoolwork: **personal data**, often larger than any other blob in the app. Storage follows the existing recordings/attachments pattern; the deletion policy is stricter than the default because of the sensitivity.

### Storage

- **Offline / local:** image bytes go into **IndexedDB via `mediaStore.putBlob`**, keyed by a `scanId`. **Never** store the raw image as a base64 `dataUrl` on the `Attachment`/state (it would land in `localStorage` and blow the quota). State/metadata holds only the `scanId` + OCR result + link (`studentId`, `rubricId`/assignment).
- **Connected:** new private Supabase bucket **`scans`** (`public=false`, `file_size_limit` ~10–20 MB, `allowed_mime_types = image/*`), RLS keyed to `(storage.foldername(name))[1] = auth.uid()`, path `{userId}/{scanId}`. Bytes in the bucket; a **`scan_metadata`** table (mirroring `recording_metadata`: `id`, `owner_id`, `student_id`, `storage_path`, `data jsonb` for OCR text/confidence/link) carries the metadata and syncs like everything else.
- **Sync:** a new **`ScanSync`** service (cloned from `RecordingSync`) uploads the blob + upserts metadata while connected, gated through `isOffline()` and the pending-sync queue like all other writes; `pruneOrphanedBlobs` sweeps IndexedDB blobs no longer referenced after a hydrate/merge.
- **Access:** students/anonymous never read the bucket directly — teacher-minted **signed URLs** only (same rule as `feedback-audio`).

### Deletion policy

- **Discard-after-OCR default (privacy-preserving).** A setting `settings.scanOcr.keepImage` (**default `false`**): when off, the image blob is deleted as soon as the teacher confirms the recognised text and it's attached to the grade — we keep the *text*, not the photo. When on, the image is retained as an attachment for later reference.
- **Manual delete cascades** everywhere: deleting the scan (or its parent grade/student) removes the IndexedDB blob, the Storage object, and the `scan_metadata` row in one action — no orphans.
- **Retention sweep (connected deployments):** reuse the existing mechanism — add a `get_overdue_scans()` SQL function and extend the nightly `delete-old-attachments` edge function (or a sibling) to purge `scan_metadata` + bucket files past the owner's school `retention_years` (default 7). Runs via Supabase Cron; the self-hosted stack uses the `scripts/backup.sh`-style scheduler note.
- **Right-to-erasure (GDPR Art. 17):** student deletion already cascades their records; ensure scans are in that cascade (metadata row + blob + bucket object).
- **Docs:** `PRIVACY.md` §5.5/§5.6 must gain a paragraph on scanned images — what's stored, where, the discard-after-OCR default, and the retention sweep — since this introduces a new, sensitive personal-data category.

---

## Subphases (logical implementation chunks)

Each subphase is independently shippable and testable; later ones build on earlier ones. Sizes are rough (_small / medium / large_).

### 33.0 — Foundations: types, local storage layer, feature flag _(small)_

- Add domain types to `src/types/index.ts`: `Scan` / `ScanMetadata` (`id`, `studentId?`, `rubricId?`/assignment link, `storagePath?`, `ocrText`, `ocrConfidence`, `lang`, `createdAt`) and a `ScanOcrSettings` slice (`serverSide: false`, `keepImage: false`, `defaultLang`).
- Extend `mediaStore` usage for scan blobs (no schema change — reuse `rm_media`); add a thin `src/services/scanStore.ts` helper if it clarifies ids/prefixes.
- Wire a `useSettings()` slice for `scanOcr` with the safe defaults above.
- Tests: type/reducer surface, settings defaults.

### 33.1 — Capture & import UI _(medium)_

- New `useCameraCapture` hook (mirror `useMediaRecorder`'s permission/stream/cleanup) + a file/drag-drop importer for existing photos/scanned PDFs.
- A capture surface (modal/panel) reachable from **GradeStudent** and the attachments flow, with a "what are you scanning?" hint (single column / sparse) feeding PSM later.
- Multi-page PDF: render pages to canvas via `pdfjs-dist` for OCR.
- i18n keys in all five locales; route entry documented.
- Tests: hook (mocked `getUserMedia`), importer, PDF-page rasterisation.

### 33.2 — Local preprocessing pipeline _(medium)_

- Canvas-based grayscale → contrast → Otsu/adaptive threshold → deskew → upscale, exposed as a pure, unit-testable `preprocessScan(imageData, opts)` in `src/utils/`.
- **Manual four-corner crop** UI (zero-dep) as the baseline perspective fix.
- **Decision gate:** evaluate lazy-loaded OpenCV.js/jscanify auto-crop; adopt only if bundle-budget-acceptable and dynamically imported on the scan route only.
- Tests: deterministic pixel transforms on fixtures.

### 33.3 — OCR engine improvements (local) _(medium)_

- Replace the hardcoded `createWorker('eng')` with language selection (`eng`, `nld`, `fra`, `deu`, `spa`, multi-lang), self-hosted traineddata assets, OEM=LSTM, capture-driven PSM, and optional `user_words`/`user_patterns` from rubric/class vocab.
- Return per-word confidence from `extractFromImage` (extend the return shape without breaking existing callers).
- Tests: language routing, config plumbing, confidence surfaced (Tesseract mocked).

### 33.4 — Review & correction UI + link to grading _(medium)_

- Extend `DocumentAnalysisPanel` (or a sibling) to show **image + editable text side-by-side**, highlight low-confidence words, and let the teacher edit before saving.
- On confirm: attach the recognised text to the grade/attachment and persist the scan record; honour `keepImage` (discard-after-OCR default).
- Tests: edit-then-save flow, low-confidence highlighting, discard-vs-keep branch.

### 33.5 — Cloud storage, sync & retention _(medium)_

- Migration: `scans` bucket + `scan_metadata` table + RLS (clone `034_recordings_storage.sql`).
- `ScanSync` service (clone `RecordingSync`): blob upload + metadata upsert, `isOffline()`-gated, pending-queue fallback, orphan pruning; signed-URL read.
- `get_overdue_scans()` SQL fn + extend the nightly deletion edge function; ensure student-deletion cascade includes scans.
- Update `supabase/CLAUDE.md` (buckets + tables + edge-function lists).
- Tests: sync round-trip (fake-indexeddb + adapter mocks), retention query, cascade.

### 33.6 — (Optional) server-side handwriting OCR _(medium–large, gated)_

- New `ocr-handwriting` edge function calling the configured cloud ICR provider with the service-role/API key held server-side; request/response validation and status codes per the edge-function rules.
- Client: opt-in setting + explicit consent UI before any upload; auto-suggest only when local confidence is low and a connection exists; hidden entirely offline and on self-hosted (no functions runtime).
- Tests: function request validation, client gating/consent, offline hides path.

### 33.7 — Docs, i18n parity & privacy _(small)_

- **In-app docs** (`DocsPage.tsx` — GradingTab/DataTab): what scanning does, how to reach it, local-vs-server, the keep/discard image choice.
- **`README.md`:** Features + Routes + Key utility modules (new `preprocessScan`, `scanStore`, `ScanSync`).
- **`LandingPage.tsx`:** one teacher-feature card ("Scan & grade handwritten work").
- **`PRIVACY.md`:** new scanned-image data category, storage location, discard-after-OCR default, retention sweep.
- Locale parity across `en/nl/fr/de/es` (guarded by `src/locales/__tests__`).

---

## Cross-cutting regression checklist

- Existing `extractText()` image branch still works for the current document-analysis flow (the new richer return shape must be additive/back-compatible).
- Offline mode: capture → preprocess → local OCR → attach → save works with **no** Supabase and no network.
- No full-entity `localStorage` writes reintroduced; scan bytes live in IndexedDB/Storage only (root `CLAUDE.md` storage rule).
- Supabase client chunk stays lazy — no `services/database` import pulled into the capture/preprocess modules except via `loadDb()`/route-level pages.
- Coverage stays above thresholds; locale key-parity test green; Playwright wiring guard green if e2e specs are added.

## Open decisions to confirm before building

1. **Auto-crop dependency:** ship OpenCV.js/jscanify (bundle cost, lazy-loaded) or manual-crop-only first? _(Plan defaults to manual-crop first.)_
2. **Server ICR provider:** which one, and is it in scope for this phase at all or deferred to 33.6-as-follow-up? _(Plan defaults to building it opt-in but shippable independently.)_
3. **Default retention for scans:** inherit school `retention_years` (7y) like attachments, or a shorter scan-specific default given the sensitivity? _(Plan defaults to inherit; discard-after-OCR already limits exposure.)_
4. **Entry points:** GradeStudent only, or also the standalone attachments/import surface and the student portal? _(Plan defaults to teacher-side GradeStudent + attachments; no student upload.)_
