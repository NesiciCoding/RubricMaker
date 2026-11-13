import { describe, expect, it, vi } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { adapterWithClient } from './supabaseTestUtils';

function withUpdateUser(result: { error: { message: string; code?: string } | null }, anonymous = false) {
    const updateUser = vi.fn().mockResolvedValue(result);
    const adapter = adapterWithClient({ auth: { updateUser } });
    Object.assign(adapter as unknown as Record<string, unknown>, { userIsAnonymous: anonymous });
    return { adapter, updateUser };
}

describe('SupabaseAdapter.updateMyPassword', () => {
    it('sets the password on the signed-in user', async () => {
        const { adapter, updateUser } = withUpdateUser({ error: null });
        await expect(adapter.updateMyPassword('longenough1')).resolves.toEqual({});
        expect(updateUser).toHaveBeenCalledWith({ password: 'longenough1' });
    });

    it('passes back the Supabase error message and code', async () => {
        const { adapter } = withUpdateUser({ error: { message: 'weak', code: 'weak_password' } });
        await expect(adapter.updateMyPassword('longenough1')).resolves.toEqual({
            error: 'weak',
            code: 'weak_password',
        });
    });

    it('refuses anonymous sessions and missing connections', async () => {
        const { adapter, updateUser } = withUpdateUser({ error: null }, true);
        expect((await adapter.updateMyPassword('longenough1')).error).toBeTruthy();
        expect(updateUser).not.toHaveBeenCalled();
        expect((await new SupabaseAdapter().updateMyPassword('longenough1')).error).toBe('Not connected');
    });
});
