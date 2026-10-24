import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18nInstance from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Student } from './types';
import enLocale from './locales/en.json';

// App.tsx renders a dedicated "no student account linked" screen (#709) when a
// student-role/auto-linked user's email doesn't match any roster Student record, and a
// separate, Sidebar-free Routes block once it does. Both branches are exercised here without
// pulling in the real StudentPortalPage's heavy dependency graph.
const platform = vi.hoisted(() => ({
    isCheckingSession: false,
    showLanding: false,
    bootPhase: 'session' as const,
    signOutFromDatabase: vi.fn(),
}));

const settingsState = vi.hoisted(() => ({
    userRole: 'student' as string | undefined,
    userEmail: undefined as string | undefined,
    needsOnboarding: false,
    theme: 'light',
}));

const studentsState = vi.hoisted(() => ({ students: [] as Student[] }));

const mockUpdateSettings = vi.hoisted(() => vi.fn());
const mockLocalMode = vi.hoisted(() => ({ value: false }));

vi.mock('./context/AppContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./context/AppContext')>();
    return {
        ...actual,
        usePlatform: () => platform,
        useSettings: () => ({ settings: settingsState, updateSettings: mockUpdateSettings }),
        useStudents: () => studentsState,
    };
});

vi.mock('./store/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./store/storage')>();
    return { ...actual, isLocalMode: () => mockLocalMode.value };
});

vi.mock('./pages/StudentPortalPage', () => ({
    default: () => <div data-testid="student-portal-stub">portal</div>,
}));
vi.mock('./pages/StudentFlashcardStudyPage', () => ({
    default: () => <div data-testid="flashcard-study-stub">study</div>,
}));

import App from './App';

beforeAll(async () => {
    if (!i18nInstance.isInitialized) {
        i18nInstance.use(initReactI18next);
        await i18nInstance.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: { en: { translation: enLocale } },
            interpolation: { escapeValue: false },
        });
    }
});

beforeEach(() => {
    platform.isCheckingSession = false;
    platform.showLanding = false;
    platform.signOutFromDatabase.mockClear();
    settingsState.userRole = 'student';
    settingsState.userEmail = undefined;
    studentsState.students = [];
    mockUpdateSettings.mockClear();
    mockLocalMode.value = false;
});

describe('App — no student account linked screen (#709)', () => {
    it('renders a single <main> landmark with an <h1> heading', () => {
        const { container } = render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        const mains = container.querySelectorAll('main');
        expect(mains).toHaveLength(1);
        expect(within(mains[0] as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent(
            'No student account linked to this email.'
        );
    });

    it('shows the signed-in email and links it in the help text when known', () => {
        settingsState.userEmail = 'kid@example.com';
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        expect(screen.getByText('Signed in as kid@example.com')).toBeInTheDocument();
        expect(
            screen.getByText('Ask your teacher to link your account to kid@example.com so you can log in here.')
        ).toBeInTheDocument();
    });

    it('falls back to the generic help text when no email is known', () => {
        settingsState.userEmail = undefined;
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Ask your teacher to add your email address to your student profile so you can log in here.'
            )
        ).toBeInTheDocument();
    });

    it('offers "Sign out" when not in local mode, and switches role back to teacher in local mode', () => {
        const { rerender } = render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        screen.getByText('Sign out').click();
        expect(platform.signOutFromDatabase).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Switch back to teacher')).not.toBeInTheDocument();

        mockLocalMode.value = true;
        rerender(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
        screen.getByText('Switch back to teacher').click();
        expect(mockUpdateSettings).toHaveBeenCalledWith({ userRole: 'teacher' });
    });
});

describe('App — signed-in student portal routes (#709)', () => {
    it('wraps the portal in a single <main> landmark behind a skip link, with no Sidebar', async () => {
        studentsState.students = [{ id: 's1', name: 'Alice', classId: 'c1', email: 'kid@example.com' }];
        settingsState.userEmail = 'kid@example.com';
        const { container } = render(
            <MemoryRouter initialEntries={['/portal/s1']}>
                <App />
            </MemoryRouter>
        );
        await screen.findByTestId('student-portal-stub');

        const mains = container.querySelectorAll('main');
        expect(mains).toHaveLength(1);
        expect(mains[0]).toHaveAttribute('id', 'portal-main-content');
        expect(within(mains[0] as HTMLElement).getByTestId('student-portal-stub')).toBeInTheDocument();

        const skipLink = screen.getByText('Skip to main content');
        expect(skipLink.closest('a')).toHaveAttribute('href', '#portal-main-content');
        expect(container.querySelector('.sidebar')).toBeNull();
    });
});
