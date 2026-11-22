import {
    BookOpen,
    ChevronDown,
    ChevronUp,
    ClipboardPaste,
    Copy,
    Files,
    Link2,
    Trash2,
    UnfoldVertical,
} from 'lucide-react';
import type { ContextMenuItem } from '../ui/ContextMenu';

interface Labels {
    duplicate: string;
    copy: string;
    paste: string;
    moveUp: string;
    moveDown: string;
    expand: string;
    collapse: string;
    linkStandard: string;
    linkDescriptor: string;
    remove: string;
}

interface Args {
    labels: Labels;
    isFirst: boolean;
    isLast: boolean;
    collapsed: boolean;
    canPaste: boolean;
    duplicate: () => void;
    copy: () => void;
    paste: () => void;
    move: (dir: -1 | 1) => void;
    toggleCollapse: () => void;
    linkStandard: () => void;
    linkDescriptor: () => void;
    remove: () => void;
}

/**
 * The right-click menu of one builder criterion card. Each item re-homes a control that is already
 * on the card (the icon row and the link buttons), so the menu is a shortcut and never the only
 * route. Items that do not apply are disabled rather than hidden so the list never reshuffles.
 */
export function criterionCardMenuItems({
    labels,
    isFirst,
    isLast,
    collapsed,
    canPaste,
    duplicate,
    copy,
    paste,
    move,
    toggleCollapse,
    linkStandard,
    linkDescriptor,
    remove,
}: Args): ContextMenuItem[] {
    return [
        { key: 'duplicate', label: labels.duplicate, icon: <Files size={14} />, onSelect: duplicate },
        { key: 'copy', label: labels.copy, icon: <Copy size={14} />, onSelect: copy },
        { key: 'paste', label: labels.paste, icon: <ClipboardPaste size={14} />, disabled: !canPaste, onSelect: paste },
        {
            key: 'move-up',
            label: labels.moveUp,
            icon: <ChevronUp size={14} />,
            disabled: isFirst,
            onSelect: () => move(-1),
        },
        {
            key: 'move-down',
            label: labels.moveDown,
            icon: <ChevronDown size={14} />,
            disabled: isLast,
            onSelect: () => move(1),
        },
        {
            key: 'collapse',
            label: collapsed ? labels.expand : labels.collapse,
            icon: <UnfoldVertical size={14} />,
            onSelect: toggleCollapse,
        },
        { key: 'link-standard', label: labels.linkStandard, icon: <Link2 size={14} />, onSelect: linkStandard },
        {
            key: 'link-descriptor',
            label: labels.linkDescriptor,
            icon: <BookOpen size={14} />,
            onSelect: linkDescriptor,
        },
        { key: 'delete', label: labels.remove, icon: <Trash2 size={14} />, danger: true, onSelect: remove },
    ];
}
