import React from 'react';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import { THEME_BUNDLES, ACCENT_PRESETS } from '../../data/themes';
import type { AppSettings, ExportTemplate, GradeScale, StandardMasteryTarget } from '../../types';

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
const mockUpdateGradeScale = vi.fn((scale: GradeScale) => {
    const idx = mockGradeScalesArr.findIndex((s) => s.id === scale.id);
    if (idx >= 0) mockGradeScalesArr[idx] = scale;
});
const mockDeleteGradeScale = vi.fn();
const mockImportBackup = vi.fn();
const mockShowToast = vi.fn();
const mockSaveAs = vi.fn();
const mockExportFullBackup = vi.fn(() => '{}');
const mockHashPin = vi.fn(async (pin: string) => `hashed:${pin}`);
const mockVerifyPin = vi.fn(async () => true);
const mockIsHashed = vi.fn(() => true);
const mockChangeLanguage = vi.fn();
const mockSeedDemoData = vi.fn();
const mockAddExportTemplate = vi.fn();
const mockDeleteExportTemplate = vi.fn();
const mockDeleteMasteryTarget = vi.fn();
const mockDbStatus = vi.hoisted(() => ({ isConnected: false }));

const mockGradeScalesArr = [mockGradeScale];
const mockTargetsArr: StandardMasteryTarget[] = [];
const mockExportTemplatesArr: ExportTemplate[] = [];

