import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FOLDER_DROP_ATTRIBUTE, useFolderDropTarget } from './useFolderDropTarget';

function tile(folderId: string): Element {
    const el = document.createElement('div');
    el.setAttribute(FOLDER_DROP_ATTRIBUTE, folderId);
    el.innerHTML = '<button><span>Folder name</span></button>';
    return el;
}

const tileA = tile('folder-a');
const tileB = tile('folder-b');

let underPointer: Element | null = null;

// jsdom has no layout, and with it no elementFromPoint at all — stand in for the hit test.
beforeEach(() => {
    underPointer = null;
    Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        writable: true,
        value: () => underPointer,
    });
});

afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint');
});

function moveTo(clientX: number, clientY: number) {
    act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
    });
}

describe('useFolderDropTarget', () => {
    it('ignores pointer movement until a drag starts', () => {
        underPointer = tileA.querySelector('span');
        const { result } = renderHook(() => useFolderDropTarget());

        moveTo(10, 10);

        expect(result.current.dropFolderId).toBeNull();
    });

    it('tracks the folder tile under the pointer and returns it on drop', () => {
        const { result } = renderHook(() => useFolderDropTarget());

        act(() => result.current.startFolderDrop());
        underPointer = tileA.querySelector('span');
        moveTo(10, 10);
        expect(result.current.dropFolderId).toBe('folder-a');

        underPointer = tileB.querySelector('span');
        moveTo(40, 10);
        expect(result.current.dropFolderId).toBe('folder-b');

        underPointer = null;
        moveTo(90, 10);
        expect(result.current.dropFolderId).toBeNull();

        underPointer = tileA.querySelector('span');
        moveTo(10, 10);
        let dropped: string | null = 'unset';
        act(() => {
            dropped = result.current.endFolderDrop();
        });
        expect(dropped).toBe('folder-a');
        expect(result.current.dropFolderId).toBeNull();
    });

    it('clears the highlight and stops tracking when the drag ends', () => {
        underPointer = tileA.querySelector('span');
        const { result } = renderHook(() => useFolderDropTarget());

        act(() => result.current.startFolderDrop());
        moveTo(10, 10);
        act(() => {
            result.current.endFolderDrop();
        });

        underPointer = tileB.querySelector('span');
        moveTo(40, 10);

        expect(result.current.dropFolderId).toBeNull();
    });

    it('follows touch drags too', () => {
        underPointer = tileA.querySelector('span');
        const { result } = renderHook(() => useFolderDropTarget());
        act(() => result.current.startFolderDrop());

        act(() => {
            const event = new Event('touchmove', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'touches', { value: [{ clientX: 12, clientY: 8 }] });
            window.dispatchEvent(event);
        });

        expect(result.current.dropFolderId).toBe('folder-a');
    });
});
