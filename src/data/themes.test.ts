import { describe, it, expect } from 'vitest';
import { THEME_BUNDLES } from './themes';
import en from '../locales/en.json';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

describe('THEME_BUNDLES', () => {
    it('has exactly 5 bundles', () => {
        expect(THEME_BUNDLES).toHaveLength(5);
    });

    it('has unique ids', () => {
        const ids = THEME_BUNDLES.map((b) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes the expected bundle ids', () => {
        const ids = THEME_BUNDLES.map((b) => b.id).sort();
        expect(ids).toEqual(['academy', 'midnight', 'nature', 'slate', 'warm']);
    });

    it.each(THEME_BUNDLES)('bundle "$id" has valid, non-empty fields', (bundle) => {
        expect(bundle.accent).toMatch(HEX_RE);
        expect(bundle.headerColor).toMatch(HEX_RE);
        expect(typeof bundle.font).toBe('string');
        expect(bundle.font.length).toBeGreaterThan(0);
        expect(typeof bundle.exportFont).toBe('string');
        expect(bundle.exportFont.length).toBeGreaterThan(0);
    });

    it.each(THEME_BUNDLES)('bundle "$id" has a corresponding "themes.$id" key in en.json', (bundle) => {
        expect(bundle.labelKey).toBe(`themes.${bundle.id}`);
        const themes = (en as Record<string, unknown>).themes as Record<string, string> | undefined;
        expect(themes).toBeDefined();
        expect(themes?.[bundle.id]).toBeDefined();
        expect(typeof themes?.[bundle.id]).toBe('string');
        expect(themes?.[bundle.id].length).toBeGreaterThan(0);
    });

    it('en.json has a themes.section_title key', () => {
        const themes = (en as Record<string, unknown>).themes as Record<string, string> | undefined;
        expect(themes?.section_title).toBeDefined();
        expect(typeof themes?.section_title).toBe('string');
    });
});
