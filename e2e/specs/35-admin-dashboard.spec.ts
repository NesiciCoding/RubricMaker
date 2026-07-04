import { test, expect } from '../fixtures/supabase.fixture';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, makeTestEmail } from '../fixtures/supabase.fixture';

const adminHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

/** Create a second confirmed user directly via the admin API, without signing in as them. */
async function createBystanderUser(email: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`Failed to create bystander user: ${res.status} ${await res.text()}`);
    const user = (await res.json()) as { id: string };
    return user.id;
}

async function deleteUserById(userId: string): Promise<void> {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: adminHeaders });
}

async function fetchProfileRole(userId: string): Promise<string | null> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, { headers: adminHeaders });
    const rows = (await res.json()) as { role: string }[];
    return rows[0]?.role ?? null;
}

test.describe('Admin dashboard — Schools tab', () => {
    test('creating a school lists it, shows the creator as a member, updates retention, and deletes', async ({
        supabasePage,
    }) => {
        await supabasePage.goto('http://localhost:5173/#/admin');
        await supabasePage.waitForSelector('.page-content', { timeout: 15_000 });
        await supabasePage.getByRole('button', { name: 'Schools' }).click();
        await expect(supabasePage.getByText(/loading schools/i)).not.toBeVisible({ timeout: 15_000 });

        const schoolName = `E2E School ${Date.now()}`;
        await supabasePage.getByPlaceholder('e.g. Springfield High').fill(schoolName);
        await supabasePage.getByRole('button', { name: 'New school' }).click();

        const schoolCard = supabasePage.locator('.card').filter({ hasText: schoolName });
        await expect(schoolCard).toBeVisible({ timeout: 10_000 });

        await schoolCard.getByRole('button', { name: 'Show members' }).click();
        await expect(schoolCard.getByText(/no members/i)).not.toBeVisible({ timeout: 10_000 });

        const retentionInput = schoolCard.locator('input[type="number"]');
        await retentionInput.fill('9');
        await schoolCard.getByRole('button', { name: 'Save' }).click();
        await expect(schoolCard).toContainText(schoolName);

        supabasePage.once('dialog', (dialog) => dialog.accept());
        await schoolCard.getByRole('button', { name: 'Delete' }).click();
        await expect(supabasePage.locator('.card').filter({ hasText: schoolName })).not.toBeVisible({
            timeout: 10_000,
        });
    });
});

test.describe('Admin dashboard — Users tab', () => {
    test('an admin sees their own row locked and can promote another user to admin', async ({
        adminSupabasePage,
        testUserEmail,
    }) => {
        const bystanderEmail = makeTestEmail();
        const bystanderId = await createBystanderUser(bystanderEmail);

        try {
            await adminSupabasePage.goto('http://localhost:5173/#/admin');
            await adminSupabasePage.waitForSelector('.page-content', { timeout: 15_000 });
            await expect(adminSupabasePage.getByText(/loading users/i)).not.toBeVisible({ timeout: 15_000 });

            const ownRow = adminSupabasePage.locator('tr').filter({ hasText: testUserEmail });
            await expect(ownRow).toBeVisible({ timeout: 10_000 });
            await expect(ownRow.locator('select')).toBeDisabled();

            const bystanderRow = adminSupabasePage.locator('tr').filter({ hasText: bystanderEmail });
            await expect(bystanderRow).toBeVisible({ timeout: 10_000 });
            await expect(bystanderRow.locator('select')).toHaveValue('teacher');

            await bystanderRow.locator('select').selectOption({ label: 'Admin' });
            await expect(bystanderRow.getByText(/saving/i)).toHaveCount(0, { timeout: 10_000 });

            expect(await fetchProfileRole(bystanderId)).toBe('admin');
        } finally {
            await deleteUserById(bystanderId);
        }
    });
});
