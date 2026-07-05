import { describe, it, expect, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { makeClient, makeSequencedClient, adapterWithClient } from './supabaseTestUtils';

describe('SupabaseAdapter profile methods', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('fetchAllProfiles returns [] when not configured', async () => {
        expect(await adapter.fetchAllProfiles()).toEqual([]);
    });

    it('fetchAllProfiles maps snake_case rows and defaults a missing role to teacher', async () => {
        const rows = [
            { id: 'u1', email: 'a@x.com', display_name: 'Alice', role: 'admin' },
            { id: 'u2', email: null, display_name: null, role: null },
        ];
        const client = makeClient({ data: rows, error: null });
        const connected = adapterWithClient(client);

        const result = await connected.fetchAllProfiles();

        expect(client.from).toHaveBeenCalledWith('profiles');
        expect(result).toEqual([
            { id: 'u1', email: 'a@x.com', displayName: 'Alice', role: 'admin' },
            { id: 'u2', email: undefined, displayName: undefined, role: 'teacher' },
        ]);
    });

    it('fetchAllProfiles returns [] on error', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        expect(await adapterWithClient(client).fetchAllProfiles()).toEqual([]);
    });

    it('updateUserRole returns a failure result when not configured', async () => {
        const result = await adapter.updateUserRole('u1', 'admin');
        expect(result).toEqual({ success: false, error: 'Not connected' });
    });

    it('updateUserRole succeeds and targets the given user id', async () => {
        const client = makeClient({ data: null, error: null });
        const connected = adapterWithClient(client);

        const result = await connected.updateUserRole('u1', 'admin');

        expect(client.from).toHaveBeenCalledWith('profiles');
        expect(result).toEqual({ success: true });
    });

    it('updateUserRole surfaces an error result', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const result = await adapterWithClient(client).updateUserRole('u1', 'admin');
        expect(result).toEqual({ success: false, error: 'boom' });
    });
});

