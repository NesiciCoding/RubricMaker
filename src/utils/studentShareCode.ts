import type { StudentRubric, Rubric, Student, GradeScale } from '../types';

export interface SharedFeedback {
    sr: StudentRubric;
    rubric: Rubric;
    student: Student;
    scale: GradeScale | null;
}

/** Encodes a student feedback payload (rubric + grades + student) into a URL-safe base64 share code. */
export function encodeFeedbackCode(data: SharedFeedback): string {
    try {
        const payload: SharedFeedback = {
            ...data,
            // Always encode the frozen snapshot so the link is self-contained
            rubric: (data.sr.rubricSnapshot ?? data.rubric) as Rubric,
        };
        return btoa(encodeURIComponent(JSON.stringify(payload)));
    } catch {
        return '';
    }
}

/** Decodes a feedback share code, returning null if the code is malformed or missing required fields. */
export function decodeFeedbackCode(code: string): SharedFeedback | null {
    try {
        const json = decodeURIComponent(atob(code.trim()));
        const data = JSON.parse(json) as SharedFeedback;
        if (!data.sr || !data.rubric || !data.student) return null;
        return data;
    } catch {
        return null;
    }
}
