/**
 * Item 26 — Manual list reordering (Phase 8.4 of the roadmap).
 *
 * Drag-to-reorder via @hello-pangea/dnd, applied identically to the Rubrics,
 * Tests, and Essays lists (and the Activity Dashboard, covered in spec 25's
 * fixtures indirectly via shared displayOrder logic — see
 * src/utils/displayOrder.ts). Order is stored on the entity itself
 * (`displayOrder`) and persists across reloads.
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildRubric } from '../fixtures/data.factory';
import { RubricListPage } from '../pages/RubricListPage';
import { TestListPage } from '../pages/TestListPage';
import { EssayListPage } from '../pages/EssayListPage';
import type { Test as RmTest, EssayAssignment } from '../../src/types';

test.describe('Manual list reordering', () => {
    test('dragging a rubric card to the end reorders the list and persists after reload', async ({
        appPage,
        seedStorage,
    }) => {
        const rubrics = [
            buildRubric({ id: 'reorder-r1', name: 'Reorder Rubric A', createdAt: '2024-01-01T00:00:00.000Z' }),
            buildRubric({ id: 'reorder-r2', name: 'Reorder Rubric B', createdAt: '2024-01-02T00:00:00.000Z' }),
            buildRubric({ id: 'reorder-r3', name: 'Reorder Rubric C', createdAt: '2024-01-03T00:00:00.000Z' }),
        ];
        await seedStorage({ rm_rubrics: rubrics });

        const page = new RubricListPage(appPage);
        await page.goto();

        await expect(await page.cardTitles()).toEqual(['Reorder Rubric A', 'Reorder Rubric B', 'Reorder Rubric C']);

        await page.dragReorder(page.dragHandle('Reorder Rubric A'), page.dragHandle('Reorder Rubric C'));

        await expect(async () => {
            expect(await page.cardTitles()).toEqual(['Reorder Rubric B', 'Reorder Rubric C', 'Reorder Rubric A']);
        }).toPass({ timeout: 5_000 });

        await page.goto();
        await expect(await page.cardTitles()).toEqual(['Reorder Rubric B', 'Reorder Rubric C', 'Reorder Rubric A']);
    });

    test('dragging a test card reorders the Tests list', async ({ appPage, seedStorage }) => {
        const tests: RmTest[] = [
            {
                id: 'reorder-t1',
                name: 'Reorder Test A',
                questions: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00.000Z',
            },
            {
                id: 'reorder-t2',
                name: 'Reorder Test B',
                questions: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-02T00:00:00.000Z',
            },
        ];
        await seedStorage({ rm_tests: tests });

        const page = new TestListPage(appPage);
        await page.goto();

        await expect(await page.cardTitles()).toEqual(['Reorder Test A', 'Reorder Test B']);

        await page.dragReorder(page.dragHandle('Reorder Test A'), page.dragHandle('Reorder Test B'));

        await expect(async () => {
            expect(await page.cardTitles()).toEqual(['Reorder Test B', 'Reorder Test A']);
        }).toPass({ timeout: 5_000 });
    });

    test('dragging an essay card reorders the Essays list', async ({ appPage, seedStorage }) => {
        const essayAssignments: EssayAssignment[] = [
            {
                rubricId: 'rubric-x',
                studentId: 'student-x1',
                teacherKey: 'reorder-essay-1',
                title: 'Reorder Essay A',
                readOnlyAfterSubmit: false,
                createdAt: '2024-01-01T00:00:00.000Z',
            },
            {
                rubricId: 'rubric-x',
                studentId: 'student-x2',
                teacherKey: 'reorder-essay-2',
                title: 'Reorder Essay B',
                readOnlyAfterSubmit: false,
                createdAt: '2024-01-02T00:00:00.000Z',
            },
        ];
        await seedStorage({ rm_essay_assignments: essayAssignments });

        const page = new EssayListPage(appPage);
        await page.goto();

        await expect(await page.cardTitles()).toEqual(['Reorder Essay A', 'Reorder Essay B']);

        await page.dragReorder(page.dragHandle('Reorder Essay A'), page.dragHandle('Reorder Essay B'));

        await expect(async () => {
            expect(await page.cardTitles()).toEqual(['Reorder Essay B', 'Reorder Essay A']);
        }).toPass({ timeout: 5_000 });
    });
});
