import type { EssayAssignment } from '../types';

export function encodeEssayAssignment(assignment: EssayAssignment): string {
    try {
        // ownerUserId is never needed client-side and must not be exposed in URLs
        const { ownerUserId: _stripped, ...safe } = assignment as EssayAssignment & { ownerUserId?: string };
        return btoa(encodeURIComponent(JSON.stringify(safe)));
    } catch {
        return '';
    }
}

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
