/**
 * Pure mapping for online essay submissions (essay_submissions rows written by
 * the submit-essay edge function): teacherKey (assignment id) -> set of student
 * ids that handed in. Extracted from useOnlineEssaySubmissions so the keying
 * logic is unit-testable (see src/__tests__/onlineEssaySubmissions.test.ts).
 */
export interface OnlineEssaySubmissionRow {
    assignmentId: string;
    studentId: string;
}

export function keyOnlineEssaySubmissions(rows: OnlineEssaySubmissionRow[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
        const set = map.get(row.assignmentId) ?? new Set<string>();
        if (row.studentId) set.add(row.studentId);
        map.set(row.assignmentId, set);
    }
    return map;
}
