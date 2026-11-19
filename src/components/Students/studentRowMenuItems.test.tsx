import { describe, expect, it, vi } from 'vitest';
import { studentRowMenuItems } from './studentRowMenuItems';

const labels = {
    gradeLast: 'grade',
    profile: 'profile',
    copySummary: 'summary',
    generatePassword: 'password',
    edit: 'edit',
    remove: 'remove',
};

const base = { labels, openProfile: vi.fn(), copySummary: vi.fn(), edit: vi.fn(), remove: vi.fn() };
const keys = (args: Parameters<typeof studentRowMenuItems>[0]) => studentRowMenuItems(args).map((i) => i.key);

describe('studentRowMenuItems', () => {
    it('leaves out Grade and the password slip when they do not apply', () => {
        expect(keys(base)).toEqual(['profile', 'summary', 'edit', 'delete']);
    });

    it('offers Grade and the password slip when they apply, with Delete last and dangerous', () => {
        const items = studentRowMenuItems({ ...base, gradeLast: vi.fn(), generatePassword: vi.fn() });
        expect(items.map((i) => i.key)).toEqual(['grade', 'profile', 'summary', 'password', 'edit', 'delete']);
        expect(items.filter((i) => i.danger).map((i) => i.key)).toEqual(['delete']);
    });

    it('runs the matching action for each item', () => {
        const remove = vi.fn();
        studentRowMenuItems({ ...base, remove })
            .find((i) => i.key === 'delete')
            ?.onSelect();
        expect(remove).toHaveBeenCalledOnce();
    });
});
