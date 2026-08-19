import { useEffect, useState } from 'react';
import { useEssays } from '../context/AppContext';
import { loadSupabaseConfig } from '../services/database';
import { keyOnlineEssaySubmissions } from '../utils/onlineEssaySubmissions';

/**
 * Online essay submissions (essay_submissions rows written by the submit-essay
 * edge function), keyed teacherKey -> set of student ids that handed in.
 *
 * The store's hydrated `essaySubmissions` only tracks OFFLINE submissions
 * (essay_offline_submissions — the pasted-code import path), so roster badges
 * and submitted counts would never reflect a student who handed in through the
 * online portal. This fetches the online table separately, purely for status
 * derivation — the result is never persisted back.
 */
export function useOnlineEssaySubmissions(): Map<string, Set<string>> {
    const { fetchAllEssaySubmissions } = useEssays();
    const config = loadSupabaseConfig();
    const hasDb = !!config?.supabaseUrl && !!config?.supabaseAnonKey;
    const [byTeacherKey, setByTeacherKey] = useState<Map<string, Set<string>>>(new Map());

    useEffect(() => {
        if (!hasDb) return;
        let cancelled = false;
        void fetchAllEssaySubmissions()
            .then((rows) => {
                if (cancelled) return;
                setByTeacherKey(keyOnlineEssaySubmissions(rows));
            })
            .catch(() => {
                // Non-fatal: offline submissions still drive the badges.
            });
        return () => {
            cancelled = true;
        };
    }, [hasDb, fetchAllEssaySubmissions]);

    return byTeacherKey;
}
