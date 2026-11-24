/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_STRESS_TEST_LOGGING?: string;
    readonly VITE_ERROR_REPORTING?: string;
}

/** The build identifier stamped into error rows (commit SHA in CI, 'dev' locally); see vite.config.ts. */
declare const __APP_RELEASE__: string;

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
