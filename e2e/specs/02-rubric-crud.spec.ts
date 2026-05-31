import { test, expect } from '../fixtures/app.fixture';
import { buildRubric } from '../fixtures/data.factory';
import { RubricListPage } from '../pages/RubricListPage';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';

test.describe('Rubric CRUD', () => {
    test('create a rubric end-to-end', async ({ appPage }) => {
        const builder = new RubricBuilderPage(appPage);
        const list = new RubricListPage(appPage);

        await builder.gotoNew();
        await builder.fillName('My Essay Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Content & Ideas');
        await builder.save();
        await builder.waitForSaved();

        await list.goto();
        await expect(appPage.getByText('My Essay Rubric')).toBeVisible();
    });

    test('shows validation error when name is empty', async ({ appPage }) => {
        const builder = new RubricBuilderPage(appPage);
        await builder.gotoNew();
        await builder.save();
        await expect(builder.getNameError()).toBeVisible();
    });

    test('edit an existing rubric name', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ name: 'Original Name' });
        await seedStorage({ rm_rubrics: [rubric] });

        const builder = new RubricBuilderPage(appPage);
        await builder.gotoEdit(rubric.id);
        await builder.fillName('Updated Name');
        await builder.save();
        await builder.waitForSaved();

        const list = new RubricListPage(appPage);
        await list.goto();
        await expect(appPage.getByText('Updated Name')).toBeVisible();
    });

    test('delete a rubric via confirm dialog', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ name: 'Rubric To Delete' });
        await seedStorage({ rm_rubrics: [rubric] });

        const list = new RubricListPage(appPage);
        await list.goto();
        await expect(appPage.getByText('Rubric To Delete')).toBeVisible();

        await list.clickDeleteRubric('Rubric To Delete');
        await expect(appPage.getByRole('dialog')).toBeVisible();
        await list.confirmDelete();

        await expect(appPage.getByText('Rubric To Delete')).not.toBeVisible({ timeout: 5_000 });
    });

    test('cancel delete keeps the rubric', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ name: 'Keep Me' });
        await seedStorage({ rm_rubrics: [rubric] });

        const list = new RubricListPage(appPage);
        await list.goto();
        await list.clickDeleteRubric('Keep Me');
        await expect(appPage.getByRole('dialog')).toBeVisible();
        await list.cancelDelete();

        await expect(appPage.getByRole('dialog')).not.toBeVisible();
        await expect(appPage.getByText('Keep Me')).toBeVisible();
    });
});
