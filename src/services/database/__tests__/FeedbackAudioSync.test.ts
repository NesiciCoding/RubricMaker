import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackAudioSync, dataUrlToBlob } from '../FeedbackAudioSync';
import type { StudentRubric, ScoreEntry } from '../../../types';
import type { SupabaseAdapter } from '../SupabaseAdapter';

const DATA_URL = 'data:audio/webm;base64,' + btoa('fake-audio-bytes');

function makeAdapter() {
    return {
        uploadFeedbackAudio: vi.fn(async (suffix: string) => `user1/${suffix}`),
        getFeedbackAudioSignedUrl: vi.fn(async (path: string) => `https://example.com/${path}?token=abc`),
        deleteFeedbackAudio: vi.fn(async () => ({ success: true })),
    } as unknown as SupabaseAdapter;
}

function makeEntry(over: Partial<ScoreEntry> = {}): ScoreEntry {
    return { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '', ...over };
}

function makeSr(entries: ScoreEntry[]): StudentRubric {
    return {
        id: 'sr1',
        rubricId: 'r1',
        studentId: 's1',
        entries,
        overallComment: '',
        isPeerReview: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
    } as StudentRubric;
}

describe('dataUrlToBlob', () => {
    it('parses a base64 data URL', () => {
        const out = dataUrlToBlob(DATA_URL);
        expect(out).not.toBeNull();
        expect(out!.mime).toBe('audio/webm');
        expect(out!.blob.type).toBe('audio/webm');
    });
    it('returns null for a non-data / non-base64 URL', () => {
        expect(dataUrlToBlob('https://example.com/a.webm')).toBeNull();
        expect(dataUrlToBlob('data:audio/webm,notbase64')).toBeNull();
    });
});

describe('FeedbackAudioSync.prepareForPush', () => {
    beforeEach(() => sessionStorage.clear());

    it('uploads inline audio and swaps it for a storage path', async () => {
        const adapter = makeAdapter();
        const sync = new FeedbackAudioSync(adapter);
        const sr = makeSr([makeEntry({ audioDataUrl: DATA_URL })]);

        const out = await sync.prepareForPush(sr);

        expect(adapter.uploadFeedbackAudio).toHaveBeenCalledWith('sr1/c1', expect.anything(), 'audio/webm');
        expect(out.entries[0].audioStoragePath).toBe('user1/sr1/c1');
        expect(out.entries[0].audioDataUrl).toBeUndefined();
    });

    it('is a no-op (same reference) when no entry has inline audio', async () => {
        const adapter = makeAdapter();
        const sync = new FeedbackAudioSync(adapter);
        const sr = makeSr([makeEntry({ audioStoragePath: 'user1/sr1/c1' })]);

        const out = await sync.prepareForPush(sr);

        expect(out).toBe(sr);
        expect(adapter.uploadFeedbackAudio).not.toHaveBeenCalled();
    });

    it('keeps base64 when the upload fails, so playback still works and a retry can happen', async () => {
        const adapter = makeAdapter();
        adapter.uploadFeedbackAudio = vi.fn(async () => null);
        const sync = new FeedbackAudioSync(adapter);
        const sr = makeSr([makeEntry({ audioDataUrl: DATA_URL })]);

        const out = await sync.prepareForPush(sr);

        expect(out.entries[0].audioDataUrl).toBe(DATA_URL);
        expect(out.entries[0].audioStoragePath).toBeUndefined();
    });

    it('does not re-upload the same criterion twice in one session', async () => {
        const adapter = makeAdapter();
        const sync = new FeedbackAudioSync(adapter);
        const sr = makeSr([makeEntry({ audioDataUrl: DATA_URL })]);

        await sync.prepareForPush(sr);
        await sync.prepareForPush(sr); // state still carries base64 until next hydrate

        expect(adapter.uploadFeedbackAudio).toHaveBeenCalledTimes(1);
    });
});

describe('FeedbackAudioSync.inlineForShare', () => {
    it('signs stored paths into audioDataUrl for a self-contained link', async () => {
        const adapter = makeAdapter();
        const sync = new FeedbackAudioSync(adapter);
        const sr = makeSr([makeEntry({ audioStoragePath: 'user1/sr1/c1' })]);

        const out = await sync.inlineForShare(sr);

        expect(adapter.getFeedbackAudioSignedUrl).toHaveBeenCalledWith('user1/sr1/c1', expect.any(Number));
        expect(out.entries[0].audioDataUrl).toContain('https://example.com/user1/sr1/c1');
    });

    it('leaves entries that already carry base64 untouched', async () => {
        const adapter = makeAdapter();
        const sync = new FeedbackAudioSync(adapter);
        const sr = makeSr([makeEntry({ audioDataUrl: DATA_URL, audioStoragePath: 'user1/sr1/c1' })]);

        const out = await sync.inlineForShare(sr);

        expect(out).toBe(sr);
        expect(adapter.getFeedbackAudioSignedUrl).not.toHaveBeenCalled();
    });
});

describe('FeedbackAudioSync.resolveUrl', () => {
    beforeEach(() => sessionStorage.clear());

    it('caches the signed URL in sessionStorage', async () => {
        const adapter = makeAdapter();
        const sync = new FeedbackAudioSync(adapter);

        const a = await sync.resolveUrl('user1/sr1/c1');
        const b = await sync.resolveUrl('user1/sr1/c1');

        expect(a).toBe(b);
        expect(adapter.getFeedbackAudioSignedUrl).toHaveBeenCalledTimes(1);
    });
});
