import type { EssayAssignment } from '../types';

export function encodeEssayAssignment(assignment: EssayAssignment): string {
    try {
        // ownerUserId is never needed client-side and must not be exposed in URLs
        const { ownerUserId: _stripped, ...safe } = assignment as EssayAssignment & { ownerUserId?: string };
        // When Supabase is configured the share URL is just the teacherKey (a 21-char
        // nanoid). All assignment content is fetched from the get-essay-assignment edge
        // function after the student authenticates — the prompt never appears in the URL.
        // Supabase credentials come from the app's own env vars (all students use the
        // same deployment), so they don't need to be repeated in every link.
        if (safe.supabaseUrl) {
            return safe.teacherKey;
        }
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
