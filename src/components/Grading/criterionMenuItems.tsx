import { ClipboardPaste, Copy, MessageSquareText } from 'lucide-react';
import type { RubricLevel, ScoreEntry } from '../../types';
import type { ContextMenuItem } from '../ui/ContextMenu';
import { stripHtmlTags } from '../../utils/exportDataPrep';

/** The classmate graded just before this student, when they left feedback on the same criterion. */
export interface PreviousFeedback {
    name: string;
    /** Plain text, ready to insert into the comment editor. */
    text: string;
}

interface Labels {
    setLevel: (level: string) => string;
    openCommentBank: string;
    copyFeedback: string;
    usePrevious: (name: string) => string;
}

interface Args {
    /** The criterion's levels in display order; empty when the menu is used on a layout without levels. */
    levels: RubricLevel[];
    entry: ScoreEntry;
    labels: Labels;
    previous?: PreviousFeedback;
    selectLevel: (levelId: string) => void;
    openCommentBank: () => void;
    copyFeedback: (text: string) => void;
    /** Puts text at the caret; absent when no comment editor is mounted to insert into. */
    insertPrevious?: (text: string) => void;
}

/**
 * The right-click menu of one criterion card, shared by both grading layouts (the grid's detail
 * panel and the single-point card) so the two cannot drift apart. Every item also exists as a
 * visible control on the card: the level buttons, the comment-bank button, the composer, the
 * feedback itself — the menu is a shortcut, never the only way in.
 */
export function criterionMenuItems({
    levels,
    entry,
    labels,
    previous,
    selectLevel,
    openCommentBank,
    copyFeedback,
    insertPrevious,
}: Args): ContextMenuItem[] {
    const plainFeedback = stripHtmlTags(entry.comment || '').trim();
    return [
        ...levels.map((level): ContextMenuItem => ({
            key: `level-${level.id}`,
            label: labels.setLevel(level.label),
            checked: entry.levelId === level.id,
            onSelect: () => selectLevel(level.id),
        })),
        {
            key: 'comment-bank',
            label: labels.openCommentBank,
            icon: <MessageSquareText size={14} />,
            onSelect: openCommentBank,
        },
        {
            key: 'copy-feedback',
            label: labels.copyFeedback,
            icon: <Copy size={14} />,
            disabled: plainFeedback === '',
            onSelect: () => copyFeedback(plainFeedback),
        },
        ...(previous && insertPrevious
            ? [
                  {
                      key: 'previous-feedback',
                      label: labels.usePrevious(previous.name),
                      icon: <ClipboardPaste size={14} />,
                      onSelect: () => insertPrevious(previous.text),
                  },
              ]
            : []),
    ];
}
