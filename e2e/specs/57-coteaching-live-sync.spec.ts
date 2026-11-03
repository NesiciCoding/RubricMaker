/**
 * Supabase integration test for issue #1061: a grade a co-teacher changes reaches the class
 * owner's already-open page live, without a reload — and the "last changed by" note appears.
 *
 * Before this fix, StorageSync's `student_rubrics` realtime subscription filtered on
 * `grader_id=eq.<me>`, so an edit a co-teacher made (grader_id still the owner's, per
 * `protect_coteacher_edit()`, migration 096) never fired the owner's listener; only a reconnect
 * or next login picked it up. `fetchStudentRubrics()` was already unscoped (RLS-only), so the
 * fix is realtime-only: the subscription is now unfiltered too, see StorageSync.ts.
 *
 * Requires a running local Supabase stack (npm run db:start, npm run e2e:supabase).
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import { GradeStudentPage } from '../pages/GradeStudentPage';

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

test.describe('Co-teaching live sync (#1061)', () => {
    test('a co-teacher’s grade edit reaches the class owner’s open page without reload', async ({
        supabasePage,
        colleaguePage,
        testUserEmail,
        colleagueEmail,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const classId = `c-live-${uniq()}`;
        const studentId = `s-live-${uniq()}`;
        const rubricId = `r-live-${uniq()}`;

        await svcInsert('classes', { id: classId, owner_id: ownerId, data: { id: classId, name: 'Live Sync Class' } });
        await svcInsert('students', {
            id: studentId,
            owner_id: ownerId,
            class_id: classId,
            data: { id: studentId, name: 'Live Sync Student', classId },
        });
        await svcInsert('rubrics', {
            id: rubricId,
            owner_id: ownerId,
            data: {
                id: rubricId,
                name: 'Live Sync Rubric',
                criteria: [
                    {
                        id: 'c1',
                        title: 'Criterion 1',
                        description: '',
                        weight: 100,
                        levels: [
                            {
                                id: 'l1',
                                label: 'Excellent',
                                minPoints: 90,
                                maxPoints: 100,
                                description: '',
                                subItems: [],
                            },
                            { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
                        ],
                    },
                ],
                attachmentIds: [],
                createdAt: new Date().toISOString(),
                totalMaxPoints: 100,
                scoringMode: 'weighted-percentage',
            },
        });

        // The owner grades first. This both opens the page we'll later watch update live, and —
        // via rubric_in_coteaching()'s "graded + shares the student's class" clause (096) — gives
        // the colleague read access to this otherwise-private rubric once they share the class.
        const ownerGrade = new GradeStudentPage(supabasePage);
        await ownerGrade.goto(rubricId, studentId);
        await expect(supabasePage.getByText('Live Sync Rubric')).toBeVisible({ timeout: 15_000 });
        await ownerGrade.selectLevel(0, 'Excellent');
        await ownerGrade.save();
        await ownerGrade.waitForSaved();
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        const colleagueId = await resolveUserId(colleagueEmail);
        await svcInsert('class_members', { class_id: classId, user_id: colleagueId, role: 'editor' });

        const colleagueGrade = new GradeStudentPage(colleaguePage);
        await colleagueGrade.goto(rubricId, studentId);
        await expect(colleaguePage.getByText('Live Sync Rubric')).toBeVisible({ timeout: 15_000 });
        await expect(colleagueGrade.getLevelBtn('Excellent')).toHaveClass(/selected/, { timeout: 15_000 });
        await colleagueGrade.selectLevel(0, 'Good');
        await colleagueGrade.save();
        await colleagueGrade.waitForSaved();

        // supabasePage is never navigated or reloaded again from here — the realtime
        // subscription (no longer grader_id-filtered) must bring the colleague's edit in on its
        // own, inside the REALTIME_DEBOUNCE_MS window plus the round trip.
        await expect(ownerGrade.getLevelBtn('Good')).toHaveClass(/selected/, { timeout: 20_000 });
        await expect(supabasePage.getByTestId('last-edited-note')).toBeVisible({ timeout: 20_000 });
    });
});
