import type { TestAssignmentPayload } from '../types';

export function encodeTestAssignment(assignment: TestAssignmentPayload): string {
    try {
        // When Supabase is configured the share code is just the teacherKey (a 21-char
        // nanoid). All assignment content is fetched from the database after the
        // student connects — nothing sensitive appears in the code. Supabase
        // credentials come from the app's own env vars (all students use the same
        // deployment), so they don't need to be repeated in every link.
        if (assignment.supabaseUrl) {
            return assignment.teacherKey;
        }
        return btoa(encodeURIComponent(JSON.stringify(assignment)));
    } catch {
        return '';
    }
}

export function decodeTestAssignment(code: string): TestAssignmentPayload | null {
    try {
        const json = decodeURIComponent(atob(code.trim()));
        const data = JSON.parse(json) as TestAssignmentPayload;
        if (!data.testId || !data.studentId || !data.teacherKey) return null;
        return data;
    } catch {
        return null;
    }
}
