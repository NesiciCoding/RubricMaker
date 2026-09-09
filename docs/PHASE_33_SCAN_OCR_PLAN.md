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

2. **`jscanify` + OpenCV.js for auto edge-detection & perspective correction — _committed_.**
   A phone photo of paper is skewed, curved, and shadowed; flattening it is the single biggest OCR-quality win, so this phase **commits to auto-crop** rather than shipping manual-crop first. Use **`jscanify`** (MIT, a thin wrapper over OpenCV.js) for automatic page edge-detection + perspective warp, backed by **`opencv.js`** for deskew/adaptive-threshold/denoise. Because OpenCV.js is a ~8 MB WASM payload, it is **lazy-loaded on the scan route only** via dynamic `import()` — never in the main chunk, same rule as `loadDb()` — and the WASM/asset is self-hosted, not pulled from a CDN at runtime. A **manual four-corner adjust** stays available as a fallback when auto-detection misses, but auto-crop is the default path.

3. **_(Deferred — not this phase.)_ Cloud handwriting-recognition provider.**
   Tesseract is trained on printed text; cursive/messy handwriting is where it fails hardest, and no local option fully closes that gap. A high-accuracy cloud ICR path (Google Cloud Vision, Azure AI Vision Read, AWS Textract) is **explicitly deferred to a later phase** — Phase 33 is **local-only**. It's captured here so the storage/consent design leaves room for it, but no edge function, provider account, or opt-in UI is built now.

**Explicitly avoided:** no new state library, no CSS-in-JS, no AI content-generation SDK, and no cloud OCR in this phase.

---

## Category 3 — Local device vs. server-side processing

**Decision for this phase: local-only.** All OCR runs on the teacher's device via Tesseract.js. The server-side path is analysed here for completeness but is **deferred to a later phase** (Category 2, item 3) — nothing server-side is built now.

| Path                                      | Where                                        | Pros                                                                                                | Cons                                                                                                                  |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Local (Tesseract.js + OpenCV prep)** — _this phase_ | Browser, WASM worker             | Works offline; **no student image or text ever leaves the device** (best GDPR posture); zero per-use cost; matches offline-first design | Weak on cursive/messy handwriting; CPU-heavy on low-end devices; language pack download size                          |
| **Server-side (edge function → cloud ICR)** — _deferred_ | Supabase edge function calling a cloud model | Dramatically better handwriting accuracy; offloads CPU from the teacher's device        | Requires network (breaks offline); sends student work to a third party (consent/DPA needed); cost; opt-in complexity |

**Design (local-only for Phase 33):**

- **Preprocessing runs locally** (crop/deskew/threshold via OpenCV.js) — cheap and the biggest accuracy lever regardless of engine.
- **Local Tesseract is the only path.** No network is ever required; the feature works identically with or without a Supabase connection.
- **Leave room for the deferred server path.** Keep a `settings.scanOcr` slice so a future `serverSide` opt-in can be added without reshaping storage or the review UI, but do **not** build the edge function, provider integration, or upload/consent UI in this phase.

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
    - Cursive / dense handwriting → local accuracy is limited; document this honestly in the in-app docs rather than over-promising, and note that a higher-accuracy path is planned for a future phase (the deferred server ICR — Category 2/3). The teacher-correction step (below) is what makes the feature reliable in the meantime.
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

Scans are the most sensitive personal-data category in the app, so retention is **deliberately short — one school year maximum**, well below the 7-year default that attachments inherit.

