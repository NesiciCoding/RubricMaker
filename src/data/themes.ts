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
        exportHeaderColor: '#1b49cb',
    },
    {
        id: 'nature',
        accentColor: '#12883e',
        uiFontFamily: 'Nunito',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#166534',
    },
    {
        id: 'midnight',
        accentColor: '#6063ea',
        uiFontFamily: 'Source Sans 3',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#4338ca',
    },
    {
        id: 'warm',
        accentColor: '#c94c0a',
        uiFontFamily: 'Lato',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#9a3412',
    },
    {
        id: 'slate',
        accentColor: '#0c8378',
        uiFontFamily: 'Roboto',
        exportFontFamily: 'Calibri',
        exportHeaderColor: '#0c625c',
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
    { id: 'ocean', color: '#3473da' },
    { id: 'forest', color: '#12883e' },
    { id: 'indigo', color: '#6063ea' },
    { id: 'sunset', color: '#c94c0a' },
    { id: 'rose', color: '#e11d48' },
    { id: 'slate', color: '#64748b' },
    { id: 'teal', color: '#0c8378' },
    { id: 'gold', color: '#af6005' },
];
