import React from 'react';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, StandardMasteryTarget } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    userRole: 'admin',
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockUpdateSettings = vi.fn((patch: Partial<AppSettings>) => Object.assign(mockSettings, patch));
const mockAddGradeScale = vi.fn(() => ({ ...mockGradeScale, id: 'gs2' }));
// Mirrors the real reducer: replace the entity so later handlers read the updated scale.
const mockUpdateGradeScale = vi.fn((scale: GradeScale) => {
    const idx = mockGradeScalesArr.findIndex((s) => s.id === scale.id);
    if (idx >= 0) mockGradeScalesArr[idx] = scale;
});
const mockDeleteGradeScale = vi.fn();
const mockImportBackup = vi.fn();
const mockShowToast = vi.fn();
const mockSaveAs = vi.fn();
const mockExportFullBackup = vi.fn(() => '{"rubrics":[{}],"students":[],"classes":[]}');
const mockHashPin = vi.fn(async (pin: string) => `hashed:${pin}`);
const mockVerifyPin = vi.fn(async () => true);
const mockIsHashed = vi.fn(() => true);
const mockChangeLanguage = vi.fn();
const mockDbStatus = vi.hoisted(() => ({ isConnected: false }));

const mockGradeScalesArr = [mockGradeScale];
const mockTargetsArr: StandardMasteryTarget[] = [];

const mockAppValue = {
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    gradeScales: mockGradeScalesArr,
    addGradeScale: mockAddGradeScale,
    updateGradeScale: mockUpdateGradeScale,
    deleteGradeScale: mockDeleteGradeScale,
    commentBank: [] as never[],
    exportTemplates: [] as never[],
    addExportTemplate: vi.fn(),
    deleteExportTemplate: vi.fn(),
    rubrics: [] as never[],
    students: [] as never[],
    classes: [] as never[],
    studentRubrics: [] as never[],
    importBackup: mockImportBackup,
    standardMasteryTargets: mockTargetsArr,
    addStandardMasteryTarget: vi.fn(),
    updateStandardMasteryTarget: vi.fn(),
    deleteStandardMasteryTarget: vi.fn(),
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockDbStatus.isConnected }),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('file-saver', () => ({
    saveAs: (...args: unknown[]) => mockSaveAs(...args),
}));

vi.mock('../../store/storage', () => ({
    exportFullBackup: (...args: Parameters<typeof mockExportFullBackup>) => mockExportFullBackup(...args),
}));

