import { test, expect } from '../fixtures/app.fixture';
import { buildRubric } from '../fixtures/data.factory';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';

test.describe('Rubric version history', () => {
    test('save a version snapshot', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ id: 'versioned-rubric', name: 'Version Test' });
        await seedStorage({ rm_rubrics: [rubric] });

        const builder = new RubricBuilderPage(appPage);
        await builder.gotoEdit('versioned-rubric');
        await builder.save();
        await builder.waitForSaved();

        // Open version history and save a snapshot
        await builder.openVersionHistory();
        await builder.saveVersion('Before rewrite');

        // Verify a version entry appeared
        await expect(appPage.getByText('Before rewrite')).toBeVisible({ timeout: 5_000 });
    });

    test('restore a saved version reverts the rubric name', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ id: 'restore-rubric', name: 'Name Before Change' });
        await seedStorage({ rm_rubrics: [rubric] });

        const builder = new RubricBuilderPage(appPage);
        await builder.gotoEdit('restore-rubric');
        await builder.save();
        await builder.waitForSaved();

        // Save a version snapshot
        await builder.openVersionHistory();
        await builder.saveVersion('snapshot-v1');
        await expect(appPage.getByText('snapshot-v1')).toBeVisible({ timeout: 5_000 });

        // Change the name
        await builder.fillName('Name After Change');
        await builder.save();
        await builder.waitForSaved();

        // Reopen version history — saving closes the panel
        await builder.openVersionHistory();

        // Restore the snapshot — dialog.accept() is wired in restoreVersion
        await builder.restoreVersion(0);

        // Rubric name should revert
        await expect(appPage.getByPlaceholder('Rubric Name...')).toHaveValue('Name Before Change', {
            timeout: 5_000,
        });
    });
});
