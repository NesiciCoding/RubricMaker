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

    it('shows the language on screen while none was chosen, not the stored default', () => {
        render(<LanguageSelect ariaLabel="Interface language" />);
        expect(screen.getByRole('combobox', { name: 'Interface language' })).toHaveValue('de');
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

    it('offers every interface language by its own name', () => {
        render(<LanguageSelect ariaLabel="Interface language" />);
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
            'English',
            'Nederlands',
            'Français',
            'Deutsch',
            'Español',
        ]);
    });
});
