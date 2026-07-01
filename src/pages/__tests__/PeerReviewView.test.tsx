import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student } from '../../types';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSavePeerReview = vi.fn();
const mockNavigate = vi.fn();

// Stable refs.
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const emptyArr: never[] = [];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: emptyArr,
    peerReviews: emptyArr,
    settings: mockSettings,
    savePeerReview: mockSavePeerReview,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../components/Editor/TiptapEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) =>
        React.createElement('textarea', {
            'data-testid': 'tiptap-mock',
            value: content,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
        }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let PeerReviewViewComp: React.ComponentType;

function renderAt(rubricId: string, studentId: string) {
    const router = createMemoryRouter(
        [{ path: '/peer-review/:rubricId/:studentId', element: <PeerReviewViewComp /> }],
        { initialEntries: [`/peer-review/${rubricId}/${studentId}`] }
    );
    return render(<RouterProvider router={router} />);
}

describe('PeerReviewView', () => {
    beforeEach(async () => {
        mockSavePeerReview.mockClear();
        mockNavigate.mockClear();
        const mod = await import('../PeerReviewView');
        PeerReviewViewComp = mod.default;
    });

    it('shows not-found when rubric or student is missing', () => {
        renderAt('bad-rubric', 's1');
        expect(screen.getByText('gradeStudent.error_not_found')).toBeInTheDocument();
    });

    it('renders the peer review form with criteria', () => {
        renderAt('r1', 's1');
        expect(screen.getByText('Criterion 1')).toBeInTheDocument();
        expect(screen.getByText('Excellent')).toBeInTheDocument();
        expect(screen.getByText('Good')).toBeInTheDocument();
    });

    it('selects a level and saves the peer review', () => {
        renderAt('r1', 's1');
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getByText('gradeStudent.action_save'));
        expect(mockSavePeerReview).toHaveBeenCalledWith(
            expect.objectContaining({ isPeerReview: true, rubricId: 'r1', studentId: 's1' })
        );
    });

    it('renders overall comment editor', () => {
        renderAt('r1', 's1');
        // TiptapEditor mock renders a textarea.
        const editors = screen.getAllByTestId('tiptap-mock');
        expect(editors.length).toBeGreaterThan(0);
    });
});
