import type { TestSubmissionPayload } from '../types';

export function encodeTestSubmission(submission: TestSubmissionPayload): string {
    try {
        return btoa(encodeURIComponent(JSON.stringify(submission)));
    } catch {
        return '';
    }
}

export function decodeTestSubmission(code: string): TestSubmissionPayload | null {
    try {
        const json = decodeURIComponent(atob(code.trim()));
        const data = JSON.parse(json) as TestSubmissionPayload;
        if (
            !data.testId ||
            !data.studentId ||
            !data.teacherKey ||
            !data.startedAt ||
            !data.submittedAt ||
            !Array.isArray(data.answers)
        ) {
            return null;
        }
        if (!data.answers.every((a) => a && typeof a.questionId === 'string')) return null;
        return data;
    } catch {
        return null;
    }
}
