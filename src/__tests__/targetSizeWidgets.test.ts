import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The widget clusters of 2.5.5 are styled with inline `style` objects rather than through a class
 * in `index.css`, so `targetSizeCss.test.ts` — which resolves the cascade — cannot see them. Pin
 * the shared ones at the source level: each must carry a 44 px floor. Widgets that are deliberately
 * still short are measured and listed in REPORT §10, and are not pinned here.
 */
const srcRoot = resolve(__dirname, '..');
const source = (file: string) => readFileSync(resolve(srcRoot, file), 'utf8');
const css = source('index.css');

const PINNED: { file: string; label: string; pattern: RegExp; occurrences?: number }[] = [
    {
        file: 'components/ui/ClassFilterChips.tsx',
        label: 'class filter chips',
        pattern: /minHeight: 44/g,
        occurrences: 1,
    },
    {
        file: 'components/ui/ToggleChipGroup.tsx',
        label: 'school-year / VO-track chips',
        pattern: /minHeight: 44/g,
        occurrences: 1,
    },
    {
        file: 'components/ui/SegmentedToggle.tsx',
        label: 'Cards/List toggle',
        pattern: /minHeight: minTargetHeight \?\? 44/,
    },
    {
        file: 'pages/Dashboard.tsx',
        label: 'snapshot cohort chips',
        pattern: /minHeight: 44/g,
        occurrences: 2,
    },
    {
        file: 'pages/StudentsPage.tsx',
        label: 'cohort chips',
        pattern: /const chipStyle[\s\S]{0,240}?minHeight: 44/,
    },
    {
        file: 'pages/StudentsPage.tsx',
        label: 'sortable table header',
        pattern: /sortHeaderButtonStyle[\s\S]{0,240}?minHeight: 44/,
    },
    {
        file: 'pages/RubricGradingQueuePage.tsx',
        label: 'status / group chips',
        pattern: /const chipStyle[\s\S]{0,240}?minHeight: 44/,
    },
    {
        file: 'pages/StudentProfilePage.tsx',
        label: 'Overview / Portfolio tabs',
        pattern: /role="tab"[\s\S]{0,600}?minHeight: 44/,
    },
    {
        file: 'pages/SettingsPage.tsx',
        label: 'accent preset swatches',
        pattern: /ACCENT_PRESETS\.map[\s\S]{0,1200}?width: 44[\s\S]{0,120}?height: 44/,
    },
    {
        file: 'pages/SettingsPage.tsx',
        label: 'accent colour picker',
        pattern: /type="color"[\s\S]{0,600}?width: 44[\s\S]{0,120}?height: 44/,
    },
    {
        file: 'pages/SettingsPage.tsx',
        label: 'theme-bundle buttons',
        pattern: /THEME_BUNDLES\.map[\s\S]{0,2400}?minHeight: 44/,
    },
    {
        file: 'pages/DocsPage.tsx',
        label: 'Docs section rail',
        pattern: /docs\.sections_nav_label[\s\S]{0,3600}?minHeight: 44/,
    },
    {
        file: 'components/Editor/EssayEditor.tsx',
        label: 'inline formatting toolbar',
        pattern: /function ToolbarBtn[\s\S]{0,420}?minWidth: 44[\s\S]{0,40}?minHeight: 44/,
    },
    {
        file: 'components/Editor/EssayEditor.tsx',
        label: 'toolbar selects',
        pattern: /const selectStyle[\s\S]{0,320}?height: 44/,
    },
];

describe('inline-styled targets at 44 px (#533, WCAG 2.5.5)', () => {
    for (const pin of PINNED) {
        it(`${pin.label}: ${pin.file}`, () => {
            const matches = source(pin.file).match(pin.pattern) ?? [];
            expect(matches.length).toBeGreaterThanOrEqual(pin.occurrences ?? 1);
        });
    }

    it('leaves the accent swatches a visible keyboard focus ring', () => {
        const settings = source('pages/SettingsPage.tsx');
        const start = settings.indexOf('ACCENT_PRESETS.map');
        const swatch = settings.slice(start, settings.indexOf('</button>', start));
        // An inline `outline: none` would beat the global ring and leave keyboard focus invisible.
        expect(swatch).not.toMatch(/outline:\s*'none'/);
        // That only works because :focus-visible still paints the ring.
        expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/);
    });

    it('keeps the segmented toggle opt-in override, so a caller can still ask for another height', () => {
        const toggle = source('components/ui/SegmentedToggle.tsx');
        expect(toggle).toMatch(/minTargetHeight\?: number/);
    });
});
