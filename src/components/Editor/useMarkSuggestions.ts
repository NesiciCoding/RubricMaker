import { useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import type { DocumentMark } from '../../types';
import { suggestionFor, type MarkSuggestion } from '../../utils/markTextOperations';

/**
 * The sentence each text-operation mark would carry out, derived from the live document. It is a
 * hook rather than a call inside the panel because a suggestion depends on the editor state, and
 * the panel only receives records.
 */
export function useMarkSuggestions(
    editor: Editor | null,
    marks: readonly DocumentMark[]
): Record<string, MarkSuggestion> {
    return useMemo(() => {
        const doc = editor?.state.doc;
        if (!doc) return {};
        const suggestions: Record<string, MarkSuggestion> = {};
        for (const mark of marks) {
            const suggestion = suggestionFor(doc, mark);
            if (suggestion) suggestions[mark.id] = suggestion;
        }
        return suggestions;
    }, [editor, marks]);
}
