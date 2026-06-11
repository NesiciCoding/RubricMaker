import type { UiFontFamily } from '../types';

export interface ThemeBundle {
    id: string;
    accentColor: string;
    uiFontFamily: UiFontFamily;
    exportFontFamily: string;
    exportHeaderColor: string;
}

export const THEME_BUNDLES: ThemeBundle[] = [
    {
        id: 'academy',
        accentColor: '#1d4ed8',
        uiFontFamily: 'Inter',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#1d4ed8',
    },
    {
        id: 'nature',
        accentColor: '#16a34a',
        uiFontFamily: 'Nunito',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#166534',
    },
    {
        id: 'midnight',
        accentColor: '#6366f1',
        uiFontFamily: 'Source Sans 3',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#4338ca',
    },
    {
        id: 'warm',
        accentColor: '#ea580c',
        uiFontFamily: 'Lato',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#9a3412',
    },
    {
        id: 'slate',
        accentColor: '#0d9488',
        uiFontFamily: 'Roboto',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#0f766e',
    },
    {
        id: 'rose',
        accentColor: '#e11d48',
        uiFontFamily: 'Inter',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#9f1239',
    },
];

export const ACCENT_PRESETS = [
    { id: 'ocean', color: '#3b82f6' },
    { id: 'forest', color: '#16a34a' },
    { id: 'indigo', color: '#6366f1' },
    { id: 'sunset', color: '#ea580c' },
    { id: 'rose', color: '#e11d48' },
    { id: 'slate', color: '#64748b' },
    { id: 'teal', color: '#0d9488' },
    { id: 'gold', color: '#d97706' },
];
