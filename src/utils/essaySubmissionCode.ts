import type { EssaySubmission } from '../types';

export function encodeEssaySubmission(submission: EssaySubmission): string {
    try {
        return btoa(encodeURIComponent(JSON.stringify(submission)));
    } catch {
        return '';
    }
}

export function decodeEssaySubmission(code: string): EssaySubmission | null {
    try {
        const json = decodeURIComponent(atob(code.trim()));
        const data = JSON.parse(json) as EssaySubmission;
        if (!data.assignmentRubricId || !data.assignmentStudentId || !data.contentHtml) return null;
        return data;
    } catch {
        return null;
    }
}
