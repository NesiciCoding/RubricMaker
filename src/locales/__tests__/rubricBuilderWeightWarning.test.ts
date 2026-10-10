import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import en from '../en.json';
import nl from '../nl.json';
import fr from '../fr.json';
import de from '../de.json';
import es from '../es.json';

const locales = { en, nl, fr, de, es };

describe('rubricBuilder.weight_total_warning', () => {
    for (const [lang, translation] of Object.entries(locales)) {
        it(`${lang} interpolates the total weight`, async () => {
            const i18n = i18next.createInstance();
            await i18n.init({ lng: lang, resources: { [lang]: { translation } } });
            const text = i18n.t('rubricBuilder.weight_total_warning', { total: 75 });
            expect(text).toContain('75%');
            expect(text).not.toContain('{{total}}');
        });
    }
});
