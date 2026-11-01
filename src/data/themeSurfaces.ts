/**
 * The surfaces a text colour can land on, mirrored from the theme blocks in `src/index.css`.
 *
 * `contrastPalette.test.ts` parses the stylesheet and fails if these drift, so this is only a
 * runtime copy of the tokens — never a second source of truth (#533).
 */
export type ThemeName = 'light' | 'dark';
export type Surface = 'bg' | 'bg-card' | 'bg-elevated' | 'bg-raised';

export const THEME_SURFACES: Record<ThemeName, Record<Surface, string>> = {
    dark: {
        bg: '#161410',
        'bg-card': '#201d17',
        'bg-elevated': '#2a261f',
        'bg-raised': '#201d17',
    },
    light: {
        bg: '#f1ebe0',
        'bg-card': '#ffffff',
        'bg-elevated': '#f6f1e8',
        'bg-raised': '#ffffff',
    },
};

export function themeSurfaces(theme: ThemeName): string[] {
    return Object.values(THEME_SURFACES[theme]);
}
