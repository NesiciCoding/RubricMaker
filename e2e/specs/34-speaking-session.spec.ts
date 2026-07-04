import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { SpeakingSessionPage } from '../pages/SpeakingSessionPage';

// Runs only on the `chromium-fake-media` project (see playwright.config.ts),
// which launches Chromium with a synthetic camera/mic so MediaRecorder has a
// real stream to capture instead of hanging on a permission prompt.
test.describe('Speaking session', () => {
    test('records audio, scores the session, saves, and everything persists across reload', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'sp-class', name: 'Speaking Class' });
        const rubric = buildRubric({ id: 'sp-rubric', name: 'Speaking Rubric' });
        const student = buildStudent(cls.id, { id: 'sp-student', name: 'Speaking Student' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new SpeakingSessionPage(appPage);
        await page.goto(rubric.id, student.id);

        await page.recordAudio();
        await appPage.waitForTimeout(500);
        await page.stopRecording();
        await expect(page.recordingsList()).toHaveCount(1, { timeout: 10_000 });

        await page.addPronunciationMark('Word Stress');
        await expect(appPage.getByText(/marks \(1\)/i)).toBeVisible();

        await page.selectLevel(0, 'Good');
        await page.fillOverallComment('Clear pronunciation, minor stress errors.');
        await page.save();
        await page.waitForSaved();

        await appPage.reload();
        await expect(page.recordingsList()).toHaveCount(1);
        await expect(appPage.locator('textarea')).toHaveValue('Clear pronunciation, minor stress errors.');
        await expect(appPage.getByText(/marks \(1\)/i)).toBeVisible();
    });

    test('timer counts down and auto-locks scoring controls when time runs out', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'sp-class-2', name: 'Speaking Class 2' });
        const rubric = buildRubric({ id: 'sp-rubric-2', name: 'Speaking Rubric 2' });
        const student = buildStudent(cls.id, { id: 'sp-student-2', name: 'Speaking Student 2' });

        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });

        const page = new SpeakingSessionPage(appPage);
        await page.goto(rubric.id, student.id);

        await page.setDurationMinutes(1);
        await page.startTimer();
        await expect(appPage.getByText(/00:59|00:58/)).toBeVisible({ timeout: 3_000 });

        await page.stopTimer();
        await expect(appPage.getByText(/rubric locked/i)).toBeVisible();
    });
});
