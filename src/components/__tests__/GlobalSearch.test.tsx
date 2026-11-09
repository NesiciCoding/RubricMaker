import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Rubric, Student, Class, Test } from '../../types';
import type { StoreData } from '../../store/storage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockClass: Class = { id: 'c1', name: 'Class A' };

const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const emptyArr: never[] = [];

const mockTestsArr: Test[] = [];

const mockAppValue: Partial<StoreData> = {
    rubrics: mockRubricsArr,
    tests: mockTestsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    essayAssignments: emptyArr,
    flashcardDecks: emptyArr,
    newsFlashes: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
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
    // GlobalSearch only reads data; it never calls useStoreActions.
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockAppValue as StoreData),
}));

import GlobalSearch from '../Search/GlobalSearch';

function renderSearch(onClose = vi.fn()) {
    return render(
        <MemoryRouter>
            <GlobalSearch onClose={onClose} />
        </MemoryRouter>
    );
}

describe('GlobalSearch', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        mockTestsArr.length = 0;
    });

    it('renders the search input and hint when query is empty', () => {
        renderSearch();
        expect(screen.getByLabelText('search.placeholder')).toBeInTheDocument();
        expect(screen.getByText('search.hint')).toBeInTheDocument();
    });

    it('shows no-results message when query has no matches', () => {
        renderSearch();
        fireEvent.change(screen.getByLabelText('search.placeholder'), { target: { value: 'xyzzynonexistent' } });
        expect(screen.getByText('search.no_results')).toBeInTheDocument();
    });

    it('shows results when query matches a rubric', () => {
        renderSearch();
        fireEvent.change(screen.getByLabelText('search.placeholder'), { target: { value: 'Essay' } });
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.getByText('search.type_rubric')).toBeInTheDocument();
    });

    it('shows results when query matches a student', () => {
        renderSearch();
        fireEvent.change(screen.getByLabelText('search.placeholder'), { target: { value: 'Alice' } });
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('search.type_student')).toBeInTheDocument();
    });

    it('navigates and calls onClose when a result is clicked', () => {
        const onClose = vi.fn();
        renderSearch(onClose);
        fireEvent.change(screen.getByLabelText('search.placeholder'), { target: { value: 'Essay' } });
        fireEvent.click(screen.getByText('Essay Rubric'));
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('r1'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows a practice badge on practice-mode test results', () => {
        mockTestsArr.push({
            id: 't1',
            name: 'Practice Grammar Drill',
            description: 'daily drill',
            questions: [],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00Z',
            mode: 'practice',
        });
        renderSearch();
        fireEvent.change(screen.getByLabelText('search.placeholder'), { target: { value: 'Practice Grammar' } });
        expect(screen.getByText('Practice Grammar Drill')).toBeInTheDocument();
        expect(screen.getByText('search.practice_badge')).toBeInTheDocument();
        expect(screen.queryByText('search.placement_badge')).not.toBeInTheDocument();
    });

    it('shows a placement badge on placement-mode test results', () => {
        mockTestsArr.push({
            id: 't2',
            name: 'Placement Entry Test',
            description: 'initial level',
            questions: [],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: '2024-01-01T00:00:00Z',
            mode: 'placement',
        });
        renderSearch();
        fireEvent.change(screen.getByLabelText('search.placeholder'), { target: { value: 'Placement Entry' } });
        expect(screen.getByText('Placement Entry Test')).toBeInTheDocument();
        expect(screen.getByText('search.placement_badge')).toBeInTheDocument();
        expect(screen.queryByText('search.practice_badge')).not.toBeInTheDocument();
    });
});

describe('GlobalSearch command palette (#890)', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        localStorage.clear();
    });

    function typeQuery(value: string) {
        const input = screen.getByLabelText('search.placeholder');
        fireEvent.change(input, { target: { value } });
        return input;
    }

    it('groups results by entity type with listbox/option semantics', () => {
        renderSearch();
        typeQuery('a');
        expect(screen.getByRole('listbox', { name: 'search.results_list_label' })).toBeInTheDocument();
        // Rubric and student matches land in their own labelled groups.
        expect(screen.getByRole('group', { name: 'search.type_rubric' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'search.type_student' })).toBeInTheDocument();
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('moves the active option with ArrowDown and selects with Enter', () => {
        const onClose = vi.fn();
        renderSearch(onClose);
        const input = typeQuery('a');
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThan(1);
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(input).toHaveAttribute('aria-activedescendant', 'gs-opt-1');
        expect(options[1]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('selects the first result with Enter without moving', () => {
        const onClose = vi.fn();
        renderSearch(onClose);
        const input = typeQuery('Essay');
        expect(input).toHaveAttribute('aria-activedescendant', 'gs-opt-0');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('r1'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows recently opened results on an empty query', () => {
        const onClose = vi.fn();
        const { unmount } = renderSearch(onClose);
        typeQuery('Essay');
        fireEvent.click(screen.getByText('Essay Rubric'));
        expect(onClose).toHaveBeenCalledTimes(1);
        unmount();

        renderSearch();
        expect(screen.getByText('search.recent_title')).toBeInTheDocument();
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.queryByText('search.hint')).not.toBeInTheDocument();
    });

    it('drops recents whose items no longer exist', () => {
        localStorage.setItem(
            'rm.recent-search-v1',
            JSON.stringify([{ type: 'rubric', id: 'deleted', label: 'Ghost Rubric', route: '/rubrics/deleted' }])
        );
        renderSearch();
        expect(screen.queryByText('search.recent_title')).not.toBeInTheDocument();
        expect(screen.getByText('search.hint')).toBeInTheDocument();
    });
});