describe('SupabaseAdapter school methods', () => {
    let adapter: SupabaseAdapter;

    beforeEach(() => {
        adapter = new SupabaseAdapter();
    });

    it('fetchSchools returns [] when not configured', async () => {
        expect(await adapter.fetchSchools()).toEqual([]);
    });

    it('fetchSchools maps rows and defaults retentionYears to 3', async () => {
        const rows = [
            { id: 's1', name: 'Alpha School', created_by: 'u1', retention_years: 5, created_at: '2024-01-01' },
            { id: 's2', name: 'Beta School', created_by: null, retention_years: null, created_at: '2024-01-02' },
        ];
        const client = makeClient({ data: rows, error: null });
        const result = await adapterWithClient(client).fetchSchools();

        expect(client.from).toHaveBeenCalledWith('schools');
        expect(result).toEqual([
            { id: 's1', name: 'Alpha School', createdBy: 'u1', retentionYears: 5, createdAt: '2024-01-01' },
            { id: 's2', name: 'Beta School', createdBy: undefined, retentionYears: 3, createdAt: '2024-01-02' },
        ]);
    });

    it('createSchool inserts the school, membership, and profile link, returning the mapped school', async () => {
        const schoolRow = {
            id: 's1',
            name: 'Alpha',
            created_by: 'user1',
            retention_years: 3,
            created_at: '2024-01-01',
        };
        const client = makeSequencedClient({
            schools: [{ data: schoolRow, error: null }],
            school_members: [{ data: null, error: null }],
            profiles: [{ data: null, error: null }],
        });

        const result = await adapterWithClient(client).createSchool('Alpha', 3);

        expect(client.from).toHaveBeenCalledWith('school_members');
        // call order: 0 = schools insert, 1 = school_members insert, 2 = profiles update
        const memberBuilder = client.from.mock.results[1].value;
        expect(memberBuilder.insert).toHaveBeenCalledWith({ school_id: 's1', profile_id: 'user1' });
        const profileBuilder = client.from.mock.results[2].value;
        expect(profileBuilder.update).toHaveBeenCalledWith({ school_id: 's1' });
        expect(result).toEqual({
            id: 's1',
            name: 'Alpha',
            createdBy: 'user1',
            retentionYears: 3,
            createdAt: '2024-01-01',
        });
    });

    it('createSchool rolls back the school row if the membership insert fails', async () => {
        const schoolRow = {
            id: 's1',
            name: 'Alpha',
            created_by: 'user1',
            retention_years: 3,
            created_at: '2024-01-01',
        };
        const client = makeSequencedClient({
            schools: [
                { data: schoolRow, error: null },
                { data: null, error: null },
            ], // insert, then rollback delete
            school_members: [{ data: null, error: { message: 'membership boom' } }],
        });

        const result = await adapterWithClient(client).createSchool('Alpha', 3);

        expect(result).toBeNull();
        // Two calls to 'schools': the insert, and the rollback delete.
        expect(client.from).toHaveBeenCalledTimes(3);
    });

    it('createSchool rolls back membership and school if the profile link fails', async () => {
        const schoolRow = {
            id: 's1',
            name: 'Alpha',
            created_by: 'user1',
            retention_years: 3,
            created_at: '2024-01-01',
        };
        const client = makeSequencedClient({
            schools: [
                { data: schoolRow, error: null },
                { data: null, error: null },
            ],
            school_members: [
                { data: null, error: null },
                { data: null, error: null },
            ],
            profiles: [{ data: null, error: { message: 'profile boom' } }],
        });

        const result = await adapterWithClient(client).createSchool('Alpha', 3);

        expect(result).toBeNull();
        expect(client.from).toHaveBeenCalledTimes(5); // insert x3, rollback member delete, rollback school delete
    });

    it('updateSchool only patches the provided fields', async () => {
        const client = makeClient({ data: null, error: null });
        const connected = adapterWithClient(client);

        const result = await connected.updateSchool('s1', { retentionYears: 7 });

        expect(result).toEqual({ success: true });
        const builder = client.from.mock.results[0].value;
        expect(builder.update).toHaveBeenCalledWith({ retention_years: 7 });
    });

    it('deleteSchool surfaces an error result', async () => {
        const client = makeClient({ data: null, error: { message: 'boom' } });
        const result = await adapterWithClient(client).deleteSchool('s1');
        expect(result).toEqual({ success: false, error: 'boom' });
    });

    it('fetchSchoolMembers maps nested profile rows and falls back when the profile is missing', async () => {
        const rows = [
            {
                profile_id: 'u1',
                created_at: '2024-01-01',
                profiles: { id: 'u1', email: 'a@x.com', display_name: 'Alice', role: 'teacher' },
            },
            { profile_id: 'u2', created_at: '2024-01-02', profiles: null },
        ];
        const client = makeClient({ data: rows, error: null });
        const result = await adapterWithClient(client).fetchSchoolMembers('s1');

        expect(result).toEqual([
            { id: 'u1', email: 'a@x.com', displayName: 'Alice', role: 'teacher', joinedAt: '2024-01-01' },
            { id: 'u2', email: undefined, displayName: undefined, role: 'teacher', joinedAt: '2024-01-02' },
        ]);
    });

    it('removeSchoolMember deletes membership and clears the profile school link', async () => {
        const client = makeSequencedClient({
            school_members: [{ data: null, error: null }],
            profiles: [{ data: null, error: null }],
        });

        const result = await adapterWithClient(client).removeSchoolMember('s1', 'u1');

        expect(result).toEqual({ success: true });
    });

    it('removeSchoolMember re-inserts membership if clearing the profile link fails, and reports both errors on rollback failure', async () => {
        const client = makeSequencedClient({
            school_members: [
                { data: null, error: null }, // delete
                { data: null, error: { message: 'rollback boom' } }, // rollback re-insert
            ],
            profiles: [{ data: null, error: { message: 'profile boom' } }],
        });

        const result = await adapterWithClient(client).removeSchoolMember('s1', 'u1');

        expect(result).toEqual({
            success: false,
            error: 'profile boom; rollback failed: rollback boom',
        });
    });
});
