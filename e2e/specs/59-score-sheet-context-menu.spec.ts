import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { TestListPage } from '../pages/TestListPage';
import { TestScoreSheetPage } from '../pages/TestScoreSheetPage';

// Enough rows that the grid is taller than the viewport, so the last one can be placed on the bottom edge.
const STUDENTS = ['Anna', 'Bram', 'Chris', 'Dana', 'Eli', 'Fay', 'Gijs', 'Hanna', 'Iris', 'Jesse', 'Koen', 'Lena'];

test.describe('Score sheet context menu', () => {
    test('opens near the bottom-right edge without hanging off the screen', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: '3A', year: 'jaar-3', voTrack: 'havo' });
        const students = STUDENTS.map((name) => buildStudent(cls.id, { name }));
        await seedStorage({ rm_classes: [cls], rm_students: students });

        // The grid is capped at 70vh, so its last row sits low enough that a menu cannot open below it.
        await appPage.setViewportSize({ width: 1000, height: 800 });

        const list = new TestListPage(appPage);
        await list.goto();
        await appPage.getByRole('button', { name: 'New score-only test' }).click();
        await expect(appPage).toHaveURL(/\/tests\/[^/]+\/scores/);

        const sheet = new TestScoreSheetPage(appPage);
        const point = await sheet.bottomRightCellPoint();

        await appPage.mouse.click(point.x, point.y, { button: 'right' });
        const menu = appPage.getByRole('menu');
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAccessibleName('Cell actions');

        const box = (await menu.boundingBox())!;
        const viewport = appPage.viewportSize()!;

        // Without this the containment checks below would pass for a menu that never needed clamping.
        expect(
            point.y + box.height,
            'the click was not close enough to the bottom edge to require clamping — adjust the fixture'
        ).toBeGreaterThan(viewport.height);

        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        // Clamped upwards, not simply drawn below the click where it would be cut off.
        expect(box.y).toBeLessThan(point.y);

        await appPage.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    });
});
