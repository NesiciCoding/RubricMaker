import quarantineUnit from '../../quarantine-unit.json';

// The quarantine schema. Single source of truth — the guard test
// (src/__tests__/quarantineUnit.test.ts) imports it instead of redeclaring it,
// and scripts/apply-unit-quarantine.py writes the same shape.
export type UnitQuarantineEntry = { id: string; file: string; reason: string; since?: string };

// tsc infers the empty list as never[]; the annotation keeps entry.id usable
// whether the list is empty or populated.
const entries: UnitQuarantineEntry[] = quarantineUnit;

/**
 * True when the test identified by `id` is on the flaky-test quarantine list
 * (quarantine-unit.json). Quarantined tests are skipped in every run — local,
 * CI, and the coverage gate — and re-verified weekly by the Quarantine Check
 * workflow, which sets QUARANTINE_DISABLED=1 to force them to run.
 *
 * Usage (single line, so the guard test can check it):
 *
 *     it.skipIf(isQuarantined('detects Arabic'))('detects Arabic', () => { ... });
 *
 * The id must be a substring of the test title — the weekly re-check runs
 * `vitest run <file> -t <id>`, which filters by test name. Keep ids free of
 * regex metacharacters (see src/__tests__/quarantineUnit.test.ts).
 */
export function isQuarantined(id: string): boolean {
    if (process.env.QUARANTINE_DISABLED === '1') return false;
    return entries.some((entry) => entry.id === id);
}
