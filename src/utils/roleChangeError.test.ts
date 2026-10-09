import { describe, expect, it } from 'vitest';
import { isLastAdminError } from './roleChangeError';

describe('isLastAdminError', () => {
    it('recognises the database last-admin error', () => {
        expect(isLastAdminError('Cannot remove the last admin')).toBe(true);
    });

    it('ignores other errors and missing messages', () => {
        expect(isLastAdminError('Only admins can change roles')).toBe(false);
        expect(isLastAdminError(undefined)).toBe(false);
        expect(isLastAdminError('')).toBe(false);
    });
});
