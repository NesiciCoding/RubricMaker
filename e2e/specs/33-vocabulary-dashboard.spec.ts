import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { VocabularyDashboardPage } from '../pages/VocabularyDashboardPage';

test.describe('Vocabulary dashboard', () => {
    test('class filter reveals the per-student drilldown table', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'vocab-class', name: 'Vocab Class' });
        const student1 = buildStudent(cls.id, { id: 'vocab-s1', name: 'Vocab Student 1' });
        const student2 = buildStudent(cls.id, { id: 'vocab-s2', name: 'Vocab Student 2' });

        await seedStorage({
            rm_classes: [cls],
            rm_students: [student1, student2],
        });

        const page = new VocabularyDashboardPage(appPage);
        await page.goto();

        await expect(page.studentDrilldownRows()).toHaveCount(0);

        await page.filterByClass('Vocab Class');
        await expect(page.studentDrilldownRows()).toHaveCount(2);
        await expect(page.studentDrilldownRows().first()).toContainText('Vocab Student 1');
    });

    test('exporting the vocabulary CSV downloads rubric-linked words for the selected band', async ({
        appPage,
        seedStorage,
    }) => {
        const rubric = buildRubric({
            id: 'vocab-rubric',
            name: 'Vocab Rubric',
            vocabularyItems: [
                { id: 'vi-1', phrase: 'ubiquitous', category: 'vocabulary', cefrLevel: 'C1', definition: 'present everywhere' },
                { id: 'vi-2', phrase: 'happy', category: 'vocabulary', cefrLevel: 'A1', definition: 'feeling joy' },
            ],
        });

        await seedStorage({ rm_rubrics: [rubric] });

        const page = new VocabularyDashboardPage(appPage);
        await page.goto();

        await page.setExportBand('C1');
        const download = await page.exportCsv();
        expect(download.suggestedFilename()).toContain('C1');

        const path = await download.path();
        const fs = await import('fs/promises');
        const contents = path ? await fs.readFile(path, 'utf-8') : '';
        expect(contents).toContain('ubiquitous');
        expect(contents).not.toContain('happy');
    });
});
