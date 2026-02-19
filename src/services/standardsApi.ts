// ─── Common Standards Project API Service ─────────────────────────────────────
// Docs: https://commonstandardsproject.com/developers
// Base: https://api.commonstandardsproject.com/api/v1/
// Auth: Api-Key header — user must register at commonstandardsproject.com
// CORS: user must add their origin to the allowlist on the CSP developer page

const BASE = 'https://api.commonstandardsproject.com/api/v1';

function headers(apiKey: string): HeadersInit {
    return { 'Api-Key': apiKey, 'Content-Type': 'application/json' };
}

// ─── Types from the CSP API ───────────────────────────────────────────────────

export interface CspJurisdiction {
    id: string;
    title: string;
    type: string; // "state" | "organization" | "district" | etc.
}

export interface CspStandardSet {
    id: string;
    title: string;
    subject: string;
    educationLevels: string[];
    document?: {
        title: string;
        valid_until?: string;
    };
}

export interface CspStandard {
    id: string;
    statementNotation?: string;
    description: string;
    depth: number;
    ancestorIds: string[];
    children?: CspStandard[];
}

export interface CspStandardSetDetail {
    id: string;
    title: string;
    subject: string;
    standards: Record<string, CspStandard>;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchJurisdictions(apiKey: string): Promise<CspJurisdiction[]> {
    const res = await fetch(`${BASE}/jurisdictions`, { headers: headers(apiKey) });
    if (!res.ok) throw new Error(`CSP API error ${res.status}: ${res.statusText}`);
    const json = await res.json();
    return json.data ?? [];
}

export async function fetchStandardSets(
    apiKey: string,
    jurisdictionId: string,
): Promise<CspStandardSet[]> {
    const res = await fetch(
        `${BASE}/jurisdictions/${encodeURIComponent(jurisdictionId)}`,
        { headers: headers(apiKey) },
    );
    if (!res.ok) throw new Error(`CSP API error ${res.status}: ${res.statusText}`);
    const json = await res.json();
    return json.data.standardSets ?? [];
}

export async function fetchStandardSetDetail(
    apiKey: string,
    standardSetId: string,
): Promise<CspStandardSetDetail> {
    const res = await fetch(
        `${BASE}/standard_sets/${encodeURIComponent(standardSetId)}`,
        { headers: headers(apiKey) },
    );
    if (!res.ok) throw new Error(`CSP API error ${res.status}: ${res.statusText}`);
    const json = await res.json();
    return json.data;
}

/** Flatten a standards map into a list in depth-first (hierarchical) order for display */
export function flattenStandards(standardsMap: Record<string, CspStandard>): CspStandard[] {
    const standards = Object.values(standardsMap);
    const childrenMap: Record<string, CspStandard[]> = {};
    const roots: CspStandard[] = [];

    // Sort helper: naturally sort by notation or description
    const sortFn = (a: CspStandard, b: CspStandard) => {
        const valA = a.statementNotation || a.description;
        const valB = b.statementNotation || b.description;
        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    };

    // 1. Build hierarchy based on availability in the current set
    standards.forEach(std => {
        const parentId = std.ancestorIds.length > 0 ? std.ancestorIds[std.ancestorIds.length - 1] : null;
        // If parent exists in this set, attach to it. Otherwise treat as root.
        if (parentId && standardsMap[parentId]) {
            if (!childrenMap[parentId]) childrenMap[parentId] = [];
            childrenMap[parentId].push(std);
        } else {
            roots.push(std);
        }
    });

    // 2. Sort roots and children lists
    roots.sort(sortFn);
    Object.values(childrenMap).forEach(list => list.sort(sortFn));

    // 3. DFS Traversal to Flatten
    const result: CspStandard[] = [];
    const traverse = (nodes: CspStandard[]) => {
        nodes.forEach(node => {
            result.push(node);
            if (childrenMap[node.id]) {
                traverse(childrenMap[node.id]);
            }
        });
    };

    traverse(roots);
    return result;
}
