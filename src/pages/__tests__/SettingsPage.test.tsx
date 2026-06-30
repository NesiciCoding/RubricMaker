import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale } from '../../types';

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
    const router = createMemoryRouter([{ path: '/settings', element: <SettingsPageComp /> }], {
        initialEntries: ['/settings'],
    });
    return render(<RouterProvider router={router} />);
}

describe('SettingsPage', () => {
    beforeEach(async () => {
        mockUpdateSettings.mockClear();
        mockAddGradeScale.mockClear();
        mockShowToast.mockClear();
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
        expect(mockAddGradeScale).toHaveBeenCalled();
    });

    it('opens and closes the comment bank modal from the Teaching tab', () => {
        renderPage();
        fireEvent.click(screen.getByText('Teaching'));
        fireEvent.click(screen.getByText('settings.action_manage_comments'));
        expect(screen.getByTestId('comment-bank-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Modal'));
        expect(screen.queryByTestId('comment-bank-modal')).not.toBeInTheDocument();
    });

    it('switches to the Administration tab (admin role)', () => {
        renderPage();
        fireEvent.click(screen.getByText('Administration'));
        // Smoke check: the tab switch itself exercises the admin-only render branch.
        expect(screen.getByRole('button', { name: 'Administration' })).toHaveAttribute('aria-selected', 'true');
    });
});
