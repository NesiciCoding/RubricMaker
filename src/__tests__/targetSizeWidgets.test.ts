import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The widget clusters of 2.5.5 are styled with inline `style` objects rather than through a class
 * in `index.css`, so `targetSizeCss.test.ts` (which resolves the cascade) cannot see them. Each
 * pin names the source block that owns the target and the declarations it must carry, so a block
 * that disappears fails with its own message instead of a regex window quietly matching nothing.
 */
const srcRoot = resolve(__dirname, '..');
const source = (file: string) => readFileSync(resolve(srcRoot, file), 'utf8');
const css = source('index.css');

/** The source from `start` through the first `end` after it, or '' when `start` is missing. */
function block(file: string, [start, end]: [string, string]): string {
    const text = source(file);
    const from = text.indexOf(start);
    if (from === -1) return '';
    const to = text.indexOf(end, from + start.length);
    return to === -1 ? text.slice(from) : text.slice(from, to + end.length);
}

type Pin = {
    file: string;
    label: string;
    /** The block that owns the target. Omit to scan the whole file. */
    block?: [string, string];
    declares: string[];
};

const PINNED: Pin[] = [
    {
        file: 'components/ui/ClassFilterChips.tsx',
        label: 'class filter chips',
        block: ['const chipStyle', '});'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'components/ui/ToggleChipGroup.tsx',
        label: 'school-year / VO-track chips',
        block: ['<button', '</button>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'components/ui/SegmentedToggle.tsx',
        label: 'Cards/List toggle',
        declares: ['minHeight: minTargetHeight ?? 44', 'minTargetHeight?: number'],
    },
    {
        file: 'pages/Dashboard.tsx',
        label: 'snapshot “All classes” chip',
        block: ['onClick={selectAllCohorts}', '</button>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/Dashboard.tsx',
        label: 'snapshot per-class chips',
        block: ['onClick={() => toggleCohort(c.id)}', '</button>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/Dashboard.tsx',
        label: 'needs-grading “View queue” action',
        block: ['const needsGradingWidget', '</span>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'components/Dashboard/StudentSnapshotTable.tsx',
        label: 'snapshot CEFR badge buttons',
        block: ['const badgeButtonStyle', '};'],
        declares: ['minWidth: 44', 'minHeight: 44'],
    },
    {
        file: 'pages/StudentsPage.tsx',
        label: 'cohort chips',
        block: ['const chipStyle', '});'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/StudentsPage.tsx',
        label: 'sortable table header',
        block: ['const sortHeaderButtonStyle', '};'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/RubricGradingQueuePage.tsx',
        label: 'status / group chips',
        block: ['const chipStyle', '});'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/StudentProfilePage.tsx',
        label: 'Overview / Portfolio tabs',
        block: ['role="tab"', '</button>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/DocsPage.tsx',
        label: 'Docs section rail',
        block: ['docs.sections_nav_label', '</nav>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'components/Editor/EssayEditor.tsx',
        label: 'inline formatting toolbar',
        block: ['function ToolbarBtn', 'const selectStyle'],
        declares: ['minWidth: 44', 'minHeight: 44'],
    },
    {
        file: 'components/Editor/EssayEditor.tsx',
        label: 'toolbar selects',
        block: ['const selectStyle', '};'],
        declares: ['height: 44'],
    },
    {
        file: 'pages/SettingsPage.tsx',
        label: 'accent preset swatches',
        block: ['ACCENT_PRESETS.map', '</button>'],
        declares: ['width: 44', 'height: 44'],
    },
    {
        file: 'pages/SettingsPage.tsx',
        label: 'accent colour picker',
        block: ['type="color"', '/>'],
        declares: ['width: 44', 'height: 44'],
    },
    {
        file: 'pages/SettingsPage.tsx',
        label: 'theme-bundle buttons',
        block: ['THEME_BUNDLES.map', '</button>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'components/Students/RubricSelfAssessPanel.tsx',
        label: 'self-assessment level buttons',
        block: ['criterion.levels.map', '</button>'],
        declares: ['minHeight: 44'],
    },
    {
        file: 'pages/SelfAssessPage.tsx',
        label: 'self-assessment confidence scale',
        block: ['as ConfidenceLevel[]', '</button>'],
        declares: ['minHeight: 44'],
    },
];

describe('inline-styled targets at 44 px (#533, WCAG 2.5.5)', () => {
    for (const pin of PINNED) {
        it(`${pin.label}: ${pin.file}`, () => {
            const text = pin.block ? block(pin.file, pin.block) : source(pin.file);
            expect(text, pin.block ? `${pin.file} no longer contains ${pin.block[0]}` : pin.file).not.toBe('');
            for (const declaration of pin.declares) {
                expect(text, `${pin.label} no longer declares ${declaration}`).toContain(declaration);
            }
        });
    }

    it('gives the borderless grade-scale name its own visible focus ring', () => {
        // The shared field rule sets `outline: none` and this field has no border colour of its
        // own, so the ring has to be declared here; nothing else on the field shows focus.
        expect(source('pages/SettingsPage.tsx')).toMatch(/className="grade-scale-name"/);
        const focus = block('index.css', ['.grade-scale-name:focus-visible', '}']);
        expect(focus).toContain('outline: 2px solid var(--accent)');
    });

    it('does not hide keyboard focus on any Settings control', () => {
        // Every borderless control in Settings relies on the global :focus-visible ring, so an
        // inline `outline: none` anywhere in the page would hide focus again.
        expect(source('pages/SettingsPage.tsx')).not.toMatch(/outline:\s*'none'/);
        expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/);
    });
});
