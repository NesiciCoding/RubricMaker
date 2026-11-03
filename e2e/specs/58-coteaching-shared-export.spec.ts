/**
 * Supabase integration test for issue #1062: a co-teacher can export grades given with the class
 * owner's rubric, not only their own — ExportPage now resolves rubrics through useRubricPool()
 * (own rubrics plus useSharedMaterials(), which already includes rubrics shared with the
 * colleague or used in a co-taught class, migrations 095/096), the same lookup GradeStudent
 * already used.
 *
 * Requires a running local Supabase stack (npm run db:start, npm run e2e:supabase).
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import { ExportPage } from '../pages/ExportPage';
import { DEFAULT_FORMAT } from '../../src/types';

const svc = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};
const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function svcInsert(table: string, body: unknown): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`insert ${table} failed: ${res.status} ${await res.text()}`);
}

async function resolveUserId(userEmail: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: svc });
    if (!res.ok) throw new Error(`Failed to list users: ${res.status} ${await res.text()}`);
    const { users } = (await res.json()) as { users: { id: string; email: string }[] };
    const user = users?.find((u) => u.email === userEmail);
    if (!user) throw new Error(`Test user ${userEmail} not found in Supabase`);
    return user.id;
}

test.describe('Co-teaching: comparative grading and exports with a colleague’s rubric (#1062)', () => {
    test('a co-teacher can export a grade given with the class owner’s rubric', async ({
        colleaguePage,
        testUserEmail,
        colleagueEmail,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const colleagueId = await resolveUserId(colleagueEmail);
        const classId = `c-exp-${uniq()}`;
        const studentId = `s-exp-${uniq()}`;
        const rubricId = `r-exp-${uniq()}`;
        const levelId = `l-exp-${uniq()}`;
        const criterionId = `crit-exp-${uniq()}`;

        await svcInsert('classes', { id: classId, owner_id: ownerId, data: { id: classId, name: 'Export Co Class' } });
        await svcInsert('students', {
            id: studentId,
            owner_id: ownerId,
            class_id: classId,
            data: { id: studentId, name: 'Export Co Student', classId },
        });
        // Shared with co-teachers (view) — the colleague can read it without having graded it
        // themselves first, matching a rubric that was simply shared rather than co-taught into.
        await svcInsert('rubrics', {
            id: rubricId,
            owner_id: ownerId,
            data: {
                id: rubricId,
                name: 'Export Co Rubric',
                subject: 'English',
                description: '',
                criteria: [
                    {
                        id: criterionId,
                        title: 'Criterion 1',
                        description: '',
                        weight: 100,
                        levels: [
                            {
                                id: levelId,
                                label: 'Excellent',
                                minPoints: 4,
                                maxPoints: 4,
                                description: '',
                                subItems: [],
                            },
                        ],
                    },
                ],
                gradeScaleId: 'letter-10',
                format: DEFAULT_FORMAT,
                attachmentIds: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                totalMaxPoints: 4,
                scoringMode: 'weighted-percentage',
                sharing: { visibility: 'coteachers', access: 'view' },
            },
        });
        await svcInsert('class_members', { class_id: classId, user_id: colleagueId, role: 'editor' });

        const studentRubricId = `sr-exp-${uniq()}`;
        await svcInsert('student_rubrics', {
            id: studentRubricId,
            grader_id: ownerId,
            rubric_id: rubricId,
            student_id: studentId,
            is_peer_review: false,
            data: {
                id: studentRubricId,
                rubricId,
                studentId,
                entries: [{ criterionId, levelId, checkedSubItems: [], comment: '' }],
                overallComment: '',
                isPeerReview: false,
                gradedAt: new Date().toISOString(),
            },
        });

        const exportPage = new ExportPage(colleaguePage);
        await exportPage.goto();
        await exportPage.selectRubricById(rubricId);
        await expect(colleaguePage.getByText('Export Co Student')).toBeVisible({ timeout: 15_000 });
        await exportPage.selectAllStudents();
        // The student's graded result, not the blank rubric — exportDocx() downloads the latter.
        const download = await exportPage.exportStudentGradesDocx();
        expect(download.suggestedFilename()).toMatch(/_grades\.docx$/);
    });
});
