export type DbModule = typeof import('./index');

let dbModule: DbModule | null = null;
let dbModulePromise: Promise<DbModule> | null = null;

// Splits @supabase/supabase-js + the sync adapters (~450KB) into their own chunk,
// fetched only once something actually needs a database connection — a landing-page
// visitor on a build with no Supabase config configured never downloads it.
export function loadDb(): Promise<DbModule> {
    if (!dbModulePromise) {
        dbModulePromise = import('./index').then((m) => {
            dbModule = m;
            return m;
        });
    }
    return dbModulePromise;
}

/** Synchronous best-effort accessor for call sites that can't await — null until loadDb() resolves. */
export function getDb(): DbModule | null {
    return dbModule;
}
