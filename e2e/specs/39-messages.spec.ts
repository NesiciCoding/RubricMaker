/**
 * Item 39 — Teacher inbox for student questions (roadmap Phase 14.3,
 * "Messaging Between Student and Teacher").
 *
 * The `/messages` route had zero e2e coverage before this file — found while
 * auditing routes for coverage gaps after closing out items 36-38.
 * Offline-capable (no Supabase needed) — thread grouping/reply state all
 * lives in AppContext + localStorage like the rest of the app's core data.
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { MessagesPage } from '../pages/MessagesPage';
import type { Message } from '../../src/types';

test.describe('Messages', () => {
    test('shows an empty inbox with no messages', async ({ appPage }) => {
        const page = new MessagesPage(appPage);
        await page.goto();
        await expect(page.emptyState()).toBeVisible();
        await expect(appPage.getByText('No messages yet')).toBeVisible();
    });

    test('expanding a thread with an unread student message marks it read and shows a reply box', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ name: 'Class 4A' });
        const student = buildStudent(cls.id, { name: 'Ivy Inbox' });
        const message: Message = {
            id: 'm1',
            studentId: student.id,
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'student',
            body: 'Can you explain the rubric for essay 2?',
            createdAt: new Date().toISOString(),
            readByTeacher: false,
            readByStudent: true,
        };
        await seedStorage({ rm_classes: [cls], rm_students: [student], rm_messages: [message] });

        const page = new MessagesPage(appPage);
        await page.goto();

        await expect(page.threadCard('Ivy Inbox')).toBeVisible();
        await expect(page.unreadDot('Ivy Inbox')).toBeVisible();
        await expect(appPage.getByText('Can you explain the rubric for essay 2?')).toBeVisible();

        await page.openThread('Ivy Inbox');
        await expect(page.unreadDot('Ivy Inbox')).not.toBeVisible();

        await page.reply('Ivy Inbox', 'Sure — the rubric focuses on structure and vocabulary.');
        // The same text also appears in the thread list's truncated preview snippet —
        // .last() targets the actual message bubble in the expanded conversation.
        await expect(appPage.getByText('Sure — the rubric focuses on structure and vocabulary.').last()).toBeVisible({
            timeout: 5_000,
        });
    });

    test('starting a new thread sends a message to the selected student', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Class 4A' });
        const student = buildStudent(cls.id, { name: 'Noah New' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new MessagesPage(appPage);
        await page.goto();

        await page.openNewThread();
        await page.selectNewThreadStudent('Noah New');
        await page.fillNewThreadBody('Please remember to submit your essay by Friday.');
        await page.sendNewThread();

        await expect(page.threadCard('Noah New')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Please remember to submit your essay by Friday.')).toBeVisible();
    });
});
