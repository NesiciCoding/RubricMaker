import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { readLocalStorage } from '../fixtures/storage.helpers';
import { TestListPage } from '../pages/TestListPage';
import { TestScoreSheetPage } from '../pages/TestScoreSheetPage';
import type { StudentTest } from '../../src/types';

test.describe('Test score sheet', () => {
    test('types and pastes points for a paper test, grades them and analyses the test', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ name: '2H', year: 'jaar-2', voTrack: 'havo' });
        const students = ['Anna', 'Bram', 'Chris', 'Dana', 'Eli', 'Fay'].map((name) => buildStudent(cls.id, { name }));
        await seedStorage({ rm_classes: [cls], rm_students: students });

        const list = new TestListPage(appPage);
        await list.goto();
        await appPage.getByRole('button', { name: 'New score-only test' }).click();
        await expect(appPage).toHaveURL(/\/tests\/[^/]+\/scores/);

        const sheet = new TestScoreSheetPage(appPage);
        await sheet.cell('Anna', 1).fill('1');
        await sheet.cell('Anna', 1).press('Enter');
        await expect(sheet.cell('Bram', 1)).toBeFocused();

        await sheet.pasteInto(
            sheet.cell('Anna', 2),
            ['1\t1\t1\t1', '1\t0\t1\t0', '0\t0\t0\t1', '1\t1\t0\t1', '0\t0\t0\t0', '1\t1\t1\t1'].join('\n')
        );
        await sheet.cell('Bram', 1).fill('1');
        await sheet.cell('Bram', 1).blur();
        for (const name of ['Chris', 'Dana', 'Eli', 'Fay']) {
            await sheet.cell(name, 1).fill(name === 'Eli' ? '0' : '1');
            await sheet.cell(name, 1).blur();
        }

        await sheet.cell('Anna', 3).fill('3');
        await expect(sheet.cell('Anna', 3)).toHaveAttribute('aria-invalid', 'true');
        await sheet.cell('Anna', 3).press('Escape');

        // N-term with N = 1: 5/5 → 10.0
        await expect(sheet.row('Anna')).toContainText('100.0%');
        await expect(sheet.row('Anna')).toContainText('10.0');

        await sheet.selectNorm('caesura');
        await appPage.getByLabel('Points for a pass').fill('4');
        await expect(sheet.row('Anna')).toContainText('10.0');
        await expect(sheet.row('Eli')).toContainText('1.0');

        await sheet.openAnalysis();
        await expect(appPage.getByRole('heading', { name: 'Test summary' })).toBeVisible();
        await expect(appPage.getByRole('heading', { name: 'Question quality' })).toBeVisible();
        await expect(appPage.getByText("Cronbach's α", { exact: true })).toBeVisible();

        await appPage.reload();
        await appPage.getByRole('button', { name: 'Score sheet' }).first().click();
        await expect(sheet.cell('Anna', 1)).toHaveValue('1');
        const saved = await readLocalStorage<StudentTest[]>(appPage, 'rm_student_tests');
        expect(saved?.filter((st) => st.source === 'manual')).toHaveLength(6);
        expect(saved?.every((st) => st.status === 'graded')).toBe(true);
    });
});
