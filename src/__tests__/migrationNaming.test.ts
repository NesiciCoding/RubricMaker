import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../../supabase/migrations');
const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

// Already applied on existing remotes under this version, so renaming it would make
// `supabase db push` see a missing remote version. It sorts after every NNN_ file,
// which is why remotes that applied it need `db push --include-all` (see supabase/CLAUDE.md).
const LEGACY_TIMESTAMPED = ['20260617093844_delete_old_attachments_fn.sql'];

const SEQUENTIAL = /^(\d{3})_[a-z0-9_]+\.sql$/;

describe('supabase migration naming', () => {
    it('uses the NNN_description.sql convention for every new migration', () => {
        const offenders = files.filter((f) => !SEQUENTIAL.test(f) && !LEGACY_TIMESTAMPED.includes(f));
        expect(offenders).toEqual([]);
    });

    it('keeps the legacy timestamped allow-list in sync with the directory', () => {
        for (const f of LEGACY_TIMESTAMPED) expect(files).toContain(f);
    });

    it('never reuses a migration number', () => {
        const numbers = files.map((f) => SEQUENTIAL.exec(f)?.[1]).filter((n): n is string => n !== undefined);
        const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
        expect(numbers.length).toBeGreaterThan(0);
        expect(duplicates).toEqual([]);
    });
});
