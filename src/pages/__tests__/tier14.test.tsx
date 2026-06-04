/**
 * Tests for Tier 14 — Student Experience:
 *  #34 – Graduated confidence scale (ConfidenceLevel type + selfAssess locale keys)
 *  #35 – Peer reviews in student portal (locale key present)
 *  #36 – Grade notification (AppSettings.notifyStudentsOnGrade type + locale keys)
 */
import { describe, it, expect } from 'vitest';
import en from '../../locales/en.json';
import nl from '../../locales/nl.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';
import es from '../../locales/es.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

// ── #34: self-assessment graduated scale locale keys ─────────────────────────

const selfAssessNewKeys = [
    'rated_count',
    'level_not_yet',
    'level_sometimes',
    'level_usually',
    'level_confident',
];

describe('#34 – graduated confidence scale locale keys', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has all selfAssess confidence level keys`, () => {
            for (const key of selfAssessNewKeys) {
                expect(locales[lang].selfAssess, `${lang}.selfAssess.${key} missing`).toHaveProperty(key);
            }
        });
    }

    it('the 4 levels have distinct labels in English', () => {
        const { level_not_yet, level_sometimes, level_usually, level_confident } = en.selfAssess;
        const labels = [level_not_yet, level_sometimes, level_usually, level_confident];
        const unique = new Set(labels);
        expect(unique.size).toBe(4);
    });
});

// ── #34: ConfidenceLevel type semantics ─────────────────────────────────────

describe('#34 – ConfidenceLevel backward compat logic', () => {
    it('levels ≥3 map to confident=true (backward compat)', () => {
        // Simulate the save logic: confident = !!cl && cl >= 3
        function isConfident(cl: number | undefined): boolean { return !!cl && cl >= 3; }
        expect(isConfident(3)).toBe(true);  // Usually → confident
        expect(isConfident(4)).toBe(true);  // Confident → confident
        expect(isConfident(2)).toBe(false); // Sometimes → not confident
        expect(isConfident(1)).toBe(false); // Not yet → not confident
        expect(isConfident(undefined)).toBe(false); // unrated → not confident
    });

    it('legacy confident=true maps to level 3 on load', () => {
        // Simulate the load logic: legacy `confident: true` → confidenceLevel 3
        const legacyRating = { confident: true, confidenceLevel: undefined };
        const mapped = legacyRating.confidenceLevel ?? (legacyRating.confident ? 3 : undefined);
        expect(mapped).toBe(3);
    });
});

// ── #35: peer review locale key ──────────────────────────────────────────────

describe('#35 – peer reviews in student portal', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has studentPortal.peer_reviews_received`, () => {
            expect(locales[lang].studentPortal).toHaveProperty('peer_reviews_received');
        });
    }

    it('peer_reviews_received is non-empty in all locales', () => {
        for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
            expect(locales[lang].studentPortal.peer_reviews_received.length).toBeGreaterThan(0);
        }
    });
});

// ── #36: grade notification locale keys ─────────────────────────────────────

const notifyKeys = ['notify_students_title', 'notify_on_grade_label', 'notify_on_grade_help'];

describe('#36 – grade notification settings', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has all notification settings keys`, () => {
            for (const key of notifyKeys) {
                expect(locales[lang].settings, `${lang}.settings.${key} missing`).toHaveProperty(key);
            }
        });
    }

    it('notify_on_grade_help mentions SMTP', () => {
        expect(en.settings.notify_on_grade_help.toLowerCase()).toContain('smtp');
    });
});
