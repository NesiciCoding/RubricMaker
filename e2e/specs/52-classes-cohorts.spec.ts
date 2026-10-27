import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { readLocalStorage } from '../fixtures/storage.helpers';
import { StudentsPage } from '../pages/StudentsPage';
import type { Class, Student } from '../../src/types';

test.describe('Class options menu', () => {
    test('floats above the scrolling cohort bar instead of being clipped by it', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Overflow 4A' });
        await seedStorage({ rm_classes: [cls] });

        const page = new StudentsPage(appPage);
        await page.goto();

        const chipRow = appPage.locator('[data-tour="students-cohorts"]');
        const scrollWidthBefore = await chipRow.evaluate((el) => el.scrollWidth);

        await page.openClassMenu('Overflow 4A');
        const menu = page.getClassMenu();
        await expect(menu.getByRole('menuitem')).toHaveCount(4);
        await expect(menu.getByRole('menuitem', { name: /rename/i })).toBeVisible();

        // The menu is portaled to <body> and fixed, so the chip row's `overflow-x: auto`
        // can neither clip it nor widen its scroll area.
        const geometry = await appPage.evaluate(() => {
            const menuEl = document.querySelector('[role="menu"]');
            const row = document.querySelector('[data-tour="students-cohorts"]');
            if (!menuEl || !row) return null;
            const style = getComputedStyle(menuEl);
            return {
                insideChipRow: row.contains(menuEl),
                parentIsBody: menuEl.parentElement === document.body,
                position: style.position,
                zIndex: Number(style.zIndex),
                scrollWidth: row.scrollWidth,
                clientWidth: row.clientWidth,
            };
        });
        expect(geometry).not.toBeNull();
        expect(geometry!.insideChipRow).toBe(false);
        expect(geometry!.parentIsBody).toBe(true);
        expect(geometry!.position).toBe('fixed');
        expect(geometry!.zIndex).toBeGreaterThan(10);
        expect(geometry!.scrollWidth).toBe(geometry!.clientWidth);
        expect(geometry!.scrollWidth).toBe(scrollWidthBefore);

        // It still hangs off the trigger button rather than floating over unrelated content.
        const triggerBox = await page.getClassOptionsButton('Overflow 4A').boundingBox();
        const menuBox = await menu.boundingBox();
        expect(triggerBox).not.toBeNull();
        expect(menuBox).not.toBeNull();
        expect(menuBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height - 1);
    });

    test('closes when clicking elsewhere on the page', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Dismiss 4B' });
        await seedStorage({ rm_classes: [cls] });

        const page = new StudentsPage(appPage);
        await page.goto();
        await page.openClassMenu('Dismiss 4B');
        await expect(page.getClassMenu()).toBeVisible();

        await appPage.mouse.click(5, 500);
        await expect(page.getClassMenu()).toHaveCount(0);
    });
});

