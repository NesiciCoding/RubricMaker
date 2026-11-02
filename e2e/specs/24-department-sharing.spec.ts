/**
 * Item 24 — School-wide rubric sharing (Phase 8.2 of the roadmap; reworked by
 * migration 095_material_sharing.sql).
 *
 * Unlike the school-scoped Marketplace (publish a frozen snapshot for
 * colleagues to clone), sharing makes the LIVE rubric visible to every other
 * teacher in the same school via the `sharing` setting stored in the rubric's
 * `data` jsonb column, listed for colleagues under "Shared with me".
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 *
 * Uses `colleaguePage` (a SECOND, distinct teacher account joined to the same
 * school as `supabasePage`'s user) from e2e/fixtures/supabase.fixture.ts —
 * not `secondSupabasePage`, which is the same account on a second device.
 */
import { test, expect } from '../fixtures/supabase.fixture';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';
import { RubricListPage } from '../pages/RubricListPage';

test.describe('School rubric sharing', () => {
    test('a rubric shared with the school becomes visible to a colleague at the same school', async ({
        supabasePage,
        colleaguePage,
    }) => {
        const builder = new RubricBuilderPage(supabasePage);
        await builder.gotoNew();
        await builder.fillName('Department Shared Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Accuracy');
        await builder.save();
        await builder.waitForSaved();
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        const ownerList = new RubricListPage(supabasePage);
        await ownerList.goto();

        const shareButton = ownerList
            .getRubricCard('Department Shared Rubric')
            .getByRole('button', { name: /share with colleague/i });
        await shareButton.click();

        await supabasePage.getByLabel(/all teachers in my school/i).check();
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        const colleagueList = new RubricListPage(colleaguePage);
        await colleagueList.goto();

        await expect(colleaguePage.getByRole('heading', { name: 'Shared with me' })).toBeVisible({
            timeout: 15_000,
        });
        await expect(colleaguePage.getByText('Department Shared Rubric')).toBeVisible({ timeout: 15_000 });
    });

    test('an un-shared rubric is not visible to a colleague at the same school', async ({
        supabasePage,
        colleaguePage,
    }) => {
        const builder = new RubricBuilderPage(supabasePage);
        await builder.gotoNew();
        await builder.fillName('Private Rubric');
        await builder.fillSubject('Math');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Reasoning');
        await builder.save();
        await builder.waitForSaved();
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        const colleagueList = new RubricListPage(colleaguePage);
        await colleagueList.goto();

        await expect(colleaguePage.getByText('Private Rubric')).not.toBeVisible({ timeout: 5_000 });
    });
});
