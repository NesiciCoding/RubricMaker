import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getDocsRoutePaths } from '../DocsPage';

// F13: fail CI when App.tsx / main.tsx gain a route that DocsPage's route map
// doesn't document (or vice versa for documented-but-removed routes).
// Automation note: DocsPage exports getRouteTree/getDocsRoutePaths as the single
// source of truth for the map, and this test runs inside the default `npm test`
// (vitest) suite, so no extra CI job is needed — any route change that doesn't
// update the map breaks the build.
const t = ((k: string) => k) as unknown as import('i18next').TFunction;

function sourceRoutes(): string[] {
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf8');
    const mainSrc = fs.readFileSync(path.resolve(__dirname, '../../main.tsx'), 'utf8');
    const combined = `${appSrc}\n${mainSrc}`;
    const found = new Set<string>();
    for (const m of combined.matchAll(/path\s*[:=]\s*["']([^"']+)["']/g)) found.add(m[1]);
    return [...found];
}

describe('DocsPage route map — drift guard', () => {
    it('documents every teacher/student route', () => {
        const documented = new Set(getDocsRoutePaths(t));
        const routed = sourceRoutes();
        // Only assert the app-facing routes the map promises to cover; infra
        // wildcards and the root index are rendered implicitly.
        const mustDocument = routed.filter((r) => r !== '*' && r !== '/');
        const missing = mustDocument.filter((r) => !documented.has(r));
        expect(missing).toEqual([]);
    });

    it('contains no routes that no longer exist', () => {
        const documented = getDocsRoutePaths(t);
        const routed = new Set(sourceRoutes());
        const stale = documented.filter((r) => r !== '/' && !routed.has(r));
        expect(stale).toEqual([]);
    });
});
