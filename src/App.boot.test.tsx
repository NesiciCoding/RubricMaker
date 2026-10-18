import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import i18nInstance from 'i18next';
import { initReactI18next } from 'react-i18next';
import enLocale from './locales/en.json';

// Mutable so one render can be pinned to the session check and the next to the data pull —
// a test that only ever renders the hydrate phase cannot catch a shell stuck on that text.
const boot = vi.hoisted(() => ({ phase: 'session' as 'session' | 'hydrate' }));

// Keep the rest of the context intact and only pin the platform/settings/students slices
// the boot branch reads, so App renders deterministically in its checking state.
vi.mock('./context/AppContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./context/AppContext')>();
    return {
        ...actual,
        usePlatform: () => ({
            isCheckingSession: true,
            showLanding: false,
            bootPhase: boot.phase,
            signOutFromDatabase: vi.fn(),
        }),
        useSettings: () => ({ settings: { needsOnboarding: false }, updateSettings: vi.fn() }),
        useStudents: () => ({ students: [] }),
    };
});

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

describe('App boot shell (#742)', () => {
    it('renders the app-shell skeleton and names the session check while the session is checked', () => {
        boot.phase = 'session';
        const { container } = render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        expect(container.querySelector('.app-layout')).toBeTruthy();
        expect(container.querySelector('.sidebar')).toBeTruthy();
        expect(container.querySelector('[data-boot-shell="true"]')).toBeTruthy();
        expect(screen.getByText('Checking your session…')).toBeInTheDocument();
        expect(screen.queryByText('Loading your rubrics and classes…')).toBeNull();
    });

    it('names the data pull once the session check is done', () => {
        boot.phase = 'hydrate';
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );
        expect(screen.getByText('Loading your rubrics and classes…')).toBeInTheDocument();
        expect(screen.queryByText('Checking your session…')).toBeNull();
    });
});
