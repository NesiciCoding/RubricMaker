import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings } from '../../types';
import DocsPage from '../DocsPage';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        settings: mockSettings,
        updateSettings: vi.fn(),
        classes: [],
        students: [],
        studentRubrics: [],
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

describe('DocsPage', () => {
    it('renders the getting-started tab by default', () => {
        renderWithRouter(<DocsPage />);
        expect(screen.getAllByText('navigation.docs').length).toBeGreaterThan(0);
        expect(screen.getAllByText('docs.tab_getting_started').length).toBeGreaterThan(0);
    });

    it.each([
        'docs.tab_route_map',
        'docs.tab_rubrics',
        'docs.tab_grading',
        'docs.tab_cefr',
        'docs.tab_essays',
        'docs.tab_analytics',
        'docs.tab_data',
    ])('switches to the %s tab without crashing', (tabKey) => {
        renderWithRouter(<DocsPage />);
        // Count before clicking — nav button renders the label regardless of activeTab.
        // After clicking, the breadcrumb also shows the label, so count increases.
        const before = screen.getAllByText(tabKey).length;
        fireEvent.click(screen.getByText(tabKey));
        expect(screen.getAllByText(tabKey).length).toBeGreaterThan(before);
    });
});
