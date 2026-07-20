/**
 * Item 36 — School-scoped rubric/test/deck marketplace (roadmap Phase 6,
 * extended to tests/decks in Phase 24.4).
 *
 * This is the file playwright.config.ts's `supabase` project has referenced
 * since it was written, but it never actually existed — closing out the
 * "written but never verified" Known Issues row for it.
 *
 * Uses `colleaguePage` (a SECOND, distinct teacher account joined to the same
 * school as `supabasePage`'s user, e2e/fixtures/supabase.fixture.ts) since the
 * marketplace is school-scoped, not per-teacher.
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import { test, expect } from '../fixtures/supabase.fixture';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';
import { RubricListPage } from '../pages/RubricListPage';

test.describe('Marketplace', () => {
    test('publishing a rubric makes it visible to, and clonable by, a colleague at the same school', async ({
        supabasePage,
        colleaguePage,
    }) => {
        const builder = new RubricBuilderPage(supabasePage);
        await builder.gotoNew();
        await builder.fillName('Marketplace Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Accuracy');
        await builder.save();
        await builder.waitForSaved();
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        await supabasePage.goto('/#/marketplace');
        await supabasePage.waitForSelector('.page-content', { timeout: 15_000 });

        await supabasePage.getByRole('button', { name: 'Publish' }).click();
        const publishCard = supabasePage.locator('.card').filter({ hasText: 'Publish to marketplace' });
        await expect(publishCard).toBeVisible({ timeout: 10_000 });
        await publishCard.locator('select').selectOption({ label: 'Marketplace Rubric' });
        await publishCard.getByRole('button', { name: 'Publish' }).click();
        await expect(publishCard).not.toBeVisible({ timeout: 10_000 });

        const ownListing = supabasePage.locator('.card').filter({ hasText: 'Marketplace Rubric' });
        await expect(ownListing).toBeVisible({ timeout: 10_000 });
        await expect(ownListing.getByText('Rubric', { exact: true })).toBeVisible();

        // A colleague at the same school sees the published listing.
        await colleaguePage.goto('/#/marketplace');
        await colleaguePage.waitForSelector('.page-content', { timeout: 15_000 });
        const colleagueListing = colleaguePage.locator('.card').filter({ hasText: 'Marketplace Rubric' });
        await expect(colleagueListing).toBeVisible({ timeout: 15_000 });

        await colleagueListing.getByTitle('Clone into my library').click();
        await expect(colleagueListing.getByText('Cloned')).toBeVisible({ timeout: 10_000 });

        const colleagueRubrics = new RubricListPage(colleaguePage);
        await colleagueRubrics.goto();
        await expect(colleaguePage.getByText('Marketplace Rubric')).toBeVisible({ timeout: 10_000 });
    });

    test('upvoting a listing increments its count and removing the upvote decrements it', async ({ supabasePage }) => {
        const builder = new RubricBuilderPage(supabasePage);
        await builder.gotoNew();
        await builder.fillName('Upvote Rubric');
        await builder.fillSubject('Math');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Reasoning');
        await builder.save();
        await builder.waitForSaved();
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        await supabasePage.goto('/#/marketplace');
        await supabasePage.waitForSelector('.page-content', { timeout: 15_000 });

        await supabasePage.getByRole('button', { name: 'Publish' }).click();
        const publishCard = supabasePage.locator('.card').filter({ hasText: 'Publish to marketplace' });
        await publishCard.locator('select').selectOption({ label: 'Upvote Rubric' });
        await publishCard.getByRole('button', { name: 'Publish' }).click();
        await expect(publishCard).not.toBeVisible({ timeout: 10_000 });

        const listing = supabasePage.locator('.card').filter({ hasText: 'Upvote Rubric' });
        const upvoteButton = listing.getByTitle('Upvote');
        await expect(upvoteButton).toContainText('0');

        await upvoteButton.click();
        await expect(upvoteButton).toContainText('1');

        await upvoteButton.click();
        await expect(upvoteButton).toContainText('0');
    });
});
