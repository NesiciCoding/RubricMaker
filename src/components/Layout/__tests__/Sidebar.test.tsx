import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [{ id: 'r1' }, { id: 'r2' }],
        students: [{ id: 's1' }],
        settings: { userRole: 'user' },
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

function renderSidebar(initialRoute = '/') {
    return render(
        <MemoryRouter initialEntries={[initialRoute]}>
            <Sidebar />
        </MemoryRouter>
    );
}

describe('Sidebar', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders the brand name when expanded', () => {
        renderSidebar();
        expect(screen.getByText('Rubric Maker')).toBeInTheDocument();
    });

    it('shows rubric count', () => {
        renderSidebar();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows student count', () => {
        renderSidebar();
        expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('shows nav items', () => {
        renderSidebar();
        expect(screen.getByText('navigation.dashboard')).toBeInTheDocument();
        expect(screen.getByText('navigation.rubrics')).toBeInTheDocument();
    });

    it('collapses when toggle button clicked', () => {
        renderSidebar();
        const toggleBtn = screen.getByTitle('Collapse sidebar');
        fireEvent.click(toggleBtn);
        expect(screen.queryByText('Rubric Maker')).toBeNull();
    });

    it('expands again after collapse', () => {
        renderSidebar();
        fireEvent.click(screen.getByTitle('Collapse sidebar'));
        fireEvent.click(screen.getByTitle('Expand sidebar'));
        expect(screen.getByText('Rubric Maker')).toBeInTheDocument();
    });

    it('restores collapsed state from localStorage', () => {
        localStorage.setItem('rm_sidebar_collapsed', 'true');
        renderSidebar();
        expect(screen.queryByText('Rubric Maker')).toBeNull();
    });

    it('renders settings nav link', () => {
        renderSidebar();
        expect(screen.getByText('common.settings')).toBeInTheDocument();
    });
});
