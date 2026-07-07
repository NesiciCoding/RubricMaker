import React from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, StandardMasteryTarget } from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    userRole: 'admin',
};

const mockUpdateSettings = vi.fn();
const mockAddGradeScale = vi.fn(() => ({ ...mockGradeScale, id: 'gs2' }));
const mockShowToast = vi.fn();

// Stable references — see other page tests in this directory for why fresh array/object
// literals on every useApp() call can cause infinite render loops via memo/effect deps.
const mockGradeScalesArr = [mockGradeScale];
const mockCommentBankArr: never[] = [];
const mockExportTemplatesArr: never[] = [];
const mockRubricsArr: never[] = [];
const mockStudentsArr: never[] = [];
const mockClassesArr: never[] = [];
const mockStudentRubricsArr: never[] = [];
const mockTargetsArr: StandardMasteryTarget[] = [];

const mockAppValue = {
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    gradeScales: mockGradeScalesArr,
    addGradeScale: mockAddGradeScale,
    updateGradeScale: vi.fn(),
    deleteGradeScale: vi.fn(),
    commentBank: mockCommentBankArr,
    exportTemplates: mockExportTemplatesArr,
    addExportTemplate: vi.fn(),
    deleteExportTemplate: vi.fn(),
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    importBackup: vi.fn(),
    standardMasteryTargets: mockTargetsArr,
    addStandardMasteryTarget: vi.fn(),
    updateStandardMasteryTarget: vi.fn(),
    deleteStandardMasteryTarget: vi.fn(),
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false }),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../components/Comments/CommentBankModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'comment-bank-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Modal')
        ),
}));

vi.mock('../../components/Rubric/TemplateUploadModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'template-upload-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Upload')
        ),
}));

vi.mock('../../components/Standards/StandardMasteryTargetModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'mastery-target-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Mastery Modal')
        ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

let SettingsPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<SettingsPageComp />);
}

describe('SettingsPage', () => {
    beforeEach(async () => {
        mockUpdateSettings.mockClear();
        mockAddGradeScale.mockClear();
        mockShowToast.mockClear();
        mockAppValue.deleteStandardMasteryTarget.mockClear();
        mockTargetsArr.length = 0;
        const mod = await import('../SettingsPage');
        SettingsPageComp = mod.default;
    });

    it('renders the General tab by default', () => {
        renderPage();
        expect(screen.getByText('settings.title')).toBeInTheDocument();
        expect(screen.getByText('General')).toBeInTheDocument();
    });

    it('changes the language', () => {
        renderPage();
        const langSelect = screen.getByLabelText('settings.language_selection');
        fireEvent.change(langSelect, { target: { value: 'nl' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ language: 'nl' });
    });

    it('switches to the Teaching tab and adds a grade scale', () => {
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        expect(screen.getByText('settings.grade_scales')).toBeInTheDocument();
        fireEvent.click(screen.getByText('settings.action_new_scale'));
        expect(mockAddGradeScale).toHaveBeenCalledWith(
            expect.objectContaining({ name: expect.any(String), type: expect.any(String), ranges: expect.any(Array) })
        );
    });

    it('opens and closes the comment bank modal from the Teaching tab', () => {
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        fireEvent.click(screen.getByText('settings.action_manage_comments'));
        expect(screen.getByTestId('comment-bank-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Modal'));
        expect(screen.queryByTestId('comment-bank-modal')).not.toBeInTheDocument();
    });

    it('opens and closes the template upload modal from the Teaching tab', () => {
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        fireEvent.click(screen.getByText('settings.action_upload_template'));
        expect(screen.getByTestId('template-upload-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Upload'));
        expect(screen.queryByTestId('template-upload-modal')).not.toBeInTheDocument();
    });

    it('shows the empty state for mastery targets on the Teaching tab', () => {
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        expect(screen.getByText('settings.mastery_targets_empty')).toBeInTheDocument();
    });

    it('opens the mastery target modal from the add button', () => {
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        fireEvent.click(screen.getByText('settings.mastery_target_add_title'));
        expect(screen.getByTestId('mastery-target-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Mastery Modal'));
        expect(screen.queryByTestId('mastery-target-modal')).not.toBeInTheDocument();
    });

    it('opens the mastery target modal to edit an existing target', () => {
        mockTargetsArr.push({
            id: 'mt1',
            standardGuid: 'guid1',
            standardDescription: 'Reads and interprets literary texts',
            standardSetTitle: 'CCSS',
            year: 'jaar-3',
            voTrack: 'havo',
            targetPercentage: 80,
        });
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        expect(screen.getByText('Reads and interprets literary texts')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.edit'));
        expect(screen.getByTestId('mastery-target-modal')).toBeInTheDocument();
    });

    it('deletes a mastery target after confirming', () => {
        mockTargetsArr.push({
            id: 'mt1',
            standardGuid: 'guid1',
            standardDescription: 'Reads and interprets literary texts',
            standardSetTitle: 'CCSS',
            year: 'jaar-3',
            voTrack: 'havo',
            targetPercentage: 80,
        });
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        fireEvent.click(screen.getByText('common.delete'));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('settings.mastery_target_delete_confirm')).toBeInTheDocument();
        expect(mockAppValue.deleteStandardMasteryTarget).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByText('common.delete'));
        expect(mockAppValue.deleteStandardMasteryTarget).toHaveBeenCalledWith('mt1');
    });

    it('switches to the Administration tab (admin role)', () => {
        renderPage();
        fireEvent.click(screen.getByText('Administration'));
        // Smoke check: the tab switch itself exercises the admin-only render branch.
        expect(screen.getByRole('button', { name: 'Administration' })).toHaveAttribute('aria-selected', 'true');
    });

    it('renders role switch buttons on the General tab', () => {
        renderPage();
        expect(screen.getAllByText('settings.role_admin_label').length).toBeGreaterThan(0);
        expect(screen.getByText('settings.role_teacher_label')).toBeInTheDocument();
        expect(screen.getByText('settings.role_student_label')).toBeInTheDocument();
    });

    it('renders the theme selector on the General tab', () => {
        renderPage();
        const themeSelect = screen.getByLabelText('settings.theme');
        expect(themeSelect).toBeInTheDocument();
        fireEvent.change(themeSelect, { target: { value: 'light' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'light' });
    });

    it('switches to teacher role when teacher button clicked', () => {
        renderPage();
        const teacherBtn = screen.getByText('settings.role_teacher_label');
        fireEvent.click(teacherBtn);
        expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'teacher' });
    });

    it('renders accent color input on the General tab (admin has isUserPlus)', () => {
        renderPage();
        const accentInput = screen.getByLabelText('settings.accent_color_label (picker)');
        expect(accentInput).toBeInTheDocument();
        fireEvent.change(accentInput, { target: { value: '#ff0000' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ accentColor: '#ff0000' });
    });

    it('renders language selector', () => {
        renderPage();
        expect(screen.getByLabelText('settings.language_selection')).toBeInTheDocument();
    });
});
