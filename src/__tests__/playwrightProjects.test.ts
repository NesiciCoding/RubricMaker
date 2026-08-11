import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type ProjectConfig = {
    name: string;
    testMatch: string[];
    testIgnore: string[];
};

type QuarantineEntry = { spec: string; reason?: string; since?: string };

// Parse playwright.config.ts's `projects` array with light string surgery.
// The config is stable and this test is precisely meant to fail loudly if the
// wiring it guards ever changes shape.
function extractProjects(): ProjectConfig[] {
    const text = readFileSync(path.join(repoRoot, 'playwright.config.ts'), 'utf8');
    const start = text.indexOf('projects: [');
    const end = text.indexOf('webServer:');
    expect(start, 'projects array not found in playwright.config.ts').toBeGreaterThan(-1);
    expect(end, 'webServer block not found after projects in playwright.config.ts').toBeGreaterThan(start);

    const section = text.slice(start + 'projects: ['.length, end);
    return section
        .split(/name:\s*'/)
        .slice(1)
        .map((chunk) => {
            const name = chunk.slice(0, chunk.indexOf("'"));
            const stringList = (re: RegExp): string[] => {
                const body = chunk.match(re)?.[1];
                if (body === undefined) return [];
                return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
            };
            return {
                name,
                testMatch: stringList(/testMatch:\s*\[([\s\S]*?)\]/),
                testIgnore: stringList(/testIgnore:\s*\[([\s\S]*?)\]/),
            };
        });
}

// Minimal glob → RegExp for the subset of patterns the config uses
// (`**/foo.spec.ts`, plain file names). `**/` matches zero or more directories.
function globToRegExp(pattern: string): RegExp {
    let re = '^';
    for (let i = 0; i < pattern.length;) {
        const c = pattern[i];
        if (c === '*') {
            if (pattern[i + 1] === '*') {
                if (pattern[i + 2] === '/') {
                    re += '(?:.*/)?';
                    i += 3;
                } else {
                    re += '.*';
                    i += 2;
                }
                continue;
            }
            re += '[^/]*';
            i += 1;
            continue;
        }
        if (c === '?') {
            re += '[^/]';
            i += 1;
            continue;
        }
        if ('\\^$.|+()[]{}'.includes(c)) {
            re += '\\' + c;
            i += 1;
            continue;
        }
        re += c;
        i += 1;
    }
    return new RegExp(re + '$');
}

function matchesAny(patterns: string[], relPath: string): boolean {
    return patterns.some((p) => globToRegExp(p).test(relPath));
}

// A project without an explicit testMatch runs every spec in testDir.
function includesSpec(project: ProjectConfig, relPath: string): boolean {
    if (project.testMatch.length > 0 && !matchesAny(project.testMatch, relPath)) return false;
    return !matchesAny(project.testIgnore, relPath);
}

describe('Playwright project wiring', () => {
    const specs = readdirSync(path.join(repoRoot, 'e2e', 'specs')).filter((f) => f.endsWith('.spec.ts'));
    const quarantine = JSON.parse(
        readFileSync(path.join(repoRoot, 'e2e', 'quarantine.json'), 'utf8')
    ) as QuarantineEntry[];
    const quarantinedSpecs = new Set(quarantine.map((q) => q.spec));
    // The quarantine project's testMatch is derived from the JSON (not a literal
    // array), so the text parser can't see it — treat the quarantine list itself
    // as that project's coverage, which is exactly what it means.
    const projects = extractProjects().filter((p) => p.name !== 'quarantine');
    const rel = (spec: string) => `e2e/specs/${spec}`;

    it('defines projects', () => {
        expect(projects.length).toBeGreaterThan(0);
    });

    it('has unique project names', () => {
        const names = projects.map((p) => p.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('every e2e spec is run by at least one project (unless quarantined)', () => {
        const uncovered = specs.filter(
            (spec) => !quarantinedSpecs.has(spec) && !projects.some((p) => includesSpec(p, rel(spec)))
        );
        expect(uncovered).toEqual([]);
    });

    it('supabase-project specs are excluded from the default chromium run', () => {
        const chromium = projects.find((p) => p.name === 'chromium');
        const supabase = projects.find((p) => p.name === 'supabase');
        expect(chromium, 'expected a chromium project').toBeDefined();
        expect(supabase, 'expected a supabase project').toBeDefined();

        // Specs that need a live Supabase connection must not also run in the
        // default browser projects (they'd fail without a DB) — and by the test
        // above they must still be covered by some other project.
        const doubleRuns = specs.filter(
            (spec) => includesSpec(chromium!, rel(spec)) && includesSpec(supabase!, rel(spec))
        );
        expect(doubleRuns).toEqual([]);
    });

    it('npm scripts only reference existing projects', () => {
        const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
        const names = projects.map((p) => p.name);
        for (const scriptName of ['e2e:chromium', 'e2e:supabase']) {
            const cmd: string = pkg.scripts?.[scriptName];
            expect(cmd, `missing npm script ${scriptName}`).toBeDefined();
            const referenced = [...cmd.matchAll(/--project=([a-z-]+)/g)].map((m) => m[1]);
            for (const name of referenced) {
                expect(names, `${scriptName} references unknown project "${name}"`).toContain(name);
            }
        }
    });

    describe('quarantine list', () => {
        it('only references specs that exist', () => {
            const missing = quarantine.filter((q) => !specs.includes(q.spec)).map((q) => q.spec);
            expect(missing).toEqual([]);
        });

        it('has no duplicate entries', () => {
            expect(new Set(quarantinedSpecs).size).toBe(quarantine.length);
        });

        it('every entry names a spec file with a reason', () => {
            for (const entry of quarantine) {
                expect(entry.spec, `entry without spec: ${JSON.stringify(entry)}`).toMatch(/\.spec\.ts$/);
                expect(entry.reason?.trim().length ?? 0, `entry without reason: ${entry.spec}`).toBeGreaterThan(0);
            }
        });

        it('every entry records a valid quarantine date (since)', () => {
            const today = new Date().toISOString().slice(0, 10);
            for (const entry of quarantine) {
                expect(entry.since, `entry without since: ${entry.spec}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                expect(entry.since! <= today, `since in the future for ${entry.spec}`).toBe(true);
            }
        });
    });
});
