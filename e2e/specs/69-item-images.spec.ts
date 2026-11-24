/** Pictures on matching, ordering and categorize items: the image button reveals a URL field and a preview. */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

// A 1x1 transparent PNG, so the preview needs no network.
const PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

for (const [type, label] of [
    ['matching', 'matching'],
    ['ordering', 'ordering'],
    ['categorize', 'categorize'],
] as const) {
    test.describe(`${label} — item pictures`, () => {
        test(`an item can take a picture and shows its preview`, async ({ appPage }) => {
            const builder = new TestBuilderPage(appPage);
            await builder.gotoNew();
            await builder.addQuestion(type);

            const card = builder.questionCard(0);
            const field = card.getByRole('textbox', { name: 'Image for this item (URL)' });
            await expect(field).toHaveCount(0);
            await card.getByRole('button', { name: 'Image for this item (URL)' }).first().click();
            await field.first().fill(PIXEL);
            await expect(field.first()).toHaveValue(PIXEL);
            await expect(card.locator(`img[src="${PIXEL}"]`).first()).toBeVisible();
        });
    });
}
