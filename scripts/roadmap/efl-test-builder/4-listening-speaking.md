# Phase {N} — EFL test builder: listening & speaking

Plan: `docs/TEST_BUILDER_EFL_EXPANSION_PLAN.md` (§3 A6, A7; §4 B3, B9). Shares TTS and media-recording plumbing.

### Listening controls (A6)

- [ ] Play limit per section/question clip (`maxPlays`, e.g. 2) with counter, logged as a proctor event
- [ ] TTS as a listening-stimulus source (upload still recommended for graded tests, since voices differ per device)
- [ ] Transcript reveal after submission in practice mode

### Dictation (`dictation`, B3)

- [ ] Audio (TTS or uploaded) + typed response
- [ ] Deterministic word-level alignment scoring with partial credit per word (no ASR)

### Audio options / minimal pairs (B9)

- [ ] Per-option audio on MC (TTS text or file) alongside existing option images

### Speaking task structure (A7)

- [ ] `prepSeconds` countdown before recording auto-starts
- [ ] Cue card (bullets / image) during prep
