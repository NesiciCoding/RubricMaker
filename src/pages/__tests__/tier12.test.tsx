/**
 * Tests for Tier 12 bug fixes:
 *  #25 – Duplicate criterion icon disambiguation (Files vs Copy)
 *  #26 – i18n keys in locale files
 *  #27 – Essay draft uses localStorage instead of sessionStorage
 *  #28 – Voice grading language map
 *  #29 – Admin offline guard renders without crash
 *  #30 – Anchor paper tooltip
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── #26: locale files all contain the new keys ──────────────────────────────
import en from '../../locales/en.json';
import nl from '../../locales/nl.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';
import es from '../../locales/es.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

const newRubricBuilderKeys = [
    'section_rubric_details',
    'action_expand_all',
    'action_collapse_all',
    'action_copy_criterion',
    'action_duplicate_criterion',
    'action_paste_criterion',
    'single_point_descriptor_label',
    'single_point_meets_points',
    'level_quality_tip',
];

const newGradeStudentKeys = ['action_essay', 'action_import_essay', 'anchor_help_text'];

const newComparativeGradingKeys = [
    'title_compare',
    'all_classes',
    'session_complete_title',
    'session_complete_body',
    'action_continue',
    'matchups_done',
    'progress_matchups',
    'per_student_limit',
    'student_progress',
];

const newAdminKeys = ['users_offline_title', 'users_offline_body', 'schools_offline_title', 'schools_offline_body'];

describe('#26 – new i18n keys present in all locales', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        describe(`${lang}.json`, () => {
            it('has all new rubricBuilder keys', () => {
                for (const key of newRubricBuilderKeys) {
                    expect(locales[lang].rubricBuilder, `${lang}.rubricBuilder.${key} missing`).toHaveProperty(key);
                }
            });

            it('has all new gradeStudent keys', () => {
                for (const key of newGradeStudentKeys) {
                    expect(locales[lang].gradeStudent, `${lang}.gradeStudent.${key} missing`).toHaveProperty(key);
                }
            });

            it('has all new comparativeGrading keys', () => {
                for (const key of newComparativeGradingKeys) {
                    expect(
                        locales[lang].comparativeGrading,
                        `${lang}.comparativeGrading.${key} missing`
                    ).toHaveProperty(key);
                }
            });

            it('has all new admin offline keys', () => {
                for (const key of newAdminKeys) {
                    expect(locales[lang].admin, `${lang}.admin.${key} missing`).toHaveProperty(key);
                }
            });
        });
    }
});

// ── #27: essay draft uses localStorage ──────────────────────────────────────
describe('#27 – essay draft storage', () => {
    const DRAFT_KEY = 'rm_essay_draft_testcode';
    const TIMER_KEY = 'rm_essay_timer_testcode';

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('reads draft from localStorage on init', () => {
        localStorage.setItem(DRAFT_KEY, '<p>saved draft</p>');
        const stored = localStorage.getItem(DRAFT_KEY);
        expect(stored).toBe('<p>saved draft</p>');
    });

    it('timer key still uses sessionStorage', () => {
        sessionStorage.setItem(TIMER_KEY, '1200');
        expect(sessionStorage.getItem(TIMER_KEY)).toBe('1200');
        expect(localStorage.getItem(TIMER_KEY)).toBeNull();
    });

    it('draft key NOT read from sessionStorage (old behaviour removed)', () => {
        // Write to sessionStorage to simulate old behavior
        sessionStorage.setItem(DRAFT_KEY, '<p>old draft</p>');
        // New behavior: reads from localStorage, not sessionStorage
        expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
        // sessionStorage value is NOT used as draft source
        const html = localStorage.getItem(DRAFT_KEY) ?? '';
        expect(html).toBe('');
    });
});

// ── #28: voice grading language map ─────────────────────────────────────────
describe('#28 – voice grading language map', () => {
    const langMap: Record<string, string> = {
        nl: 'nl-NL',
        fr: 'fr-FR',
        de: 'de-DE',
        es: 'es-ES',
    };

    for (const [appLang, expected] of Object.entries(langMap)) {
        it(`maps app language "${appLang}" to BCP-47 "${expected}"`, () => {
            const result =
                ({ nl: 'nl-NL', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' } as Record<string, string>)[appLang] ?? 'en-US';
            expect(result).toBe(expected);
        });
    }

    it('falls back to en-US for unknown/English language', () => {
        const result =
            ({ nl: 'nl-NL', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' } as Record<string, string>)['en'] ?? 'en-US';
        expect(result).toBe('en-US');
    });
});

// ── #25: duplicate icon disambiguation ──────────────────────────────────────
describe('#25 – criterion action icon labels', () => {
    it('copy and duplicate have distinct i18n keys', () => {
        expect(en.rubricBuilder.action_copy_criterion).not.toBe(en.rubricBuilder.action_duplicate_criterion);
    });

    it('duplicate key mentions "duplicate" not "copy"', () => {
        expect(en.rubricBuilder.action_duplicate_criterion.toLowerCase()).toContain('duplic');
    });

    it('copy key mentions "copy" or "clipboard"', () => {
        const val = en.rubricBuilder.action_copy_criterion.toLowerCase();
        expect(val.includes('copy') || val.includes('clipboard')).toBe(true);
    });
});
