import type { EssayAssignment, EssaySubmission, TestAssignmentPayload, TestSubmissionPayload } from '../types';
import type { StudentRubric, Rubric, Student, GradeScale } from '../types';
import { encodeUrlSafeBase64, decodeUrlSafeBase64 } from './urlSafeBase64';

export interface SharedFeedback {
    sr: StudentRubric;
    rubric: Rubric;
    student: Student;
    scale: GradeScale | null;
}

// ── Essay assignment ──────────────────────────────────────────────────────────

export function encodeEssayAssignment(assignment: EssayAssignment): string {
    try {
        // ownerUserId must not be exposed in URLs
        const { ownerUserId: _stripped, ...safe } = assignment as EssayAssignment & { ownerUserId?: string };
        // When Supabase is configured the share URL is just the teacherKey; the
        // assignment content is fetched server-side after the student connects.
        if (safe.supabaseUrl) return safe.teacherKey;
        return encodeUrlSafeBase64(JSON.stringify(safe));
    } catch {
        return '';
    }
}

export function decodeEssayAssignment(code: string): EssayAssignment | null {
    try {
        const json = decodeUrlSafeBase64(code);
        const data = JSON.parse(json) as EssayAssignment;
        if (!data.rubricId || !data.studentId || !data.title) return null;
        return data;
    } catch {
        return null;
    }
}

// ── Essay submission ──────────────────────────────────────────────────────────

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

// ── Feedback (student share) ──────────────────────────────────────────────────

export function encodeFeedbackCode(data: SharedFeedback): string {
    try {
        const payload: SharedFeedback = {
            ...data,
            // Always encode the frozen snapshot so the link is self-contained
            rubric: (data.sr.rubricSnapshot ?? data.rubric) as Rubric,
        };
        return encodeUrlSafeBase64(JSON.stringify(payload));
    } catch {
        return '';
    }
}

export function decodeFeedbackCode(code: string): SharedFeedback | null {
    try {
        const json = decodeUrlSafeBase64(code);
        const data = JSON.parse(json) as SharedFeedback;
        if (!data.sr || !data.rubric || !data.student) return null;
        return data;
    } catch {
        return null;
    }
}

// ── Test assignment ───────────────────────────────────────────────────────────

export function encodeTestAssignment(assignment: TestAssignmentPayload): string {
    try {
        // When Supabase is configured the share code is just the teacherKey; the
        // assignment content is fetched server-side after the student connects.
        if (assignment.supabaseUrl) return assignment.teacherKey;
        return encodeUrlSafeBase64(JSON.stringify(assignment));
    } catch {
        return '';
    }
}

export function decodeTestAssignment(code: string): TestAssignmentPayload | null {
    try {
        const json = decodeUrlSafeBase64(code);
        const data = JSON.parse(json) as TestAssignmentPayload;
        if (!data.testId || !data.studentId || !data.teacherKey) return null;
        return data;
    } catch {
        return null;
    }
}

// ── Test submission ───────────────────────────────────────────────────────────

export function encodeTestSubmission(submission: TestSubmissionPayload): string {
    try {
        return encodeUrlSafeBase64(JSON.stringify(submission));
    } catch {
        return '';
    }
}

export function decodeTestSubmission(code: string): TestSubmissionPayload | null {
    try {
        const json = decodeUrlSafeBase64(code);
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