const mockAppValue = {
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    gradeScales: mockGradeScalesArr,
    addGradeScale: mockAddGradeScale,
    updateGradeScale: mockUpdateGradeScale,
    deleteGradeScale: mockDeleteGradeScale,
    commentBank: [] as never[],
    exportTemplates: mockExportTemplatesArr,
    addExportTemplate: mockAddExportTemplate,
    deleteExportTemplate: mockDeleteExportTemplate,
    rubrics: [] as never[],
    students: [] as never[],
    classes: [] as never[],
    studentRubrics: [] as never[],
    importBackup: mockImportBackup,
    standardMasteryTargets: mockTargetsArr,
    addStandardMasteryTarget: vi.fn(),
    updateStandardMasteryTarget: vi.fn(),
    deleteStandardMasteryTarget: mockDeleteMasteryTarget,
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
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
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

vi.mock('../../utils/seedDemoData', () => ({
    seedDemoData: (...args: unknown[]) => mockSeedDemoData(...args),
}));

// TemplateUploadModal parses real .docx bytes — stub it so SettingsPage's onSave
// wiring can be exercised without the file pipeline.
vi.mock('../../components/Rubric/TemplateUploadModal', () => ({
    default: ({ onSave, onClose }: { onSave: (t: unknown) => void; onClose: () => void }) => (
        <div>
            <button
                onClick={() =>
                    onSave({
                        name: 'Uploaded Style',
                        kind: 'style',
                        dataUrl: 'x',
                        levelHeaders: [],
                        headingFont: 'Arial',
                        size: 1,
                    })
                }
            >
                Mock Save Template
            </button>
            <button onClick={onClose}>Mock Close Template</button>
        </div>
    ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            if (key === 'settings.scale_name_gs2') return 'Vertaling';
            if (key === 'navigation.localization') return '';
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

function goToAdminTab() {
    fireEvent.click(screen.getByText('Administration'));
}

describe('SettingsPage coverage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockSettings.userRole = 'admin';
        mockSettings.defaultGradeScaleId = 'gs1';
        delete mockSettings.adminPin;
        mockSettings.language = 'en';
        mockSettings.accentColor = '#3b82f6';
        delete mockSettings.styleTemplateId;
        delete mockSettings.exportTemplateId;
        delete mockSettings.uiFontFamily;
        delete mockSettings.showCambridgeLabels;
        delete mockSettings.dyslexiaFriendlyMode;
        delete mockSettings.comparativeMatchupLimit;
        delete mockSettings.notifyStudentsOnGrade;
        delete mockSettings.notifyStudentsOnMessage;
        delete mockSettings.digestOverdueGradingEnabled;
        delete mockSettings.digestUnreadMessagesEnabled;
        delete mockSettings.digestEmailEnabled;
        delete mockSettings.overdueReminderThreshold;
        mockGradeScalesArr.length = 0;
        mockGradeScalesArr.push({ ...mockGradeScale });
        mockTargetsArr.length = 0;
        mockExportTemplatesArr.length = 0;
        mockDbStatus.isConnected = false;
        mockVerifyPin.mockResolvedValue(true);
        mockIsHashed.mockReturnValue(true);
        const mod = await import('../SettingsPage');
        SettingsPageComp = mod.default;
    });

    describe('role switching and banners', () => {
        it('is a no-op when switching to the current role', () => {
            renderPage();
            fireEvent.click(findButtonByText('settings.role_admin_label'));
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ userRole: 'admin' });
        });

        it('opens the Administration tab from the banner when already admin', () => {
            renderPage();
            fireEvent.click(findButtonByText('Administration tab'));
            expect(screen.getByText('admin.title')).toBeInTheDocument();
        });

        it('switches to admin directly from the banner when no PIN is set', () => {
            mockSettings.userRole = 'teacher';
            renderPage();
            fireEvent.click(findButtonByText('Administration tab'));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'admin' });
        });

        it('returns to the General tab from Teaching', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            expect(screen.getByText('settings.grade_scales')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('tab', { name: 'General' }));
            expect(screen.queryByText('settings.grade_scales')).not.toBeInTheDocument();
        });

        it('loads sample data and reloads the page', () => {
            const reloadSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Load sample data'));
            expect(mockSeedDemoData).toHaveBeenCalled();
            reloadSpy.mockRestore();
        });
    });

    describe('backup import details', () => {
        async function importBackupFile(content: string, files: File[] | null = null) {
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            fireEvent.change(input, {
                target: { files: files ?? [new File([content], 'backup.json', { type: 'application/json' })] },
            });
        }

        it('ignores a change event with no file selected', async () => {
            renderPage();
            goToAdminTab();
            await importBackupFile('{}', []);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(mockShowToast).not.toHaveBeenCalled();
        });

        it('shows an error toast when the import itself throws', async () => {
            mockImportBackup.mockRejectedValue(new Error('boom'));
            renderPage();
            goToAdminTab();
            await importBackupFile('{"rubrics":[]}');
            const dialog = await screen.findByRole('dialog');
            fireEvent.click(within(dialog).getByText('settings.action_confirm_import'));
            await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.import_error', 'error'));
        });

        it('closes the backup preview via its cancel and close buttons', async () => {
            renderPage();
            goToAdminTab();
            await importBackupFile('{"rubrics":[{}]}');
            let dialog = await screen.findByRole('dialog');
            fireEvent.click(within(dialog).getByText('common.cancel'));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            await importBackupFile('{"rubrics":[{}]}');
            dialog = await screen.findByRole('dialog');
            fireEvent.click(within(dialog).getByLabelText('common.cancel'));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    describe('accent presets and theme bundles', () => {
        it('applies an accent preset color', () => {
            renderPage();
            const preset = ACCENT_PRESETS[0];
            fireEvent.click(screen.getAllByLabelText(/^settings\.accent_color_label: /)[0]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ accentColor: preset.color, colorPreset: undefined });
        });

        it('applies a theme bundle (including when already active)', () => {
            renderPage();
            const bundle = THEME_BUNDLES[0];
            fireEvent.click(findButtonByText(`settings.theme_bundle_${bundle.id}`));
            expect(mockUpdateSettings).toHaveBeenCalledWith(
                expect.objectContaining({ colorPreset: bundle.id, accentColor: bundle.accentColor })
            );
            // Clicking the now-active bundle re-renders it in the active style.
            fireEvent.click(findButtonByText(`settings.theme_bundle_${bundle.id}`));
            expect(mockUpdateSettings).toHaveBeenCalledTimes(2);
        });
    });

    describe('general settings controls', () => {
        it('updates the ui font, cambridge labels, dyslexia mode, and restarts the tutorial', () => {
            renderPage();
            fireEvent.change(screen.getByLabelText('settings.ui_font_label'), { target: { value: 'Nunito' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ uiFontFamily: 'Nunito' });

            const checkboxes = screen.getAllByRole('checkbox');
            fireEvent.click(checkboxes[0]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ showCambridgeLabels: true });
            fireEvent.click(checkboxes[1]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ dyslexiaFriendlyMode: true });

            fireEvent.click(findButtonByText('tutorial.restart_button'));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ hasSeenTutorial: false });
        });
    });

    describe('teaching preferences', () => {
        it('changes the default grade scale and the matchup limit', () => {
            mockGradeScalesArr.push({ id: 'gs2', name: 'Points', type: 'custom', ranges: [] });
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            fireEvent.change(screen.getByLabelText('settings.default_grade_scale'), { target: { value: 'gs2' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ defaultGradeScaleId: 'gs2' });

            fireEvent.change(screen.getByLabelText(/comparisons_limit/), { target: { value: '5' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ comparativeMatchupLimit: 5 });
        });

        it('toggles the notification and digest preferences when DB connected', () => {
            mockDbStatus.isConnected = true;
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            const boxes = screen.getAllByRole('checkbox');
            expect(boxes.length).toBe(5);
            fireEvent.click(boxes[0]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ notifyStudentsOnGrade: true });
            fireEvent.click(boxes[1]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ notifyStudentsOnMessage: true });
            fireEvent.click(boxes[2]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ digestOverdueGradingEnabled: true });
            fireEvent.click(boxes[3]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ digestUnreadMessagesEnabled: true });
            fireEvent.click(boxes[4]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ digestEmailEnabled: true });
        });

        it('updates the overdue reminder threshold', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.change(screen.getByLabelText('settings.overdue_threshold_label'), { target: { value: '10' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ overdueReminderThreshold: 10 });
        });
    });

    describe('grade scale editing details', () => {
        it('renames a scale and edits range bounds and colors', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(findButtonByText('settings.action_edit'));

            const nameInput = screen.getAllByRole('textbox').find((i) => (i as HTMLInputElement).value === 'Letter')!;
            fireEvent.change(nameInput, { target: { value: 'Renamed' } });
            const calls = mockUpdateGradeScale.mock.calls.map((c) => c[0] as GradeScale);
            expect(calls.some((gs) => gs.name === 'Renamed')).toBe(true);

            const table = screen.getByRole('table');
            const [minInput, maxInput] = within(table).getAllByRole('spinbutton');
            fireEvent.change(minInput, { target: { value: '10' } });
            fireEvent.change(maxInput, { target: { value: '90' } });
            const bounds = mockUpdateGradeScale.mock.calls.map((c) => c[0] as GradeScale);
            expect(bounds.some((gs) => gs.ranges[0].min === 10 && gs.ranges[0].max === 90)).toBe(true);

            const colorInputs = within(table).getAllByDisplayValue('#22c55e');
            fireEvent.change(colorInputs[0], { target: { value: '#ff0000' } });
            fireEvent.change(colorInputs[1], { target: { value: '#00ff00' } });
            const colors = mockUpdateGradeScale.mock.calls.map((c) => c[0] as GradeScale);
            expect(colors.some((gs) => gs.ranges[0].color === '#ff0000')).toBe(true);
            expect(colors.some((gs) => gs.ranges[0].color === '#00ff00')).toBe(true);
        });

        it('clears the editing state when deleting the scale being edited', () => {
            mockGradeScalesArr.push({ id: 'gs2', name: 'Points', type: 'custom', ranges: [] });
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            const editButtons = screen.getAllByText('settings.action_edit');
            fireEvent.click(editButtons[1]);
            expect(screen.getByText('settings.label_min_pct')).toBeInTheDocument();

            const deleteButtons = screen.getAllByRole('button', { name: 'common.delete' });
            fireEvent.click(deleteButtons[1]);
            const dialog = screen.getByRole('dialog');
            fireEvent.click(within(dialog).getByText('common.cancel'));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[1]);
            fireEvent.click(within(screen.getByRole('dialog')).getByText('common.delete'));
            expect(mockDeleteGradeScale).toHaveBeenCalledWith('gs2');
            // Editing state cleared: the scale's edit panel is gone.
            expect(screen.queryByText('settings.label_min_pct')).not.toBeInTheDocument();
        });
    });

    describe('mastery targets', () => {
        const target = (overrides: Partial<StandardMasteryTarget>): StandardMasteryTarget => ({
            id: 't1',
            standardGuid: 'g1',
            standardDescription: 'Reads at level',
            standardSetTitle: 'Set',
            year: 'jaar-1',
            targetPercentage: 80,
            ...overrides,
        });

        it('renders targets with and without a vo track and deletes one after confirmation', () => {
            mockTargetsArr.push(target({ id: 't1', voTrack: 'havo' }));
            mockTargetsArr.push(target({ id: 't2' }));
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            expect(screen.getByText('HAVO')).toBeInTheDocument();
            expect(screen.getByText('—')).toBeInTheDocument();

            const deleteButtons = screen.getAllByRole('button', { name: 'common.delete' });
            fireEvent.click(deleteButtons[0]);
            const dialog = screen.getByRole('dialog');
            expect(within(dialog).getByText('settings.mastery_target_delete_confirm')).toBeInTheDocument();
            fireEvent.click(within(dialog).getByText('common.delete'));
            expect(mockDeleteMasteryTarget).toHaveBeenCalledWith('t1');
        });
    });

    describe('export templates', () => {
        const styleTemplate = (overrides: Partial<ExportTemplate>): ExportTemplate => ({
            id: 'st1',
            name: 'My Style',
            kind: 'style',
            dataUrl: 'x',
            levelHeaders: [],
            size: 1,
            addedAt: '2026-01-01',
            ...overrides,
        });
        const tableTemplate = (overrides: Partial<ExportTemplate>): ExportTemplate => ({
            id: 'tb1',
            name: 'My Table',
            kind: 'table',
            dataUrl: 'x',
            levelHeaders: ['A', 'B'],
            headerColor: '#1e3a5f',
            size: 1,
            addedAt: '2026-01-01',
            ...overrides,
        });

        function templateCard(): HTMLElement {
            return screen.getByText('settings.export_templates').closest('.card') as HTMLElement;
        }

        it('renders all template variants and applies/unsets/deletes defaults', () => {
            mockExportTemplatesArr.push(
                styleTemplate({ id: 'st1', name: 'Fancy', headingFont: 'Arial', bodyFont: 'Calibri' }),
                styleTemplate({ id: 'st2', name: 'BodyOnly', bodyFont: 'Georgia' }),
                styleTemplate({ id: 'st3', name: 'NoFonts' }),
                tableTemplate({ id: 'tb1', name: 'Headers' }),
                tableTemplate({ id: 'tb2', name: 'NoHeaders', levelHeaders: [] })
            );
            mockSettings.styleTemplateId = 'st1';
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            const card = templateCard();
            expect(within(card).getByText('Fancy')).toBeInTheDocument();
            expect(within(card).getAllByText('settings.template_kind_style').length).toBe(3);
            expect(within(card).getAllByText('settings.template_kind_table').length).toBe(2);
            expect(within(card).getAllByText(/settings\.template_style_summary/).length).toBe(2);
            expect(within(card).getByText('settings.template_style_none_detected')).toBeInTheDocument();
            expect(within(card).getByText('A · B')).toBeInTheDocument();
            expect(within(card).getByText('settings.no_level_headers')).toBeInTheDocument();
            // st1 is active → shows the default label.
            expect(within(card).getByText('settings.label_default')).toBeInTheDocument();

            // Unset the active style default.
            fireEvent.click(within(card).getByText('settings.label_default'));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ styleTemplateId: undefined });

            // Set the table template as default (inactive → set arm).
            const tableSetDefault = within(card)
                .getAllByText('settings.action_set_default')
                .find((b) => {
                    const row = b.closest('div')?.parentElement;
                    return row?.textContent?.includes('Headers');
                })!;
            fireEvent.click(tableSetDefault);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ exportTemplateId: 'tb1' });
        });

        it('deletes an active template and clears its default id', () => {
            mockExportTemplatesArr.push(styleTemplate({ id: 'st1', name: 'Fancy', headingFont: 'Arial' }));
            mockSettings.styleTemplateId = 'st1';
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));

            const card = templateCard();
            fireEvent.click(within(card).getByRole('button', { name: 'common.delete' }));
            expect(mockDeleteExportTemplate).toHaveBeenCalledWith('st1');
            expect(mockUpdateSettings).toHaveBeenCalledWith({ styleTemplateId: undefined });
        });

        it('saves an uploaded template through the upload modal', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(findButtonByText('settings.action_upload_template'));
            fireEvent.click(findButtonByText('Mock Save Template'));
            expect(mockAddExportTemplate).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Uploaded Style', kind: 'style' })
            );
            expect(screen.queryByText('Mock Save Template')).not.toBeInTheDocument();
        });
    });

    describe('admin PIN gate (locked view)', () => {
        it('unlocks via the Enter key after toggling password visibility', async () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            goToAdminTab();

            const input = screen.getByLabelText('Admin password');
            expect(input).toHaveAttribute('type', 'password');
            fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
            expect(input).toHaveAttribute('type', 'text');

            fireEvent.change(input, { target: { value: '1234' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith('1234', 'rm-pin-v2:salt:hash'));
            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'admin' }));
        });

        it('shows an error for the wrong PIN on the lock screen', async () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            mockVerifyPin.mockResolvedValue(false);
            renderPage();
            goToAdminTab();

            fireEvent.change(screen.getByLabelText('Admin password'), { target: { value: '0000' } });
            fireEvent.click(findButtonByText('Switch to Administrator'));
            await waitFor(() => expect(screen.getByText('Incorrect password')).toBeInTheDocument());
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ userRole: 'admin' });
        });

        it('switches directly when no PIN is set on the lock screen', () => {
            // A student is snapped back to General by the downgrade effect, so use a teacher
            // (isUserPlus, but not admin) to reach the lock screen.
            mockSettings.userRole = 'teacher';
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Switch to Administrator'));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'admin' });
        });
    });

    describe('role-switch PIN dialog details', () => {
        function openDialog() {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            fireEvent.click(findButtonByText('settings.role_admin_label'));
        }

        it('closes the dialog via its close and cancel buttons', () => {
            openDialog();
            fireEvent.click(screen.getByRole('button', { name: 'Close' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            fireEvent.click(findButtonByText('settings.role_admin_label'));
            fireEvent.click(screen.getByText('Cancel'));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('submits with the Enter key on the dialog input', async () => {
            openDialog();
            const input = screen.getByLabelText('Admin password');
            fireEvent.change(input, { target: { value: '9999' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith('9999', 'rm-pin-v2:salt:hash'));
        });

        it('toggles the new-password visibility in the admin password form', () => {
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Set admin password'));
            const input = screen.getByLabelText('New password') as HTMLInputElement;
            expect(input.type).toBe('password');
            fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
            expect(input.type).toBe('text');
        });
    });

    describe('settings edge cases', () => {
        it('falls back to the default accent when no color is stored', () => {
            (mockSettings as { accentColor?: string }).accentColor = undefined;
            renderPage();
            const text = screen.getByLabelText('settings.accent_color_label') as HTMLInputElement;
            expect(text.value).toBe('#37b49c');
        });

        it('imports a backup whose rubrics field is not an array', async () => {
            renderPage();
            goToAdminTab();
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            fireEvent.change(input, {
                target: {
                    files: [
                        new File(['{"rubrics":"x","students":{},"classes":null,"studentRubrics":5}'], 'b.json', {
                            type: 'application/json',
                        }),
                    ],
                },
            });
            const dialog = await screen.findByRole('dialog');
            expect(within(dialog).getByText('settings.backup_preview_rubrics')).toBeInTheDocument();
            expect(mockShowToast).not.toHaveBeenCalled();
        });

        it('closes the backup preview modal with the Escape key', async () => {
            renderPage();
            goToAdminTab();
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            fireEvent.change(input, {
                target: { files: [new File(['{"rubrics":[{}]}'], 'b.json', { type: 'application/json' })] },
            });
            await screen.findByRole('dialog');
            fireEvent.keyDown(document.body, { key: 'Escape' });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('shows the infinite badge when the matchup limit is not positive', () => {
            mockSettings.comparativeMatchupLimit = -5;
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            expect(screen.getByText('settings.comparisons_limit_infinite')).toBeInTheDocument();
        });

        it('coerces invalid matchup limit input to 0', () => {
            mockSettings.comparativeMatchupLimit = 5;
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.change(screen.getByLabelText(/comparisons_limit/), { target: { value: 'abc' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ comparativeMatchupLimit: 0 });
        });

        it('coerces invalid overdue threshold input', () => {
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.change(screen.getByLabelText('settings.overdue_threshold_label'), { target: { value: 'abc' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ overdueReminderThreshold: 7 });
            fireEvent.change(screen.getByLabelText('settings.overdue_threshold_label'), { target: { value: '-5' } });
            expect(mockUpdateSettings).toHaveBeenCalledWith({ overdueReminderThreshold: 1 });
        });

        it('shows a translated scale name when a translation exists', () => {
            mockGradeScalesArr.push({ id: 'gs2', name: 'Points', type: 'custom', ranges: [] });
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            expect(screen.getByText('Vertaling')).toBeInTheDocument();
        });

        it('renders the Localization fallback when the translation is empty', () => {
            renderPage();
            expect(screen.getByText('Localization')).toBeInTheDocument();
        });

        it('edits one range of a multi-range scale without touching the others', () => {
            mockGradeScalesArr.push({
                id: 'gs2',
                name: 'Points',
                type: 'custom',
                ranges: [
                    { min: 0, max: 50, label: 'Low', color: '#22c55e' },
                    { min: 51, max: 100, label: 'High', color: '#3b82f6' },
                ],
            });
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            const editButtons = screen.getAllByText('settings.action_edit');
            fireEvent.click(editButtons[1]);

            const table = screen.getAllByRole('table').find((t) => within(t).queryAllByRole('spinbutton').length >= 4)!;
            const [minInput] = within(table).getAllByRole('spinbutton');
            fireEvent.change(minInput, { target: { value: '10' } });
            const calls = mockUpdateGradeScale.mock.calls.map((c) => c[0] as GradeScale);
            expect(
                calls.some((gs) => gs.ranges[0].min === 10 && gs.ranges[1].min === 51 && gs.ranges[1].max === 100)
            ).toBe(true);
        });
    });

    describe('template default details', () => {
        const styleTemplate = (overrides: Partial<ExportTemplate>): ExportTemplate => ({
            id: 'st1',
            name: 'My Style',
            kind: 'style',
            dataUrl: 'x',
            levelHeaders: [],
            size: 1,
            addedAt: '2026-01-01',
            ...overrides,
        });
        const tableTemplate = (overrides: Partial<ExportTemplate>): ExportTemplate => ({
            id: 'tb1',
            name: 'My Table',
            kind: 'table',
            dataUrl: 'x',
            levelHeaders: ['A', 'B'],
            headerColor: '#1e3a5f',
            size: 1,
            addedAt: '2026-01-01',
            ...overrides,
        });

        function templateCard(): HTMLElement {
            return screen.getByText('settings.export_templates').closest('.card') as HTMLElement;
        }

        it('renders a table template without a header color', () => {
            mockExportTemplatesArr.push(tableTemplate({ id: 'tb1', name: 'NoHeaderColor', headerColor: undefined }));
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            const card = templateCard();
            expect(within(card).getByText('NoHeaderColor')).toBeInTheDocument();
        });

        it('sets a style default when none is active', () => {
            mockExportTemplatesArr.push(styleTemplate({ id: 'st2', name: 'Fancy', headingFont: 'Arial' }));
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            const card = templateCard();
            fireEvent.click(within(card).getAllByText('settings.action_set_default')[0]);
            expect(mockUpdateSettings).toHaveBeenCalledWith({ styleTemplateId: 'st2' });
        });

        it('unsets an active export default', () => {
            mockExportTemplatesArr.push(tableTemplate({ id: 'tb1', name: 'Headers' }));
            mockSettings.exportTemplateId = 'tb1';
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            const card = templateCard();
            fireEvent.click(within(card).getByText('settings.label_default'));
            expect(mockUpdateSettings).toHaveBeenCalledWith({ exportTemplateId: undefined });
        });

        it('deletes a non-active template without clearing defaults', () => {
            mockExportTemplatesArr.push(
                styleTemplate({ id: 'st1', name: 'Fancy', headingFont: 'Arial' }),
                tableTemplate({ id: 'tb1', name: 'Headers' })
            );
            mockSettings.styleTemplateId = 'st1';
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            const card = templateCard();
            const deleteBtn = within(card)
                .getAllByRole('button', { name: 'common.delete' })
                .find((b) => b.closest('div')?.parentElement?.textContent?.includes('Headers'))!;
            fireEvent.click(deleteBtn);
            expect(mockDeleteExportTemplate).toHaveBeenCalledWith('tb1');
            expect(mockUpdateSettings).not.toHaveBeenCalledWith({ styleTemplateId: undefined });
        });

        it('clears the export default when deleting an active table template', () => {
            mockExportTemplatesArr.push(tableTemplate({ id: 'tb1', name: 'Headers' }));
            mockSettings.exportTemplateId = 'tb1';
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            const card = templateCard();
            fireEvent.click(within(card).getByRole('button', { name: 'common.delete' }));
            expect(mockDeleteExportTemplate).toHaveBeenCalledWith('tb1');
            expect(mockUpdateSettings).toHaveBeenCalledWith({ exportTemplateId: undefined });
        });
    });

    describe('modal chrome details', () => {
        it('closes the delete-scale dialog via its Close button and Escape', () => {
            mockGradeScalesArr.push({ id: 'gs2', name: 'Points', type: 'custom', ranges: [] });
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[1]);
            const dialog = screen.getByRole('dialog');
            fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[1]);
            fireEvent.keyDown(document.body, { key: 'Escape' });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('closes the mastery-target delete dialog via its buttons and Escape', () => {
            const target: StandardMasteryTarget = {
                id: 't1',
                standardGuid: 'g1',
                standardDescription: 'Reads at level',
                standardSetTitle: 'Set',
                year: 'jaar-1',
                targetPercentage: 80,
            };
            mockTargetsArr.push(target);
            renderPage();
            fireEvent.click(screen.getByText('Teaching'));
            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
            const dialog = screen.getByRole('dialog');
            fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
            fireEvent.click(within(screen.getByRole('dialog')).getByText('common.cancel'));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[0]);
            fireEvent.keyDown(document.body, { key: 'Escape' });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('does not submit on non-Enter keys in the lock screen', () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            goToAdminTab();
            fireEvent.keyDown(screen.getByLabelText('Admin password'), { key: 'a' });
            expect(mockVerifyPin).not.toHaveBeenCalled();
        });

        it('does not submit on non-Enter keys in the pin dialog', () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            fireEvent.click(findButtonByText('settings.role_admin_label'));
            fireEvent.keyDown(screen.getByLabelText('Admin password'), { key: 'a' });
            expect(mockVerifyPin).not.toHaveBeenCalled();
        });

        it('closes the role-switch pin dialog with Escape', () => {
            mockSettings.userRole = 'teacher';
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            fireEvent.click(findButtonByText('settings.role_admin_label'));
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            fireEvent.keyDown(document.body, { key: 'Escape' });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    describe('admin password management', () => {
        it('changes the password after verifying the current one', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Change password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old' } });
            fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new1' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new1' } });
            fireEvent.click(findButtonByText('Save password'));
            await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith('old', 'rm-pin-v2:salt:hash'));
            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ adminPin: 'hashed:new1' }));
        });

        it('rejects changing the password with a wrong current password', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            mockVerifyPin.mockResolvedValue(false);
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Change password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
            fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new1' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new1' } });
            fireEvent.click(findButtonByText('Save password'));
            await waitFor(() => expect(screen.getByText('Current password is incorrect.')).toBeInTheDocument());
            expect(mockUpdateSettings).not.toHaveBeenCalledWith(expect.objectContaining({ adminPin: 'hashed:new1' }));
        });

        it('rejects an empty or mismatched new password', () => {
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Set admin password'));
            fireEvent.click(findButtonByText('Save password'));
            expect(screen.getByText('Password cannot be empty.')).toBeInTheDocument();

            fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'abc' } });
            fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'def' } });
            fireEvent.click(findButtonByText('Save password'));
            expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
        });

        it('removes the admin password after verifying the current one', async () => {
            mockSettings.adminPin = 'rm-pin-v2:salt:hash';
            renderPage();
            goToAdminTab();
            fireEvent.click(findButtonByText('Remove password'));
            fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old' } });
            fireEvent.click(findButtonByText('Remove password'));
            await waitFor(() => expect(mockVerifyPin).toHaveBeenCalledWith('old', 'rm-pin-v2:salt:hash'));
            await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ adminPin: undefined }));
        });

        it('rejects removing the password with a wrong current password', async () => {
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
});
