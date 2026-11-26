import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppProvider, useClasses, useSettings } from './AppContext';
import { storageSync } from '../services/database/StorageSync';

// Co-teacher roles are fetched from the database; the provider test stands them in so the solo
// admin has exactly one co-taught class and one colleague's class.
vi.mock('../hooks/useClassRoles', () => ({
    useMyClassRoles: () => ({ 'c-shared': 'editor' }),
}));

const FORMAT = {
    criterionColWidth: 200,
    levelColWidth: 160,
    fontSize: 14,
    headerColor: '#1e3a5f',
    headerTextColor: '#ffffff',
    accentColor: '#3b82f6',
    fontFamily: 'Inter',
    showWeights: true,
    showPoints: true,
    levelOrder: 'best-first',
};

const ADMIN_SETTINGS = {
    defaultGradeScaleId: 'gs',
    theme: 'light',
    language: 'en',
    accentColor: '',
    defaultFormat: FORMAT,
    userRole: 'admin',
    userId: 'admin-1',
    schoolId: 'school-1',
};

const CLASSES = [
    { id: 'c-mine', name: 'Mine', ownerId: 'admin-1' },
    { id: 'c-shared', name: 'Co-taught', ownerId: 'teacher-2' },
    { id: 'c-foreign', name: 'Theirs', ownerId: 'teacher-3' },
];

const STUDENTS = [
    { id: 's1', name: 'A', classId: 'c-mine' },
    { id: 's2', name: 'B', classId: 'c-shared' },
    { id: 's3', name: 'C', classId: 'c-foreign' },
];

function seed(settings: Record<string, unknown>) {
    localStorage.setItem('rm_settings', JSON.stringify(settings));
    localStorage.setItem('rm_classes', JSON.stringify(CLASSES));
    localStorage.setItem('rm_students', JSON.stringify(STUDENTS));
}

function renderStore() {
    return renderHook(
        () => ({
            classes: useClasses().classes,
            settings: useSettings(),
        }),
        { wrapper: AppProvider }
    );
}

describe('roster scope through AppProvider', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('shows an admin their own and co-taught classes by default', async () => {
        seed(ADMIN_SETTINGS);
        const { result } = renderStore();

        await waitFor(() => expect(result.current.classes.length).toBeGreaterThan(0));
        expect(result.current.classes.map((c) => c.id).sort()).toEqual(['c-mine', 'c-shared']);
    });

    it('shows every class in the school once the admin switches scope', async () => {
        seed(ADMIN_SETTINGS);
        const { result } = renderStore();
        await waitFor(() => expect(result.current.classes).toHaveLength(2));

        act(() => result.current.settings.updateSettings({ rosterScope: 'school' }));

        await waitFor(() => expect(result.current.classes).toHaveLength(3));
        expect(result.current.classes.map((c) => c.id)).toContain('c-foreign');
    });

    it('leaves a teacher untouched — the server already limits them to their own classes', async () => {
        seed({ ...ADMIN_SETTINGS, userRole: 'teacher', userId: 'teacher-3' });
        const { result } = renderStore();

        await waitFor(() => expect(result.current.classes).toHaveLength(3));
    });
});

describe('roster pull width through AppProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('boots a cached admin on a narrow pull, and widens it when they switch to the whole school', async () => {
        const setRosterFetch = vi.spyOn(storageSync, 'setRosterFetch');
        vi.spyOn(storageSync, 'isConnected').mockReturnValue(true);
        const hydratePartial = vi
            .spyOn(storageSync, 'hydratePartial')
            .mockResolvedValue({ data: null, fullFallback: false });
        seed(ADMIN_SETTINGS);

        const { result } = renderStore();

        // The preference must reach the sync service before its first hydrate, so the school's
        // roster is never requested in the first place.
        await waitFor(() => expect(setRosterFetch).toHaveBeenCalledWith('mine'));
        // The sync service is a singleton, so a provider unmounted by an earlier test can still
        // report its own mode here; only the switch below is this test's concern.
        setRosterFetch.mockClear();

        act(() => result.current.settings.updateSettings({ rosterScope: 'school' }));

        await waitFor(() => expect(setRosterFetch).toHaveBeenCalledWith('all'));
        expect(hydratePartial).toHaveBeenCalledWith(new Set(['classes', 'students', 'student_rubrics']));
    });

    it('never narrows the pull for a role that is not confirmed as admin', async () => {
        const setRosterFetch = vi.spyOn(storageSync, 'setRosterFetch');
        vi.spyOn(storageSync, 'isConnected').mockReturnValue(false);
        seed({ ...ADMIN_SETTINGS, userRole: undefined });

        renderStore();

        await waitFor(() => expect(setRosterFetch).toHaveBeenCalledWith('all'));
        expect(setRosterFetch).not.toHaveBeenCalledWith('mine');
    });
});
