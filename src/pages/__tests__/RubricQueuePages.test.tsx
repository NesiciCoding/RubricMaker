import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student, StudentRubric } from '../../types';

const settings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'light',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const rubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [{ id: 'c1', title: 'Content', description: '', weight: 100, levels: [] }],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const classA: Class = { id: 'c1', name: 'Class 4A', rubricIds: ['r1'] };
const alice: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const bob: Student = { id: 's2', name: 'Bob', classId: 'c1' };
const cara: Student = { id: 's3', name: 'Cara', classId: 'c1' };

const gradedSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', comment: '', checkedSubItems: [] }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-02-01T00:00:00Z',
};

const notHandedInSr: StudentRubric = {
    id: 'sr3',
    rubricId: 'r1',
    studentId: 's3',
    entries: [{ criterionId: 'c1', levelId: null, comment: '', checkedSubItems: [] }],
    overallComment: '',
    isPeerReview: false,
    notHandedIn: true,
};

const mockAppValue = {
    rubrics: [rubric],
    students: [alice, bob, cara],
    classes: [classA],
    studentRubrics: [gradedSr, notHandedInSr],
    peerReviews: [
        {
            id: 'pr1',
            rubricId: 'r1',
            studentId: 's1',
            entries: [],
            overallComment: '',
            isPeerReview: true,
            gradedBy: 's3',
            round: 2,
        },
    ],
    settings,
    createGroupStudentRubrics: vi.fn(),
    updateStudentGroup: vi.fn(),
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => ({ ...mockAppValue, essayAssignments: [], essaySubmissions: [] }),
    useSettings: () => mockAppValue,
}));

