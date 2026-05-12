import type { EssayAssignment } from '../types';

export function encodeEssayAssignment(assignment: EssayAssignment): string {
    try {
        return btoa(encodeURIComponent(JSON.stringify(assignment)));
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
