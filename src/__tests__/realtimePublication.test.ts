import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const migrationsDir = resolve(root, 'supabase/migrations');
const migrations = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(resolve(migrationsDir, file), 'utf8') }));

// StorageSync opens a postgres_changes subscription per entry in its REALTIME_TABLES list.
// A table that isn't a member of the publication never delivers events, so other-device
// changes silently stop arriving — #1005 added `folders` to the subscription list but not
// to `supabase_realtime`, which is exactly this drift.
const syncSource = readFileSync(resolve(root, 'src/services/database/StorageSync.ts'), 'utf8');
const subscribed = [...syncSource.matchAll(/\{\s*table:\s*'(\w+)',\s*filterColumn:/g)].map((m) => m[1]);

/**
 * Tables published by a migration, in either form used in this repo: a direct
 * `ALTER PUBLICATION supabase_realtime ADD TABLE public.x`, or a guarded `DO $$` block whose
 * `ARRAY[...]` of table names is added in a loop (052/047).
 */
function publishedTables(): Set<string> {
    const published = new Set<string>();
    for (const { sql } of migrations) {
        if (!sql.includes('supabase_realtime')) continue;
        for (const m of sql.matchAll(/ALTER\s+PUBLICATION\s+supabase_realtime\s+ADD\s+TABLE\s+(?:public\.)?(\w+)/gi)) {
            published.add(m[1].toLowerCase());
        }
        for (const block of sql.matchAll(/DO \$\$([\s\S]*?)\$\$;/g)) {
            if (!block[1].includes('supabase_realtime')) continue;
            const array = block[1].match(/ARRAY\[([\s\S]*?)\]/);
            if (!array) continue;
            for (const m of array[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)) published.add(m[1]);
        }
    }
    return published;
}

const published = publishedTables();

describe('supabase_realtime publication', () => {
    it('publishes every table StorageSync subscribes to', () => {
        expect(subscribed.length).toBeGreaterThan(20);
        expect(
            subscribed.filter((t) => !published.has(t)),
            'publish these in a migration'
        ).toEqual([]);
    });

    it('publishes folders, so folder changes reach other devices (#850)', () => {
        expect(published).toContain('folders');
    });
});