vi.mock('../../hooks/useSharedMaterials', () => ({
    useSharedMaterials: () => ({ status: 'ready', connected: false, items: [], folders: [], refresh: vi.fn() }),
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

function renderAt(path: string, element: React.ReactElement, pattern: string) {
    const router = createMemoryRouter([{ path: pattern, element }], { initialEntries: [path] });
    return render(<RouterProvider router={router} />);
}

let QueuePage: React.ComponentType;
let RosterPage: React.ComponentType;

describe('rubric grading queue and peer-review roster', () => {
    beforeEach(async () => {
        QueuePage = (await import('../RubricGradingQueuePage')).default;
        RosterPage = (await import('../PeerReviewRosterPage')).default;
        mockAppValue.rubrics = [rubric];
        mockAppValue.students = [alice, bob, cara];
        mockAppValue.studentRubrics = [gradedSr, notHandedInSr];
        mockAppValue.updateStudentGroup.mockClear();
    });

    it('lists the rubric roster with graded, ungraded and not-handed-in status plus deep links', () => {
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('rubricQueue.graded')).toBeInTheDocument();
        expect(screen.getByText('rubricQueue.not_graded')).toBeInTheDocument();
        expect(screen.getByText('rubricQueue.not_handed_in')).toBeInTheDocument();
        expect(screen.getAllByText('Class 4A')).toHaveLength(3);

        const open = screen.getByRole('link', { name: 'rubricQueue.action_open' });
        expect(open).toHaveAttribute('href', '/rubrics/r1/grade/s1');
        const grade = screen.getAllByRole('link', { name: 'rubricQueue.action_grade' })[0];
        expect(grade).toHaveAttribute('href', '/rubrics/r1/grade/s2');
    });

    it('filters the queue by name', () => {
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');
        fireEvent.change(screen.getByLabelText('rubricQueue.search'), { target: { value: 'bob' } });
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    });

    it('matches names across accents and word order, and searches the class and group labels', () => {
        mockAppValue.students = [
            { id: 's4', name: 'José Alvarez', classId: 'c1' },
            { id: 's5', name: 'Amara Okafor', classId: 'c1' },
        ];
        mockAppValue.studentRubrics = [{ ...gradedSr, studentId: 's4', groupId: 'g1', groupName: 'Group 3' }];
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');
        const search = screen.getByLabelText('rubricQueue.search');
        // The groups panel above the table names its members too, so assertions stay inside the table.
        const inTable = (name: string) => within(screen.getByRole('table')).queryByText(name);

        fireEvent.change(search, { target: { value: 'jose' } });
        expect(inTable('José Alvarez')).toBeInTheDocument();
        expect(inTable('Amara Okafor')).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: 'okafor amara' } });
        expect(inTable('Amara Okafor')).toBeInTheDocument();
        expect(inTable('José Alvarez')).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: 'class 4a' } });
        expect(inTable('Amara Okafor')).toBeInTheDocument();
        expect(inTable('José Alvarez')).toBeInTheDocument();

        fireEvent.change(search, { target: { value: 'group 3' } });
        expect(inTable('José Alvarez')).toBeInTheDocument();
        expect(inTable('Amara Okafor')).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: '   ' } });
        expect(inTable('Amara Okafor')).toBeInTheDocument();
        expect(inTable('José Alvarez')).toBeInTheDocument();
    });

    it('says so when a search matches no one, and keeps the progress count on the full roster', () => {
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');
        fireEvent.change(screen.getByLabelText('rubricQueue.search'), { target: { value: 'zzz' } });

        expect(screen.getByText('gradingQueue.no_matches')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toContainElement(screen.queryByText('Alice'));
        expect(screen.getByText(/rubricQueue.progress/)).toHaveTextContent('"graded":1,"total":3');
    });

    it('lists named groups and edits their name and members from the queue', () => {
        mockAppValue.studentRubrics = [
            { ...gradedSr, groupId: 'g1', groupName: 'Group 3' },
            { ...notHandedInSr, groupId: 'g1', groupName: 'Group 3' },
        ];
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');

        expect(screen.getByText('rubricQueue.groups_title')).toBeInTheDocument();
        expect(screen.getAllByText('Group 3').length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'rubricQueue.group_edit' }));
        const dialog = screen.getByRole('dialog');
        const nameInput = within(dialog).getByLabelText('rubricList.group_grade_name_label');
        expect(nameInput).toHaveValue('Group 3');

        fireEvent.change(nameInput, { target: { value: 'Renamed' } });
        fireEvent.click(within(dialog).getByText('rubricList.group_grade_update_btn:{"count":2}'));
        expect(mockAppValue.updateStudentGroup).toHaveBeenCalledWith(
            'g1',
            expect.arrayContaining(['s1', 's3']),
            'Renamed'
        );
    });

    it('filters the queue to one group, showing how much of it is graded, and back to everyone', () => {
        mockAppValue.studentRubrics = [
            { ...gradedSr, studentId: 's1', groupId: 'g1', groupName: 'Group 3' },
            { ...gradedSr, studentId: 's3', groupId: 'g1', groupName: 'Group 3' },
            { ...notHandedInSr, studentId: 's2', groupId: 'g2', groupName: 'Group 4' },
        ];
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');
        const inTable = (name: string) => within(screen.getByRole('table')).queryByText(name);

        const chip = screen.getByRole('button', { name: /Group 3 · 2\/2/ });
        expect(chip).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(chip);
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        expect(inTable('Alice')).toBeInTheDocument();
        expect(inTable('Cara')).toBeInTheDocument();
        expect(inTable('Bob')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'common.all' }));
        expect(inTable('Bob')).toBeInTheDocument();
    });

    it('narrows a group filter further with the search box', () => {
        mockAppValue.studentRubrics = [
            { ...gradedSr, studentId: 's1', groupId: 'g1', groupName: 'Group 3' },
            { ...gradedSr, studentId: 's3', groupId: 'g1', groupName: 'Group 3' },
        ];
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');

        fireEvent.click(screen.getByRole('button', { name: /Group 3/ }));
        fireEvent.change(screen.getByLabelText('rubricQueue.search'), { target: { value: 'bob' } });

        expect(screen.getByText('gradingQueue.no_matches')).toBeInTheDocument();
    });

    it('shows a group badge on grouped students', () => {
        mockAppValue.studentRubrics = [{ ...gradedSr, groupId: 'g1', groupName: 'Group 3' }, notHandedInSr];
        renderAt('/rubrics/r1/grade', <QueuePage />, '/rubrics/:rubricId/grade');
        expect(screen.getAllByText('Group 3').length).toBeGreaterThan(0);
        // A named group shows its name instead of the generic badge.
        expect(screen.queryAllByText('rubricQueue.in_group')).toHaveLength(0);
    });

    it('shows a not-found state for a rubric that no longer exists', () => {
        mockAppValue.rubrics = [];
        renderAt('/rubrics/gone/grade', <QueuePage />, '/rubrics/:rubricId/grade');
        expect(screen.getAllByText('rubricQueue.not_found_title').length).toBeGreaterThan(0);
    });

    it('shows who reviewed whom per round, with links to each view', () => {
        renderAt('/rubrics/r1/peer-review', <RosterPage />, '/rubrics/:rubricId/peer-review');

        expect(screen.getByRole('link', { name: 'Cara' })).toHaveAttribute(
            'href',
            '/rubrics/r1/peer-review/s1?reviewerId=s3'
        );
        expect(screen.getByText('peerReview.round_n:{"n":2}')).toBeInTheDocument();
        expect(screen.getAllByText('peerReviewRoster.no_reviews').length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: 'peerReviewRoster.action_open' })[0]).toHaveAttribute(
            'href',
            '/rubrics/r1/peer-review/s1'
        );
    });

    it('shows a not-found state on the peer-review roster too', () => {
        mockAppValue.rubrics = [];
        renderAt('/rubrics/gone/peer-review', <RosterPage />, '/rubrics/:rubricId/peer-review');
        expect(screen.getAllByText('peerReviewRoster.not_found_title').length).toBeGreaterThan(0);
    });
});
