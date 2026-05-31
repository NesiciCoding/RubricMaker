import type { EssaySubmission } from '../types';

/** Encodes an essay submission into a URL-safe base64 string for sharing. */
export function encodeEssaySubmission(submission: EssaySubmission): string {
    try {
        return btoa(encodeURIComponent(JSON.stringify(submission)));
    } catch {
        return '';
    }
}

/** Decodes an essay submission code, returning null if malformed or missing required fields. */
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
