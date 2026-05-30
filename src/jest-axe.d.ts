// Ambient module declaration for jest-axe v10 (ships without bundled types).
// Import-free by design — a file with top-level imports becomes a module
// augmentation, not an ambient declaration.
declare module 'jest-axe' {
    interface AxeViolation {
        id: string;
        description: string;
        nodes: unknown[];
    }
    interface AxeResults {
        violations: AxeViolation[];
    }
    interface AxeOptions {
        rules?: Record<string, { enabled: boolean }>;
        runOnly?: unknown;
    }
    export function axe(html: Element | string, options?: AxeOptions): Promise<AxeResults>;
    export const toHaveNoViolations: Record<string, unknown>;
}
