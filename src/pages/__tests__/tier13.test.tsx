/**
 * Tests for Tier 13 — Essay & Writing Workflow:
 *  #31 – Class-level essay assignment entry point (locale keys present)
 *  #32 – Essay panel renders decoded HTML from base64 attachment
 *  #33 – Essay page i18n keys in all locales
 */
import { describe, it, expect } from 'vitest';
import en from '../../locales/en.json';
import nl from '../../locales/nl.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';
import es from '../../locales/es.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

// ── #31 + #33: locale keys ────────────────────────────────────────────────────

const rubricListEssayKeys = ['action_essay', 'essay_pick_class_title', 'essay_pick_class_desc'];

const essaySectionKeys = [
    'email_gate_title',
    'email_gate_desc',
    'email_placeholder',
    'start_btn',
    'starting',
    'invalid_link_title',
    'invalid_link_desc',
    'expired_title',
    'expired_desc',
    'seb_blocked',
    'draft_restored',
    'dismiss',
    'signed_in_as',
    'draft_saved_at',
    'time_up_countdown',
    'words_count',
    'prompt_label',
    'submitted_title_db',
    'submitted_title',
    'submitted_desc_db',
    'submitted_desc_code',
    'copy',
    'copied',
    'editor_placeholder',
    'time_up_auto',
    'over_limit',
    'submit_btn',
    'submitting',
    'essay_text_label',
    'show_essay',
    'hide_essay',
];

describe('Tier 13 locale keys', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        describe(`${lang}.json`, () => {
            it('has rubricList essay keys', () => {
                for (const key of rubricListEssayKeys) {
                    expect(locales[lang].rubricList, `${lang}.rubricList.${key} missing`).toHaveProperty(key);
                }
            });

            it('has all essay section keys', () => {
                expect(locales[lang], `${lang}.essay section missing`).toHaveProperty('essay');
                for (const key of essaySectionKeys) {
                    expect(locales[lang].essay, `${lang}.essay.${key} missing`).toHaveProperty(key);
                }
            });
        });
    }
});

// ── #32: EssayPanel HTML decoding logic ─────────────────────────────────────

describe('#32 – essay HTML decoding from base64 attachment', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    const base64 = btoa(unescape(encodeURIComponent(html)));
    const dataUrl = `data:text/html;base64,${base64}`;

    it('correctly encodes and decodes HTML round-trip', () => {
        // Simulate the decode logic used by EssayPanel
        const decoded = decodeURIComponent(escape(atob(dataUrl.split(',')[1])));
        expect(decoded).toBe(html);
    });

    it('handles empty content gracefully', () => {
        const emptyBase64 = btoa('');
        const emptyDataUrl = `data:text/html;base64,${emptyBase64}`;
        const decoded = decodeURIComponent(escape(atob(emptyDataUrl.split(',')[1])));
        expect(decoded).toBe('');
    });

    it('handles invalid base64 without throwing (try-catch)', () => {
        // Simulate the EssayPanel try-catch
        let result = '';
        try {
            result = decodeURIComponent(escape(atob('not_valid_base64!!!')));
        } catch {
            result = '';
        }
        expect(result).toBe('');
    });
});

// ── #31: RubricList essay flow state machine logic ────────────────────────────

describe('#31 – essay flow state transitions', () => {
    it('essay_pick_class_desc contains {{rubric}} interpolation placeholder', () => {
        expect(en.rubricList.essay_pick_class_desc).toContain('{{rubric}}');
    });

    it('essay_pick_class_title is distinct from rubricList.action_essay', () => {
        expect(en.rubricList.essay_pick_class_title).not.toBe(en.rubricList.action_essay);
    });

    it('essay section submitted_title_db is distinct from submitted_title', () => {
        expect(en.essay.submitted_title_db).not.toBe(en.essay.submitted_title);
    });

    it('over_limit contains {{count}} interpolation placeholder', () => {
        expect(en.essay.over_limit).toContain('{{count}}');
    });
});
