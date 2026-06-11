import type { UiFontFamily } from '../types';

/** A full theme bundle: applied atomically via a single updateSettings call. */
export interface ThemeBundle {
    id: string;
    /** i18n key under "themes" for the display name */
    labelKey: string;
    accent: string;
    font: UiFontFamily;
    headerColor: string;
    /** CSS font stack used for rubric.format.fontFamily */
    exportFont: string;
}

export const THEME_BUNDLES: ThemeBundle[] = [
    {
        id: 'academy',
        labelKey: 'themes.academy',
        accent: '#3b82f6',
        font: 'Inter',
        headerColor: '#1e3a5f',
        exportFont: 'Inter, system-ui, sans-serif',
    },
    {
        id: 'nature',
        labelKey: 'themes.nature',
        accent: '#16a34a',
        font: 'Nunito',
        headerColor: '#14532d',
        exportFont: "Georgia, serif",
    },
    {
        id: 'midnight',
        labelKey: 'themes.midnight',
        accent: '#6366f1',
        font: 'Source Sans 3',
        headerColor: '#1e1b4b',
        exportFont: 'Inter, system-ui, sans-serif',
    },
    {
        id: 'warm',
        labelKey: 'themes.warm',
        accent: '#ea580c',
        font: 'Lato',
        headerColor: '#7c2d12',
        exportFont: "Georgia, serif",
    },
    {
        id: 'slate',
        labelKey: 'themes.slate',
        accent: '#64748b',
        font: 'Roboto',
        headerColor: '#334155',
        exportFont: '"Courier New", Courier, monospace',
    },
];
