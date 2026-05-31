import type { EssayAssignment } from '../types';

/** Encodes an essay assignment into a URL-safe base64 string, stripping the ownerUserId before encoding. */
export function encodeEssayAssignment(assignment: EssayAssignment): string {
    try {
        // ownerUserId is never needed client-side and must not be exposed in URLs
        const { ownerUserId: _stripped, ...safe } = assignment as EssayAssignment & { ownerUserId?: string };
        return btoa(encodeURIComponent(JSON.stringify(safe)));
    } catch {
        return '';
    }
}

/** Decodes a share code back into an EssayAssignment, returning null if the code is malformed or missing required fields. */
export function decodeEssayAssignment(code: string): EssayAssignment | null {
    try {
        const json = decodeURIComponent(atob(code.trim()));
        const data = JSON.parse(json) as EssayAssignment;
        if (!data.rubricId || !data.studentId || !data.title) return null;
        return data;
    } catch {
        return null;
    }
}
