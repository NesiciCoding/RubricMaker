/**
 * Supabase integration test — DB-backed essay import flow.
 *
 * Covers the path that 19-essay-import.spec.ts (offline/no-DB) cannot:
 * a student hands in an essay through the Supabase-backed essay portal
 * (simulated here via direct inserts that mirror what the `submit-essay`
 * edge function persists), and the teacher's "Import Essay" modal fetches
 * it from the database via `fetchEssaySubmissionsForStudent`, scoped to the
 * correct rubric + student, then imports it as an attachment.
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';

const adminHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

async function resolveUserId(userEmail: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: adminHeaders,
    });
    if (!res.ok) throw new Error(`Failed to list users: ${res.status} ${await res.text()}`);
    const { users } = (await res.json()) as { users: { id: string; email: string }[] };
    const user = users?.find((u) => u.email === userEmail);
    if (!user) throw new Error(`Test user ${userEmail} not found in Supabase`);
    return user.id;
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`Insert into ${table} failed: ${res.status} ${await res.text()}`);
}

/** Upload essay HTML to the `essays` storage bucket, as submit-essay would. */
async function uploadEssayHtml(storagePath: string, html: string): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/essays/${storagePath}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'text/html',
        },
        body: html,
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
}

test.describe('Essay import → grading views (Supabase-backed)', () => {
    test('a handed-in essay appears for the correct rubric/student and imports as an attachment', async ({
        supabasePage,
        testUserEmail,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);

        const cls = buildClass({ id: 'db-essay-class', name: 'DB Essay Class' });
        const rubric = buildRubric({ id: 'db-essay-rubric', name: 'DB Essay Rubric' });
        const student = buildStudent(cls.id, { id: 'db-essay-student', name: 'DB Essay Student' });
        const otherStudent = buildStudent(cls.id, { id: 'db-essay-other-student', name: 'Other DB Student' });

        // Seed the rubric/class/students this teacher owns, so the grading
        // page has something to render once Supabase is hydrated.
        await Promise.all([
            insertRow('classes', { id: cls.id, owner_id: ownerId, data: cls }),
            insertRow('rubrics', {
                id: rubric.id,
                owner_id: ownerId,
                created_at: rubric.createdAt,
                updated_at: rubric.updatedAt,
                data: rubric,
            }),
            insertRow('students', { id: student.id, owner_id: ownerId, class_id: student.classId, data: student }),
            insertRow('students', {
                id: otherStudent.id,
                owner_id: ownerId,
                class_id: otherStudent.classId,
                data: otherStudent,
            }),
        ]);

        // An essay assignment for this rubric + student, with a submission
        // already handed in — mirrors what `submit-essay` persists.
        const assignmentId = 'db-essay-assignment';
        await insertRow('essay_assignments', {
            id: assignmentId,
            owner_id: ownerId,
            rubric_id: rubric.id,
            student_id: student.id,
            title: 'DB Essay Assignment',
        });

        // A second assignment for the OTHER student — its submission must
        // NOT show up when grading `student`.
        const otherAssignmentId = 'db-essay-other-assignment';
        await insertRow('essay_assignments', {
            id: otherAssignmentId,
            owner_id: ownerId,
            rubric_id: rubric.id,
            student_id: otherStudent.id,
            title: 'DB Essay Assignment (other student)',
        });

        const submissionId = 'db-essay-submission';
        const storagePath = `${assignmentId}/${submissionId}.html`;
        const contentHtml = '<p>This essay was handed in through the Supabase-backed flow.</p>';
        await uploadEssayHtml(storagePath, contentHtml);
        await insertRow('essay_submissions', {
            id: submissionId,
            assignment_id: assignmentId,
            student_email: 'db-essay-student@school.nl',
            word_count: 9,
            word_limit_status: 'ok',
            storage_path: storagePath,
        });

        const otherSubmissionId = 'db-essay-other-submission';
        const otherStoragePath = `${otherAssignmentId}/${otherSubmissionId}.html`;
        await uploadEssayHtml(otherStoragePath, '<p>A different student\'s essay.</p>');
        await insertRow('essay_submissions', {
            id: otherSubmissionId,
            assignment_id: otherAssignmentId,
            student_email: 'other-db-essay-student@school.nl',
            word_count: 4,
            word_limit_status: 'ok',
            storage_path: otherStoragePath,
        });

        // Navigate to the grading page for `student` — this reloads the app,
        // which re-hydrates rubrics/classes/students from Supabase.
        const page = new GradeStudentPage(supabasePage);
        await page.goto(rubric.id, student.id);

        await supabasePage.getByRole('button', { name: /import essay/i }).click();

        // DB is connected — the "From database" tab is shown and loads automatically.
        await expect(supabasePage.getByText('From database')).toBeVisible({ timeout: 10_000 });

        // Only the submission for THIS rubric + student is listed.
        await expect(supabasePage.getByText('db-essay-student@school.nl')).toBeVisible({ timeout: 10_000 });
        await expect(supabasePage.getByText(/9 words/i)).toBeVisible();
        await expect(supabasePage.getByText('other-db-essay-student@school.nl')).not.toBeVisible();

        await supabasePage.getByRole('button', { name: /^import$/i }).click();

        // The modal closes immediately on import and the Attachments panel
        // opens, showing the essay as an HTML attachment for this student.
        await expect(
            supabasePage.getByText(/essay – db-essay-student@school\.nl/i).first()
        ).toBeVisible({ timeout: 10_000 });
    });
});
