// Ambient module declaration for jest-axe v10 (ships without bundled types).
// Uses `any` for axe-core types to keep this file import-free (required for
// ambient declarations — a file with top-level imports becomes a module
// augmentation, not an ambient declaration).
declare module 'jest-axe' {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function axe(html: Element | string, options?: any): Promise<any>;
    export const toHaveNoViolations: Record<string, unknown>;
}