vi.mock('../../utils/pinHash', () => ({
    hashPin: (...args: Parameters<typeof mockHashPin>) => mockHashPin(...args),
    verifyPin: (...args: Parameters<typeof mockVerifyPin>) => mockVerifyPin(...args),
    isHashed: (...args: Parameters<typeof mockIsHashed>) => mockIsHashed(...args),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en', changeLanguage: mockChangeLanguage },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

let SettingsPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<SettingsPageComp />);
}

function findButtonByText(text: string): HTMLElement {
    return screen.getAllByRole('button').find((b) => b.textContent?.includes(text))!;
}

describe('SettingsPage extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockSettings.userRole = 'admin';
        delete mockSettings.adminPin;
        mockSettings.language = 'en';
        mockSettings.accentColor = '#3b82f6';
        mockGradeScalesArr.length = 0;
        mockGradeScalesArr.push({ ...mockGradeScale });
        mockTargetsArr.length = 0;
        mockDbStatus.isConnected = false;
        mockVerifyPin.mockResolvedValue(true);
        mockIsHashed.mockReturnValue(true);
        const mod = await import('../SettingsPage');
        SettingsPageComp = mod.default;
    });

    it('normalizes legacy and invalid stored roles', () => {
        mockSettings.userRole = 'user' as AppSettings['userRole'];
        renderPage();
        // 'user' maps to teacher (badge + switch button both show the teacher label)
        expect(screen.getAllByText('settings.role_teacher_label').length).toBeGreaterThan(0);

        mockSettings.userRole = 'alien' as AppSettings['userRole'];
        renderPage();
        // unknown values fall back to admin
        expect(screen.getAllByText('settings.role_admin_label').length).toBeGreaterThan(0);
    });

    it('switches i18n language to the stored setting on mount', () => {
        mockSettings.language = 'nl';
        renderPage();
        expect(mockChangeLanguage).toHaveBeenCalledWith('nl');
    });

    describe('PIN-gated admin role switch', () => {
        it('requires the admin PIN to switch to admin and applies the role on success', async () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();

            fireEvent.click(findButtonByText('settings.role_admin_label'));
            const input = screen.getByLabelText('Admin password');
            fireEvent.change(input, { target: { value: '1234' } });
            fireEvent.click(findButtonByText('Confirm'));

            await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith('1234', 'rm-pin-v2:salt:hash'));
            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'admin' }));
            expect(mockShowToast).toHaveBeenCalledWith(
                'settings.role_changed_to:{"role":"settings.role_admin_label"}',
                'success'
            );
        });

        it('shows an error and does not switch when the PIN is wrong', async () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            mockVerifyPin.mockResolvedValue(false);
            renderPage();

            fireEvent.click(findButtonByText('settings.role_admin_label'));
            fireEvent.change(screen.getByLabelText('Admin password'), { target: { value: '0000' } });
            fireEvent.click(findButtonByText('Confirm'));

            await waitFor(() => expect(screen.getByText('Incorrect password. Please try again.')).toBeInTheDocument());
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ userRole: 'admin' });
        });

        it('upgrades a legacy plaintext PIN to a hash on first successful use', async () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = '1234';
            mockIsHashed.mockReturnValue(false);
            renderPage();

            fireEvent.click(findButtonByText('settings.role_admin_label'));
            fireEvent.change(screen.getByLabelText('Admin password'), { target: { value: '1234' } });
            fireEvent.click(findButtonByText('Confirm'));

            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ adminPin: 'hashed:1234' }));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'admin' });
        });

        it('toggles the PIN visibility in the role-switch dialog', () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = '1234';
            renderPage();

            fireEvent.click(findButtonByText('settings.role_admin_label'));
            const input = screen.getByLabelText('Admin password') as HTMLInputElement;
            expect(input.type).toBe('password');
            fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
            expect(input.type).toBe('text');
        });
    });

    describe('admin PIN management', () => {
        function goToAdminTab() {
            fireEvent.click(screen.getByText('Administration'));
        }

        it('sets a new admin password', async () => {
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Set admin password'));
            fireEvent.change(screen.getByLabelText('New password'), { target: { value: '1234' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: '1234' } });
            fireEvent.click(findButtonByText('Save password'));

            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ adminPin: 'hashed:1234' }));
            expect(mockShowToast).toHaveBeenCalledWith('Admin password saved', 'success');
        });

        it('rejects an empty or mismatched new password', async () => {
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Set admin password'));
            fireEvent.click(findButtonByText('Save password'));
            expect(screen.getByText('Password cannot be empty.')).toBeInTheDocument();

            fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'aaaa' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'bbbb' } });
            fireEvent.click(findButtonByText('Save password'));
            expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ adminPin: expect.any(String) });
        });

        it('verifies the current password when changing it', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Change password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old' } });
            fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new' } });
            fireEvent.click(findButtonByText('Save password'));

            await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith('old', 'rm-pin-v2:salt:hash'));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ adminPin: 'hashed:new' });
        });

        it('rejects a change with the wrong current password', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            mockVerifyPin.mockResolvedValue(false);
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Change password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
            fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new' } });
            fireEvent.click(findButtonByText('Save password'));

            await waitFor(() => expect(screen.getByText('Current password is incorrect.')).toBeInTheDocument());
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ adminPin: 'hashed:new' });
        });

        it('removes the admin password after verifying the current one', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Remove password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: '1234' } });
            fireEvent.click(findButtonByText('Remove password'));

            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ adminPin: undefined }));
            expect(mockShowToast).toHaveBeenCalledWith('Admin password removed', 'info');
        });

        it('rejects removing the password with the wrong current one', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            mockVerifyPin.mockResolvedValue(false);
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Remove password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
            fireEvent.click(findButtonByText('Remove password'));

            await waitFor(() => expect(screen.getByText('Current password is incorrect.')).toBeInTheDocument());
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ adminPin: undefined });
        });
    });

    describe('backup export/import', () => {
        it('exports a backup file via saveAs', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(findButtonByText('settings.action_export_backup'));

            expect(mockExportFullBackup).toHaveBeenCalled();
            expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'rubric-maker-backup.json');
        });

        async function importBackupFile(content: string) {
            const file = new File([content], 'backup.json', { type: 'application/json' });
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            fireEvent.change(input, { target: { files: [file] } });
        }

        it('previews a valid backup and confirms the import', async () => {
            mockImportBackup.mockResolvedValue(true);
            renderPage();
            fireEvent.click(screen.getByText('Administration'));
            await importBackupFile(
                '{"rubrics":[{"id":"r1"}],"students":[{"id":"s1"}],"classes":[],"studentRubrics":[]}'
            );

            const dialog = await screen.findByRole('dialog');
            expect(within(dialog).getByText('settings.backup_preview_title')).toBeInTheDocument();
            // Summary counts come from the parsed JSON — rubrics: 1, students: 1
            expect(within(dialog).getAllByText('1')).toHaveLength(2);

            fireEvent.click(within(dialog).getByText('settings.action_confirm_import'));
            await waitFor(() => expect(mockImportBackup).toHaveBeenCalled());
            expect(mockShowToast).toHaveBeenCalledWith('toast.import_success', 'success');
        });

        it('shows an error toast for invalid or non-object backup files', async () => {
            renderPage();
            fireEvent.click(screen.getByText('Administration'));
            await importBackupFile('not json');
            await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.import_error', 'error'));

            await importBackupFile('[]');
            await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.import_error', 'error'));
        });

        it('shows an error toast when the import itself fails', async () => {
            mockImportBackup.mockResolvedValue(false);
            renderPage();
            fireEvent.click(screen.getByText('Administration'));
            await importBackupFile('{"rubrics":[]}');

            const dialog = await screen.findByRole('dialog');
            fireEvent.click(within(dialog).getByText('settings.action_confirm_import'));
            await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.import_error', 'error'));
        });
    });

    describe('accent color', () => {
        it('flags an invalid hex color and does not persist it', () => {
            renderPage();
            const textInput = screen.getByLabelText('settings.accent_color_label');
            fireEvent.change(textInput, { target: { value: '#12345' } });
            expect(screen.getByText('settings.accent_color_invalid')).toBeInTheDocument();
            expect(mockUpdateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ accentColor: '#12345' }));

            fireEvent.change(textInput, { target: { value: '#ffaa00' } });
            expect(screen.queryByText('settings.accent_color_invalid')).not.toBeInTheDocument();
            expect(mockUpdateSettings).toHaveBeenCalledWith({ accentColor: '#ffaa00', colorPreset: undefined });
        });
    });

    describe('grade scale management', () => {
        it('edits range fields and adds/removes ranges', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(findButtonByText('settings.action_edit'));

            const labelInput = screen.getAllByDisplayValue('A')[0] as HTMLInputElement;
            fireEvent.change(labelInput, { target: { value: 'Excellent' } });
            const labels = (call: number) =>
                (mockUpdateGradeScale.mock.calls[call][0] as GradeScale).ranges.map((r) => r.label);
            expect(labels(0)).toEqual(['Excellent']);

            fireEvent.click(findButtonByText('settings.action_add_range'));
            expect(labels(1)).toEqual(['Excellent', 'New']);

            // The ranges table contains a per-row delete button; removing the first
            // range leaves only the newly added one.
            const table = screen.getByRole('table');
            fireEvent.click(within(table).getByRole('button', { name: 'common.delete' }));
            expect(labels(2)).toEqual(['New']);

            fireEvent.click(findButtonByText('settings.action_collapse'));
            expect(screen.queryByText('settings.label_min_pct')).not.toBeInTheDocument();
        });

        it('deletes a non-default grade scale after confirmation', () => {
            mockGradeScalesArr.push({ id: 'gs2', name: 'Points', type: 'custom', ranges: [] });
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            const deleteButtons = screen.getAllByRole('button', { name: 'common.delete' });
            fireEvent.click(deleteButtons[1]);
            const dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('settings.delete_scale_confirm')).toBeInTheDocument();
            fireEvent.click(within(dialog).getByText('common.delete'));
            expect(mockDeleteGradeScale).toHaveBeenCalledWith('gs2');
        });

        it('blocks deleting the default grade scale with a toast', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);

            expect(mockDeleteGradeScale).not.toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith('settings.alert_cannot_delete_default', 'info');
        });

        it('falls back to the scale name when no preset translation exists', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            expect(screen.getByRole('option', { name: 'Letter' })).toBeInTheDocument();
        });
    });

    describe('role restrictions', () => {
        it('hides the Teaching tab and downgrades back to General when a student clicks Administration', () => {
            mockSettings.userRole = 'student';
            renderPage();

            expect(screen.queryByText('Teaching')).not.toBeInTheDocument();
            const adminTab = screen.getByRole('tab', { name: 'Administration (admin access required)' });
            fireEvent.click(adminTab);
            // The downgrade effect immediately resets non-general tabs for non-teacher roles.
            expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
        });

        it('resets to the General tab when the role downgrades while on Teaching', () => {
            mockSettings.userRole = 'teacher';
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            expect(screen.getByText('settings.grade_scales')).toBeInTheDocument();

            // Simulate the role changing from outside (e.g. a sync applying a stored role):
            // the next state change re-renders and the guard effect snaps back to General.
            mockSettings.userRole = 'student';
            fireEvent.click(screen.getByText('Administration'));
            expect(screen.queryByText('settings.grade_scales')).not.toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
        });

        it('switches role without a PIN prompt when no admin PIN is set', () => {
            mockSettings.userRole = 'teacher';
            renderPage();
            fireEvent.click(findButtonByText('settings.role_admin_label'));
            expect(screen.queryByLabelText('Admin password')).not.toBeInTheDocument();
            expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'admin' });
        });
    });
});
