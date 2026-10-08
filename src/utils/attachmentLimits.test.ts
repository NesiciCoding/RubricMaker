import { describe, it, expect } from 'vitest';
import {
    attachmentMaxBytes,
    CLOUD_ATTACHMENT_MAX_BYTES,
    formatFileSize,
    LOCAL_ATTACHMENT_MAX_BYTES,
} from './attachmentLimits';

describe('attachmentLimits', () => {
    it('allows larger files only with a database connection', () => {
        expect(attachmentMaxBytes(false)).toBe(LOCAL_ATTACHMENT_MAX_BYTES);
        expect(attachmentMaxBytes(true)).toBe(CLOUD_ATTACHMENT_MAX_BYTES);
    });

    it('formats sizes in B, KB and MB', () => {
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(1536)).toBe('1.5 KB');
        expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
    });
});
