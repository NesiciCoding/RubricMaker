import { useCallback, useEffect, useRef, useState } from 'react';

/** Steps kept per builder session; the oldest drop off the end of the stack. */
export const BUILDER_HISTORY_LIMIT = 50;

interface Options<T> {
    /** The form as it is on screen right now. */
    snapshot: T;
    /** Edits that keep this signature belong to the same step (see `builderFormSignature`). */
    signature: string;
    onRestore: (snapshot: T) => void;
    limit?: number;
}

interface HistoryControls {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
}

/**
 * Undo/redo over a form that lives in many `useState` calls: the page keeps owning the fields and
 * this hook only remembers snapshots and hands one back. Steps are merged by signature, so a typing
 * burst collapses into one undo instead of one per keystroke.
 */
export function useBuilderHistory<T>({
    snapshot,
    signature,
    onRestore,
    limit = BUILDER_HISTORY_LIMIT,
}: Options<T>): HistoryControls {
    const pastRef = useRef<T[]>([]);
    const futureRef = useRef<T[]>([]);
    /** The snapshot on screen — what an undo has to leave behind. */
    const liveRef = useRef(snapshot);
    const liveKeyRef = useRef(JSON.stringify(snapshot));
    /** The render that shows a snapshot we just restored is not a new edit. */
    const pendingRestoreKeyRef = useRef<string | null>(null);
    const lastSignatureRef = useRef<string | null>(null);
    /** A change that altered the signature (add, delete, reorder, retype) is one step on its own. */
    const structuralChangeRef = useRef(false);
    const onRestoreRef = useRef(onRestore);
    const limitRef = useRef(limit);
    /** Mirrors the stacks' depth for rendering; the stacks themselves stay in refs. */
    const [depth, setDepth] = useState({ past: 0, future: 0 });
    const syncDepth = useCallback(() => {
        setDepth({ past: pastRef.current.length, future: futureRef.current.length });
    }, []);

    useEffect(() => {
        onRestoreRef.current = onRestore;
        limitRef.current = limit;
    });

    useEffect(() => {
        const key = JSON.stringify(snapshot);
        if (pendingRestoreKeyRef.current === key) {
            pendingRestoreKeyRef.current = null;
            liveRef.current = snapshot;
            liveKeyRef.current = key;
            return;
        }
        if (key === liveKeyRef.current) return;
        const structural = lastSignatureRef.current !== null && lastSignatureRef.current !== signature;
        const sameStep = lastSignatureRef.current === signature && !structuralChangeRef.current;
        if (!sameStep) {
            pastRef.current = [...pastRef.current, liveRef.current].slice(-limitRef.current);
        }
        const hadFuture = futureRef.current.length > 0;
        futureRef.current = [];
        liveRef.current = snapshot;
        liveKeyRef.current = key;
        lastSignatureRef.current = signature;
        structuralChangeRef.current = structural;
        if (!sameStep || hadFuture) syncDepth();
    }, [snapshot, signature, syncDepth]);

    const restore = useCallback((target: T) => {
        pendingRestoreKeyRef.current = JSON.stringify(target);
        // The edit that follows a restore is its own step, so it can be undone back to the restore.
        lastSignatureRef.current = null;
        structuralChangeRef.current = false;
        liveRef.current = target;
        liveKeyRef.current = pendingRestoreKeyRef.current;
        onRestoreRef.current(target);
    }, []);

    const undo = useCallback(() => {
        const target = pastRef.current[pastRef.current.length - 1];
        if (!target) return;
        pastRef.current = pastRef.current.slice(0, -1);
        futureRef.current = [liveRef.current, ...futureRef.current].slice(0, limitRef.current);
        restore(target);
        syncDepth();
    }, [restore, syncDepth]);

    const redo = useCallback(() => {
        const target = futureRef.current[0];
        if (!target) return;
        futureRef.current = futureRef.current.slice(1);
        pastRef.current = [...pastRef.current, liveRef.current].slice(-limitRef.current);
        restore(target);
        syncDepth();
    }, [restore, syncDepth]);

    return {
        canUndo: depth.past > 0,
        canRedo: depth.future > 0,
        undo,
        redo,
    };
}
