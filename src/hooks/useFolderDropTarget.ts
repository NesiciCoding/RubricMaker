import { useCallback, useEffect, useRef, useState } from 'react';

/** Marker the folder tiles carry so the pointer tracker can find them. */
export const FOLDER_DROP_ATTRIBUTE = 'data-drop-folder-id';

export interface FolderDropTarget {
    /** Folder tile currently under the pointer, while a card is being dragged. */
    dropFolderId: string | null;
    /** Wire to `DragDropContext`'s `onBeforeCapture`. */
    startFolderDrop: () => void;
    /** Wire into `onDragEnd`; returns the folder the pointer was over and clears the highlight. */
    endFolderDrop: () => string | null;
}

/**
 * @hello-pangea/dnd resolves the drop target from the dragged card's *centre*, so a card grabbed
 * by its top-left handle only becomes a folder-drop candidate once its centre crosses the tile —
 * something a 400px card cannot do over a compact tile. Follow the pointer instead.
 */
export function useFolderDropTarget(): FolderDropTarget {
    const [dropFolderId, setDropFolderId] = useState<string | null>(null);
    const folderIdRef = useRef<string | null>(null);
    const draggingRef = useRef(false);
    const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

    useEffect(() => {
        const track = (clientX: number, clientY: number) => {
            if (!draggingRef.current) return;
            pointerRef.current = { clientX, clientY };
            const tile = document.elementFromPoint(clientX, clientY)?.closest(`[${FOLDER_DROP_ATTRIBUTE}]`);
            const id = tile?.getAttribute(FOLDER_DROP_ATTRIBUTE) ?? null;
            if (id === folderIdRef.current) return;
            folderIdRef.current = id;
            setDropFolderId(id);
        };
        const onMouseMove = (event: MouseEvent) => track(event.clientX, event.clientY);
        const onTouchMove = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (touch) track(touch.clientX, touch.clientY);
        };
        // The tiles sit inside `.page-content`, which @hello-pangea/dnd auto-scrolls while the
        // pointer stands still — the folder under the pointer then changes with no pointer event
        // to notice it, so re-run the hit test at the last known position.
        const onScroll = () => {
            const pointer = pointerRef.current;
            if (pointer) track(pointer.clientX, pointer.clientY);
        };
        // Capture so the tracker still sees the move when a card or menu stops propagation.
        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => {
            window.removeEventListener('mousemove', onMouseMove, true);
            window.removeEventListener('touchmove', onTouchMove, true);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, []);

    const startFolderDrop = useCallback(() => {
        draggingRef.current = true;
        folderIdRef.current = null;
        pointerRef.current = null;
        setDropFolderId(null);
    }, []);

    const endFolderDrop = useCallback(() => {
        draggingRef.current = false;
        const id = folderIdRef.current;
        folderIdRef.current = null;
        setDropFolderId(null);
        return id;
    }, []);

    return { dropFolderId, startFolderDrop, endFolderDrop };
}
