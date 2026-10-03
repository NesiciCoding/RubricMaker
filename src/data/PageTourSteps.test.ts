import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PAGE_TOURS, getPageTourSteps, type PageTourId } from './PageTourSteps';
import en from '../locales/en.json';
import nl from '../locales/nl.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import es from '../locales/es.json';

const locales: Record<string, { tutorial: Record<string, string> }> = { en, nl, fr, de, es } as never;
const ids = Object.keys(PAGE_TOURS) as PageTourId[];

const pagesDir = path.resolve(__dirname, '../pages');
const pageSources = readdirSync(pagesDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => readFileSync(path.join(pagesDir, f), 'utf8'))
    .join('\n');

describe('PAGE_TOURS', () => {
    it('every target is declared as a data-tour attribute in a page', () => {
        for (const id of ids) {
            for (const { target } of PAGE_TOURS[id]) {
                expect(pageSources, `${id}: ${target}`).toContain(`data-tour="${target}"`);
            }
        }
    });

    it('builds well-formed steps with translation keys', () => {
        const t = (k: string) => k;
        for (const id of ids) {
            const steps = getPageTourSteps(t as never, id);
            expect(steps).toHaveLength(PAGE_TOURS[id].length);
            steps.forEach((s, i) => {
                expect(s.target).toMatch(/^\[data-tour="[a-z-]+"\]$/);
                expect(s.title).toBe(`tutorial.pt_${id}_${i + 1}_title`);
                expect(s.content).toBe(`tutorial.pt_${id}_${i + 1}_content`);
                expect(s.skipBeacon).toBe(true);
            });
        }
    });

    for (const [name, locale] of Object.entries(locales)) {
        it(`${name} has title and content for every step`, () => {
            for (const id of ids) {
                PAGE_TOURS[id].forEach((_, i) => {
                    expect(locale.tutorial[`pt_${id}_${i + 1}_title`], `${id} ${i + 1} title`).toBeTruthy();
                    expect(locale.tutorial[`pt_${id}_${i + 1}_content`], `${id} ${i + 1} content`).toBeTruthy();
                });
            }
        });
    }
});