test.describe('Mixed-year classes', () => {
    test('shows every year on the class chip and keeps a per-student year', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Mixed 7/8', year: 'groep-7', years: ['groep-7', 'groep-8'] });
        const student = buildStudent(cls.id, { name: 'Sara Junior', schoolYear: 'groep-8' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentsPage(appPage);
        await page.goto();

        // Both years are surfaced on the class chip, not just the primary one.
        const chip = page.getClassChip('Mixed 7/8');
        await expect(chip).toContainText('Groep 7');
        await expect(chip).toContainText('Groep 8');
        await expect(page.getStudentRowByName('Sara Junior')).toContainText('Groep 8');

        await page.openEditStudentModal('Sara Junior');
        const yearSelect = page.studentYearSelect();
        // Only this class's own years are offered, seeded with the student's tag.
        expect(
            await yearSelect.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
        ).toEqual(['', 'groep-7', 'groep-8']);
        await expect(yearSelect).toHaveValue('groep-8');

        await yearSelect.selectOption('groep-7');
        await page.submitStudentForm();
        await expect(page.getStudentRowByName('Sara Junior')).toContainText('Groep 7');

        const stored = await readLocalStorage<Student[]>(appPage, 'rm_students');
        expect(stored?.[0]?.schoolYear).toBe('groep-7');

        // The tag survives a remount from storage.
        await page.reloadApp();
        await expect(page.getStudentRowByName('Sara Junior')).toContainText('Groep 7');
    });

    test('connects several years to one class and hides tracks for primary-only years', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ name: 'Junior 7/8' });
        await seedStorage({ rm_classes: [cls] });

        const page = new StudentsPage(appPage);
        await page.goto();
        await page.openClassSettings('Junior 7/8');

        await page.toggleClassYear('Groep 7');
        await page.toggleClassYear('Groep 8');
        // Groep-7/8 is primary school, so there is no VO track to choose.
        await expect(page.getClassTrackChips()).toHaveCount(0);

        await page.saveClassSettings();
        const chip = page.getClassChip('Junior 7/8');
        await expect(chip).toContainText('Groep 7');
        await expect(chip).toContainText('Groep 8');

        const stored = await readLocalStorage<Class[]>(appPage, 'rm_classes');
        expect(stored?.[0]?.years).toEqual(['groep-7', 'groep-8']);
        // The singular field stays the class's primary cohort for class-level surfaces.
        expect(stored?.[0]?.year).toBe('groep-7');
    });
});

test.describe('Heterogeneous tracks', () => {
    test("offers only the class's own tracks and pins a student to one", async ({ appPage, seedStorage }) => {
        const cls = buildClass({
            name: '3TL/3H',
            year: 'jaar-3',
            years: ['jaar-3'],
            voTrack: 'vmbo-tl',
            voTracks: ['vmbo-tl', 'havo'],
        });
        const student = buildStudent(cls.id, { name: 'Nina Mixed' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentsPage(appPage);
        await page.goto();

        const chip = page.getClassChip('3TL/3H');
        await expect(chip).toContainText('VMBO-TL');
        await expect(chip).toContainText('HAVO');

        await page.openEditStudentModal('Nina Mixed');
        const trackSelect = page.studentTrackSelect();
        expect(
            await trackSelect.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
        ).toEqual(['', 'vmbo-tl', 'havo']);
        // The year select offers the class's years alongside the track choice.
        expect(
            await page
                .studentYearSelect()
                .locator('option')
                .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
        ).toEqual(['', 'jaar-3']);

        await trackSelect.selectOption('havo');
        await page.submitStudentForm();
        await expect(page.getStudentRowByName('Nina Mixed')).toContainText('HAVO');

        const stored = await readLocalStorage<Student[]>(appPage, 'rm_students');
        expect(stored?.[0]?.voTrack).toBe('havo');

        await page.reloadApp();
        await expect(page.getStudentRowByName('Nina Mixed')).toContainText('HAVO');
    });

    test('connects several tracks to one class from class settings', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Mixed Levels', year: 'jaar-3', years: ['jaar-3'] });
        await seedStorage({ rm_classes: [cls] });

        const page = new StudentsPage(appPage);
        await page.goto();
        await page.openClassSettings('Mixed Levels');

        // The seeded year already makes the track group available.
        await expect(page.getClassTrackChips()).toBeVisible();
        await page.toggleClassTrack('VMBO-TL');
        await page.toggleClassTrack('HAVO');
        await page.saveClassSettings();

        const chip = page.getClassChip('Mixed Levels');
        await expect(chip).toContainText('VMBO-TL');
        await expect(chip).toContainText('HAVO');

        const stored = await readLocalStorage<Class[]>(appPage, 'rm_classes');
        expect(stored?.[0]?.voTracks).toEqual(['vmbo-tl', 'havo']);
        expect(stored?.[0]?.voTrack).toBe('vmbo-tl');
    });
});
