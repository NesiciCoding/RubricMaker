import { ArrowRightLeft, Copy, Library, Trash2 } from 'lucide-react';
import type { TestQuestion, TestSection } from '../../types';
import type { ContextMenuItem } from '../ui/ContextMenu';

interface Labels {
    duplicate: string;
    insertFromBank: string;
    /** "Move to {section}" — also called for the uncategorised group, whose title is passed in. */
    moveTo: (sectionTitle: string) => string;
    noSection: string;
    remove: string;
}

interface Args {
    question: TestQuestion;
    sections: TestSection[];
    labels: Labels;
    duplicate: () => void;
    insertFromBankAfter: () => void;
    moveToSection: (sectionId: string | undefined) => void;
    remove: () => void;
}

/**
 * The outline rail's right-click menu for one question row. The rail itself only navigates; each
 * item calls the same handler the focus pane's buttons use, so a question changes the same way
 * wherever the action starts. Move-to lists every section the question is not already in.
 */
export function questionOutlineMenuItems({
    question,
    sections,
    labels,
    duplicate,
    insertFromBankAfter,
    moveToSection,
    remove,
}: Args): ContextMenuItem[] {
    const knownSection = sections.some((s) => s.id === question.sectionId);
    const currentSectionId = knownSection ? question.sectionId : undefined;
    const targets: { id: string | undefined; title: string }[] = [
        { id: undefined, title: labels.noSection },
        ...sections.map((s) => ({ id: s.id, title: s.title })),
    ].filter((target) => target.id !== currentSectionId);
    return [
        { key: 'duplicate', label: labels.duplicate, icon: <Copy size={14} />, onSelect: duplicate },
        {
            key: 'insert-bank',
            label: labels.insertFromBank,
            icon: <Library size={14} />,
            onSelect: insertFromBankAfter,
        },
        ...targets.map((target): ContextMenuItem => ({
            key: `move-${target.id ?? 'none'}`,
            label: labels.moveTo(target.title),
            icon: <ArrowRightLeft size={14} />,
            onSelect: () => moveToSection(target.id),
        })),
        { key: 'delete', label: labels.remove, icon: <Trash2 size={14} />, danger: true, onSelect: remove },
    ];
}
