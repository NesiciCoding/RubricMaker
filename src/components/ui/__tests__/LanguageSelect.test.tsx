import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n, { i18nReady } from '../../../i18n';
import LanguageSelect from '../LanguageSelect';
import type { AppSettings } from '../../../types';

const settingsState = vi.hoisted(() => ({
    settings: { language: 'en' } as Partial<AppSettings>,
    updateSettings: vi.fn(),
}));

vi.mock('../../../context/AppContext', () => ({
    useSettings: () => settingsState,
}));

describe('LanguageSelect', () => {
    beforeEach(async () => {
        settingsState.settings = { language: 'en' };
        settingsState.updateSettings.mockClear();
        await i18nReady;
        await i18n.changeLanguage('de-DE');
    });

    it('selects Automatic while none was chosen, not the stored default', () => {
        render(<LanguageSelect ariaLabel="Interface language" />);
        expect(screen.getByRole('combobox', { name: 'Interface language' })).toHaveValue('auto');
    });

    it('names what Automatic currently resolves to', () => {
        render(<LanguageSelect ariaLabel="Interface language" />);
        expect(screen.getByRole('option', { name: 'Automatic (Deutsch)' })).toBeInTheDocument();
    });

    it('shows the chosen language', () => {
        settingsState.settings = { language: 'es', languageChosen: true };
        render(<LanguageSelect ariaLabel="Interface language" />);
        expect(screen.getByRole('combobox')).toHaveValue('es');
    });

    it('records the pick as a choice so it applies everywhere', () => {
        render(<LanguageSelect ariaLabel="Interface language" />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nl' } });
        expect(settingsState.updateSettings).toHaveBeenCalledWith({ language: 'nl', languageChosen: true });
    });

    it('offers every interface language by its own name, Automatic first', () => {
        render(<LanguageSelect ariaLabel="Interface language" />);
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
            'Automatic (Deutsch)',
            'English',
            'Nederlands',
            'Français',
            'Deutsch',
            'Español',
        ]);
    });

    it('resets to Automatic, clears the cached detector choice, and re-detects the browser language', async () => {
        settingsState.settings = { language: 'es', languageChosen: true };
        localStorage.setItem('i18nextLng', 'es');
        render(<LanguageSelect ariaLabel="Interface language" />);

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'auto' } });

        expect(settingsState.updateSettings).toHaveBeenCalledWith({ languageChosen: false });
        // Re-detecting with the stale 'es' cache cleared falls through to jsdom's default
        // navigator.language ('en-US'), which the detector then re-caches — proving it re-read
        // the browser rather than the stale choice.
        expect(localStorage.getItem('i18nextLng')).toBe('en-US');
        await vi.waitFor(() => expect(i18n.language).toBe('en-US'));
    });
});
