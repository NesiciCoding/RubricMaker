import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import type { Rubric, Student, StudentRubric, ScoreEntry } from '../../src/types';

// Build a StudentRubric where every criterion is scored at the given level index
// (0 = best level, last index = worst level in the rubric's levels array)
function srAtLevel(rubric: Rubric, student: Student, levelIndex: number): StudentRubric {
    const entries: ScoreEntry[] = rubric.criteria.map((c) => {
        const idx = Math.min(levelIndex, c.levels.length - 1);
        return { criterionId: c.id, levelId: c.levels[idx].id, comment: '', checkedSubItems: [] };
    });
    return buildStudentRubric(rubric, student, { entries });
}

test.describe('Statistics — Compare tab', () => {
    test.beforeEach(async ({ appPage, seedStorage }) => {
        // Three classes with clearly different performance levels:
        //   Class A: high (avg ~100%)    Class B: medium (avg ~62.5%)    Class C: low (avg ~25%)
        // Two rubrics are seeded so the trend chart (which requires >= 2 data points) renders.
        // The rubric has 4 levels: 0=Excellent(4pts), 1=Good(3pts), 2=Adequate(2pts), 3=Poor(1pt)
        const rubric1 = buildRubric({
            id: 'cmp-rubric-1',
            name: 'Compare Rubric 1',
            createdAt: '2026-01-01T00:00:00Z',
        });
        const rubric2 = buildRubric({
            id: 'cmp-rubric-2',
            name: 'Compare Rubric 2',
            createdAt: '2026-02-01T00:00:00Z',
        });

        const clsA = buildClass({ id: 'cls-a', name: 'Class A' });
        const clsB = buildClass({ id: 'cls-b', name: 'Class B' });
        const clsC = buildClass({ id: 'cls-c', name: 'Class C' });

        const studentsA = ['Anna', 'Bas', 'Celia', 'David'].map((n) => buildStudent(clsA.id, { name: n }));
        const studentsB = ['Eva', 'Frank', 'Gina', 'Hank'].map((n) => buildStudent(clsB.id, { name: n }));
        const studentsC = ['Iris', 'Jan', 'Kim', 'Lars'].map((n) => buildStudent(clsC.id, { name: n }));
        const allStudents = [...studentsA, ...studentsB, ...studentsC];

        const srs: StudentRubric[] = [
            // Rubric 1 grades — Class A: 100%, Class B: ~62.5%, Class C: 25%
            ...studentsA.map((s) => srAtLevel(rubric1, s, 0)),
            ...studentsB.slice(0, 2).map((s) => srAtLevel(rubric1, s, 1)),
            ...studentsB.slice(2).map((s) => srAtLevel(rubric1, s, 2)),
            ...studentsC.map((s) => srAtLevel(rubric1, s, 3)),
            // Rubric 2 grades — same distribution (needed for trend chart >= 2 points)
            ...studentsA.map((s) => srAtLevel(rubric2, s, 0)),
            ...studentsB.slice(0, 2).map((s) => srAtLevel(rubric2, s, 1)),
            ...studentsB.slice(2).map((s) => srAtLevel(rubric2, s, 2)),
            ...studentsC.map((s) => srAtLevel(rubric2, s, 3)),
        ];

        await seedStorage({
            rm_classes: [clsA, clsB, clsC],
            rm_rubrics: [rubric1, rubric2],
            rm_students: allStudents,
            rm_student_rubrics: srs,
        });

        // Hash-only navigation does not reload the JS context, so addInitScript data
        // won't be written to localStorage until a hard reload. Navigate then reload.
        await appPage.goto('/#/statistics');
        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 20_000 });
    });

    test('Compare tab is visible and navigable', async ({ appPage }) => {
        await expect(appPage.getByRole('button', { name: /compare/i })).toBeVisible({ timeout: 10_000 });
        await appPage.getByRole('button', { name: /compare/i }).click();
        await expect(appPage.getByText(/compare rubric 1/i)).toBeVisible({ timeout: 5_000 });
    });

    test('selecting 2 classes shows avg bar chart with class names', async ({ appPage }) => {
        await appPage.getByRole('button', { name: /compare/i }).click();

        await appPage.getByLabel('Class A').check();
        await appPage.getByLabel('Class B').check();

        await expect(appPage.locator('.recharts-bar')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Class A')).toBeVisible();
        await expect(appPage.getByText('Class B')).toBeVisible();
    });

    test('class averages reflect grade data — 3 bars visible for 3 classes', async ({ appPage }) => {
        await appPage.getByRole('button', { name: /compare/i }).click();

        await appPage.getByLabel('Class A').check();
        await appPage.getByLabel('Class B').check();
        await appPage.getByLabel('Class C').check();

        await expect(appPage.getByText('Class A')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Class B')).toBeVisible();
        await expect(appPage.getByText('Class C')).toBeVisible();

        // 3 selected classes → 3 bar cells in the avg chart
        const avgChart = appPage.locator('.recharts-wrapper').first();
        const bars = avgChart.locator('.recharts-bar-rectangle');
        await expect(bars).toHaveCount(3, { timeout: 5_000 });
    });

    test('insights panel appears when classes have divergent performance', async ({ appPage }) => {
        await appPage.getByRole('button', { name: /compare/i }).click();

        await appPage.getByLabel('Class A').check();
        await appPage.getByLabel('Class C').check();

        // Class C avg ~25% triggers "struggling" insight; gap A vs C = 75pp → divergence
        const insightsBtn = appPage.locator('button', { hasText: /insights/i });
        await expect(insightsBtn).toBeVisible({ timeout: 5_000 });

        await insightsBtn.click();
        // i18next renders the struggling message with className interpolated
        await expect(appPage.locator('text=/Class C may need targeted support|ahead of Class C/i')).toBeVisible({
            timeout: 3_000,
        });
    });

    test('trend chart renders when 2 classes and 2 rubrics are present', async ({ appPage }) => {
        await appPage.getByRole('button', { name: /compare/i }).click();

        await appPage.getByLabel('Class A').check();
        await appPage.getByLabel('Class B').check();

        // MultiClassTrendChart requires >= 2 trend points (one per rubric)
        await expect(appPage.locator('.recharts-line')).toBeVisible({ timeout: 5_000 });
    });
});
