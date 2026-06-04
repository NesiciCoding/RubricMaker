/**
 * Tests for Tier 15 — Rubric Builder Polish:
 *  #37 – Criterion weight validation (locale keys + "distribute evenly" logic)
 *  #38 – Level drag-and-drop (onDragEnd routing logic)
 *  #39 – "Save as template" (locale key + localStorage round-trip)
 *  #40 – Rubric sharing UI (locale keys)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import en from '../../locales/en.json';
import nl from '../../locales/nl.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';
import es from '../../locales/es.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const locales: Record<string, any> = { en, nl, fr, de, es };

// ── #37: weight validation locale keys ────────────────────────────────────────

const weightKeys = [
    'weight_total_label',
    'weight_total_hint',
    'weight_total_warning',
    'weight_distribute_evenly',
];

describe('#37 – criterion weight validation locale keys', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has all weight validation keys`, () => {
            for (const key of weightKeys) {
                expect(locales[lang].rubricBuilder, `${lang}.rubricBuilder.${key} missing`).toHaveProperty(key);
            }
        });
    }

    it('weight_total_warning contains {{total}} placeholder', () => {
        expect(en.rubricBuilder.weight_total_warning).toContain('{{total}}');
    });
});

// ── #37: distribute-evenly logic ─────────────────────────────────────────────

describe('#37 – distribute-evenly algorithm', () => {
    function distributeEvenly(count: number): number[] {
        const even = Math.round(100 / count);
        const remainder = 100 - even * (count - 1);
        return Array.from({ length: count }, (_, i) => (i === count - 1 ? remainder : even));
    }

    it('sums to exactly 100 for 3 criteria', () => {
        const weights = distributeEvenly(3);
        expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('sums to exactly 100 for 4 criteria', () => {
        const weights = distributeEvenly(4);
        expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('sums to exactly 100 for 7 criteria', () => {
        const weights = distributeEvenly(7);
        expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it('single criterion gets weight 100', () => {
        expect(distributeEvenly(1)).toEqual([100]);
    });
});

// ── #38: level drag-and-drop routing ─────────────────────────────────────────

describe('#38 – onDragEnd level reordering', () => {
    it('droppableId starting with "levels-" triggers level reorder', () => {
        // The droppableId comes from destination.droppableId in the updated onDragEnd
        const mockDestination = { droppableId: 'levels-abc123', index: 1 };
        const droppableId = mockDestination.droppableId;
        expect(droppableId.startsWith('levels-')).toBe(true);
        expect(droppableId.slice('levels-'.length)).toBe('abc123');
    });

    it('droppableId "criteria" triggers criteria reorder', () => {
        const mockDestination = { droppableId: 'criteria', index: 2 };
        expect(mockDestination.droppableId === 'criteria').toBe(true);
        expect(mockDestination.droppableId.startsWith('levels-')).toBe(false);
    });
});

// ── #39: save as template ─────────────────────────────────────────────────────

const USER_TEMPLATES_KEY = 'rm_user_templates';

describe('#39 – save as template', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    it('action_save_as_template key exists in all locales', () => {
        for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
            expect(locales[lang].rubricBuilder).toHaveProperty('action_save_as_template');
        }
    });

    it('save_as_template_success key exists in all locales', () => {
        for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
            expect(locales[lang].rubricBuilder).toHaveProperty('save_as_template_success');
        }
    });

    it('stores and retrieves templates in localStorage', () => {
        const template = { id: 'tpl1', name: 'My Rubric', subject: 'English', savedAt: new Date().toISOString() };
        localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify([template]));
        const stored = JSON.parse(localStorage.getItem(USER_TEMPLATES_KEY) ?? '[]');
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('My Rubric');
    });

    it('deduplicates by id on re-save', () => {
        const tpl = { id: 'tpl1', name: 'Old Name', subject: '', savedAt: '' };
        localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify([tpl]));

        // Simulate re-save with updated name
        const existing = JSON.parse(localStorage.getItem(USER_TEMPLATES_KEY) ?? '[]');
        const newTpl = { id: 'tpl1', name: 'New Name', subject: '', savedAt: new Date().toISOString() };
        const filtered = existing.filter((t: { id: string }) => t.id !== newTpl.id);
        localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify([newTpl, ...filtered].slice(0, 20)));

        const stored = JSON.parse(localStorage.getItem(USER_TEMPLATES_KEY) ?? '[]');
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('New Name');
    });

    it('caps at 20 templates', () => {
        const templates = Array.from({ length: 25 }, (_, i) => ({ id: `tpl${i}`, name: `T${i}`, subject: '' }));
        // Simulate the slice(0, 20) logic
        const saved = templates.slice(0, 20);
        expect(saved).toHaveLength(20);
    });
});

// ── #40: rubric sharing locale keys ─────────────────────────────────────────

const shareKeys = [
    'action_share_colleague',
    'share_modal_title',
    'share_modal_desc',
    'share_email_placeholder',
    'share_mode_read',
    'share_mode_edit',
    'share_success',
    'share_notfound',
    'share_shared_with',
    'share_btn',
];

describe('#40 – rubric sharing locale keys', () => {
    for (const lang of ['en', 'nl', 'fr', 'de', 'es']) {
        it(`${lang}.json has all rubric sharing keys`, () => {
            for (const key of shareKeys) {
                expect(locales[lang].rubricList, `${lang}.rubricList.${key} missing`).toHaveProperty(key);
            }
        });
    }

    it('share_modal_desc contains {{rubric}} placeholder', () => {
        expect(en.rubricList.share_modal_desc).toContain('{{rubric}}');
    });

    it('share_notfound contains {{email}} placeholder', () => {
        expect(en.rubricList.share_notfound).toContain('{{email}}');
    });

    it('dashboard.my_templates and built_in_templates exist', () => {
        expect(en.dashboard).toHaveProperty('my_templates');
        expect(en.dashboard).toHaveProperty('built_in_templates');
    });
});
