import type { EssaySubmission } from '../types';
import { encodeUrlSafeBase64, decodeUrlSafeBase64 } from './urlSafeBase64';

export function encodeEssaySubmission(submission: EssaySubmission): string {
    try {
        return encodeUrlSafeBase64(JSON.stringify(submission));
    } catch {
        return '';
    }
}

export function decodeEssaySubmission(code: string): EssaySubmission | null {
    try {
        const json = decodeUrlSafeBase64(code);
        const data = JSON.parse(json) as EssaySubmission;
        if (!data.assignmentRubricId || !data.assignmentStudentId || !data.contentHtml) return null;
        return data;
    } catch {
        return null;
    }
}
