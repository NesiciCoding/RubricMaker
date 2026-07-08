import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Rubric, Student, Class } from '../../types';

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

const mockAppValue = {
    rubrics: mockRubricsArr,
    tests: emptyArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    essayAssignments: emptyArr,
    flashcardDecks: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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
});
