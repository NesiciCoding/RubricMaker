import { useEffect, useState } from 'react';
import { getDb } from '../services/database/lazyDb';
import {
    mergePriorComments,
    rankPriorComments,
    type PriorCommentSource,
    type RankedPriorComment,
} from '../utils/commentRecall';

const REMOTE_DEBOUNCE_MS = 250;

interface PriorCommentSearchState {
    results: RankedPriorComment[];
    searching: boolean;
}

/**
 * Searches the teacher's past comments for `query`.
 *
 * The local ranking is synchronous and always runs first, so the list is usable with no Supabase
 * connection and never regresses to an empty state. When a connection is live the comment-bank
 * RPC is asked as well (debounced) and its ranking is merged ahead of the local feedback results;
 * a failed RPC keeps the local list.
 */
export function usePriorCommentSearch(
    query: string,
    sources: PriorCommentSource[],
    limit = 6
): PriorCommentSearchState {
    const [state, setState] = useState<PriorCommentSearchState>({ results: [], searching: false });

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setState({ results: [], searching: false });
            return;
        }

        const local = rankPriorComments(trimmed, sources, limit);
        setState({ results: local, searching: false });

        const db = getDb();
        if (!db?.storageSync.isConnected()) return;

        let cancelled = false;
        const timer = setTimeout(() => {
            if (cancelled) return;
            setState((prev) => ({ ...prev, searching: true }));
            void db.storageSync
                .searchPriorComments(trimmed, limit)
                .then((remote) => {
                    if (cancelled) return;
                    setState({
                        results: remote.length > 0 ? mergePriorComments(remote, local, limit) : local,
                        searching: false,
                    });
                })
                .catch(() => {
                    if (!cancelled) setState({ results: local, searching: false });
                });
        }, REMOTE_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, sources, limit]);

    return state;
}
