/**
 * Item 40 — Curated news flashes for students (roadmap Phase 16.4, read
 * receipts added in Phase 21.3).
 *
 * The `/news-flashes` route had zero e2e coverage before this file — found
 * while auditing routes for coverage gaps after closing out items 36-39.
 * Offline-capable (no Supabase needed).
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { NewsFlashesPage } from '../pages/NewsFlashesPage';
import type { NewsFlash, NewsFlashRead } from '../../src/types';

test.describe('News Flashes', () => {
    test('shows an empty state with no flashes', async ({ appPage }) => {
        const page = new NewsFlashesPage(appPage);
        await page.goto();
        await expect(page.emptyState()).toBeVisible();
    });

    test('creating a flash shows it in the list', async ({ appPage }) => {
        const page = new NewsFlashesPage(appPage);
        await page.goto();

        await page.openCreate();
        await page.fillTitle('Reading passage: climate change');
        await page.fillSummary('A short piece on renewable energy for B1 readers.');
        await page.selectKind('article');
        await page.save();

        await expect(appPage.getByText('Reading passage: climate change')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('A short piece on renewable energy for B1 readers.')).toBeVisible();
    });

    test('editing a flash updates its title', async ({ appPage, seedStorage }) => {
        const flash: NewsFlash = {
            id: 'nf1',
            title: 'Original title',
            summary: 'Summary text',
            kind: 'article',
            tags: [],
            createdAt: new Date().toISOString(),
        };
        await seedStorage({ rm_news_flashes: [flash] });

        const page = new NewsFlashesPage(appPage);
        await page.goto();
        await page.editFlash('Original title');
        await page.fillTitle('Edited title');
        await page.save();

        await expect(appPage.getByText('Edited title')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Original title')).not.toBeVisible();
    });

    test('deleting a flash removes it after confirming', async ({ appPage, seedStorage }) => {
        const flash: NewsFlash = {
            id: 'nf1',
            title: 'Delete this flash',
            summary: '',
            kind: 'video',
            tags: [],
            createdAt: new Date().toISOString(),
        };
        await seedStorage({ rm_news_flashes: [flash] });

        const page = new NewsFlashesPage(appPage);
        await page.goto();
        await expect(appPage.getByText('Delete this flash')).toBeVisible();

        await page.deleteFlash('Delete this flash');
        await page.confirmDelete();

        await expect(appPage.getByText('Delete this flash')).not.toBeVisible({ timeout: 5_000 });
        await expect(page.emptyState()).toBeVisible();
    });

    test('expanding read receipts shows which students have read the flash', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Class 4A' });
        const reader = buildStudent(cls.id, { name: 'Rae Reader' });
        const nonReader = buildStudent(cls.id, { name: 'Nia Notyet' });
        const flash: NewsFlash = {
            id: 'nf1',
            title: 'Book club pick',
            summary: '',
            kind: 'book',
            tags: [],
            createdAt: new Date().toISOString(),
        };
        const read: NewsFlashRead = {
            id: `${flash.id}:${reader.id}`,
            flashId: flash.id,
            studentId: reader.id,
            readAt: new Date().toISOString(),
        };
        await seedStorage({
            rm_classes: [cls],
            rm_students: [reader, nonReader],
            rm_news_flashes: [flash],
            rm_news_flash_reads: [read],
        });

        const page = new NewsFlashesPage(appPage);
        await page.goto();

        await expect(appPage.getByText('1 of 2 read')).toBeVisible();
        await page.expandReadReceipts('Book club pick');

        await expect(page.flashCard('Book club pick').getByText('Rae Reader')).toBeVisible();
        await expect(page.flashCard('Book club pick').getByText('Nia Notyet')).not.toBeVisible();
    });
});