- **Discard-after-OCR default (privacy-preserving).** A setting `settings.scanOcr.keepImage` (**default `false`**): when off, the image blob is deleted as soon as the teacher confirms the recognised text and it's attached to the grade — we keep the *text*, not the photo. When on, the image is retained (subject to the one-year cap below) for later reference.
- **One-year / school-year cap.** No scan image is retained beyond one school year. Each scan record carries a `schoolYear` stamp (derived at capture from the active school-year setting), and starting a new school year purges the previous year's scans:
    - **Tied to class import.** The natural trigger is the existing "import new classes / roster rollover" flow — when the teacher rolls the roster into a new school year, that action also sweeps scans stamped with prior years (both the IndexedDB blob and, when connected, the bucket object + `scan_metadata` row). This keeps the purge aligned with the moment the teacher is already refreshing their data, and means offline-only teachers still get the cleanup (it isn't solely a server cron).
    - **Backstop sweep (connected deployments):** add a `get_overdue_scans()` SQL function keyed to the one-year cap (not `retention_years`) and extend the nightly `delete-old-attachments` edge function (or a `delete-old-scans` sibling) to purge anything the client-side rollover missed. Runs via Supabase Cron.
    - **Offline backstop:** on app boot, an idempotent local sweep drops IndexedDB scan blobs older than one school year, so a teacher who never triggers a rollover still doesn't accumulate stale images.
- **Manual delete cascades** everywhere: deleting the scan (or its parent grade/student) removes the IndexedDB blob, the Storage object, and the `scan_metadata` row in one action — no orphans.
- **Right-to-erasure (GDPR Art. 17):** student deletion already cascades their records; ensure scans are in that cascade (metadata row + blob + bucket object).
- **Docs:** `PRIVACY.md` §5.5/§5.6 must gain a paragraph on scanned images — what's stored, where, the discard-after-OCR default, and the one-year/school-year purge — since this introduces a new, sensitive personal-data category.

---

## Subphases (logical implementation chunks)

Each subphase is independently shippable and testable; later ones build on earlier ones. Sizes are rough (_small / medium / large_).

### 33.0 — Foundations: types, local storage layer, feature flag _(small)_

- Add domain types to `src/types/index.ts`: `Scan` / `ScanMetadata` (`id`, `studentId?`, `rubricId?`/assignment link, `storagePath?`, `ocrText`, `ocrConfidence`, `lang`, `schoolYear`, `createdAt`) and a `ScanOcrSettings` slice (`keepImage: false`, `defaultLang`). Leave a placeholder for the deferred `serverSide` flag but don't wire it.
- Extend `mediaStore` usage for scan blobs (no schema change — reuse `rm_media`); add a thin `src/services/scanStore.ts` helper if it clarifies ids/prefixes.
- Wire a `useSettings()` slice for `scanOcr` with the safe defaults above; stamp `schoolYear` at capture from the active school-year setting.
- Tests: type/reducer surface, settings defaults.

### 33.1 — Capture & import UI _(medium)_

- New `useCameraCapture` hook (mirror `useMediaRecorder`'s permission/stream/cleanup) + a file/drag-drop importer for existing photos/scanned PDFs.
- **Teacher-only entry points** where scanning naturally fits — **GradeStudent** (scan a student's paper answer while grading) and the existing attachments/import flow; consider the student profile / batch-import surface if it's low-cost. **No student-portal upload** — students never scan or upload images; this is a teacher tool only. The capture surface carries a "what are you scanning?" hint (single column / sparse) feeding PSM later.
- Multi-page PDF: render pages to canvas via `pdfjs-dist` for OCR.
- i18n keys in all five locales; route entry documented.
- Tests: hook (mocked `getUserMedia`), importer, PDF-page rasterisation.

### 33.2 — Local preprocessing pipeline with OpenCV auto-crop _(medium)_

- **`jscanify` + OpenCV.js auto edge-detection & perspective warp**, lazy-loaded (dynamic `import()`) on the scan route only, WASM self-hosted — committed as the default (not manual-crop-first).
- Preprocessing chain around it: grayscale → contrast → Otsu/adaptive threshold → deskew → upscale, exposed as a pure, unit-testable `preprocessScan(imageData, opts)` in `src/utils/`.
- **Manual four-corner adjust** kept as a fallback when auto-detection misses.
- Verify the OpenCV chunk stays out of the main bundle (bundle-analysis job) and never loads outside the scan flow.
- Tests: deterministic pixel transforms on fixtures; auto-crop wrapper with OpenCV mocked.

### 33.3 — OCR engine improvements (local) _(medium)_

- Replace the hardcoded `createWorker('eng')` with language selection (`eng`, `nld`, `fra`, `deu`, `spa`, multi-lang), self-hosted traineddata assets, OEM=LSTM, capture-driven PSM, and optional `user_words`/`user_patterns` from rubric/class vocab.
- Return per-word confidence from `extractFromImage` (extend the return shape without breaking existing callers).
- Tests: language routing, config plumbing, confidence surfaced (Tesseract mocked).

### 33.4 — Review & correction UI + link to grading _(medium)_

- Extend `DocumentAnalysisPanel` (or a sibling) to show **image + editable text side-by-side**, highlight low-confidence words, and let the teacher edit before saving.
- On confirm: attach the recognised text to the grade/attachment and persist the scan record; honour `keepImage` (discard-after-OCR default).
- Tests: edit-then-save flow, low-confidence highlighting, discard-vs-keep branch.

### 33.5 — Cloud storage, sync & one-year retention _(medium)_

- Migration: `scans` bucket + `scan_metadata` table (incl. `school_year`) + RLS (clone `034_recordings_storage.sql`).
- `ScanSync` service (clone `RecordingSync`): blob upload + metadata upsert, `isOffline()`-gated, pending-queue fallback, orphan pruning; signed-URL read.
- **School-year purge, tied to class import:** hook the roster-rollover / class-import flow to sweep prior-year scans (blob + bucket + metadata). Add `get_overdue_scans()` keyed to the one-year cap and extend the nightly deletion edge function as a backstop; add the on-boot local IndexedDB sweep. Ensure student-deletion cascade includes scans.
- Update `supabase/CLAUDE.md` (buckets + tables + edge-function lists).
- Tests: sync round-trip (fake-indexeddb + adapter mocks), one-year purge on rollover, backstop query, cascade.

### 33.6 — _(Deferred, not this phase)_ Server-side handwriting OCR

Recorded for future planning only — **out of scope for Phase 33.** When picked up: a gated `ocr-handwriting` edge function calling a configured cloud ICR provider (key server-side), an opt-in `serverSide` setting with explicit consent UI, auto-suggested only on low local confidence with a live connection, hidden offline and on the self-hosted stack (no functions runtime). The 33.0 types/settings leave room for it so it slots in without reshaping storage or the review UI.

### 33.7 — Docs, i18n parity & privacy _(small)_

- **In-app docs** (`DocsPage.tsx` — GradingTab/DataTab): what scanning does, how to reach it (teacher-only), the keep/discard image choice, and the honest local-accuracy note.
- **`README.md`:** Features + Routes + Key utility modules (new `preprocessScan`, `scanStore`, `ScanSync`).
- **`LandingPage.tsx`:** one teacher-feature card ("Scan & grade handwritten work").
- **`PRIVACY.md`:** new scanned-image data category, storage location, discard-after-OCR default, one-year/school-year purge.
- Locale parity across `en/nl/fr/de/es` (guarded by `src/locales/__tests__`).

---

## Cross-cutting regression checklist

- Existing `extractText()` image branch still works for the current document-analysis flow (the new richer return shape must be additive/back-compatible).
- Offline mode: capture → preprocess → local OCR → attach → save works with **no** Supabase and no network.
- No full-entity `localStorage` writes reintroduced; scan bytes live in IndexedDB/Storage only (root `CLAUDE.md` storage rule).
- Supabase client chunk stays lazy — no `services/database` import pulled into the capture/preprocess modules except via `loadDb()`/route-level pages.
- Coverage stays above thresholds; locale key-parity test green; Playwright wiring guard green if e2e specs are added.

## Resolved decisions

1. **Auto-crop dependency — resolved:** commit to `jscanify` + OpenCV.js auto-crop, lazy-loaded on the scan route only, WASM self-hosted; manual four-corner adjust kept as a fallback.
2. **Server ICR — resolved:** deferred. Phase 33 is local-only; the server path is documented for a future phase but nothing server-side is built now.
3. **Retention — resolved:** one-school-year maximum (not the 7-year attachments default). Purge is triggered by the new-school-year class-import/rollover, with a nightly server backstop and an on-boot local sweep.
4. **Entry points — resolved:** teacher-side only (GradeStudent + attachments/import, optionally student-profile batch import). Students never upload scans through the portal.

## Remaining micro-decisions (safe to settle during build)

- Exact bundle-size budget/threshold for the lazy OpenCV chunk in the analysis job.
- Whether the school-year stamp is calendar-derived or read from an explicit setting, and the cutover month for NL/EU school years.
- Which additional teacher surfaces (beyond GradeStudent) are worth a scan entry point.
