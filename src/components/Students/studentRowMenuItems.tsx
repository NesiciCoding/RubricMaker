import { ClipboardCopy, Edit2, KeyRound, Play, Trash2, TrendingUp } from 'lucide-react';
import type { ContextMenuItem } from '../ui/ContextMenu';

interface Labels {
    gradeLast: string;
    profile: string;
    copySummary: string;
    generatePassword: string;
    edit: string;
    remove: string;
}

interface Args {
    labels: Labels;
    /** Absent when the student's class lists no rubric to repeat; the visible Grade control still offers the choice. */
    gradeLast?: () => void;
    openProfile: () => void;
    copySummary: () => void;
    /** Absent unless a database is connected and the student has an email to sign in with. */
    generatePassword?: () => void;
    edit: () => void;
    remove: () => void;
}

/**
 * The one action list for a student row, opened by right-click and by the visible ⋯ button so the
 * two cannot drift. The row keeps Grade and the profile link as buttons; everything else lives here.
 */
export function studentRowMenuItems({
    labels,
    gradeLast,
    openProfile,
    copySummary,
    generatePassword,
    edit,
    remove,
}: Args): ContextMenuItem[] {
    return [
        ...(gradeLast
            ? [{ key: 'grade', label: labels.gradeLast, icon: <Play size={14} />, onSelect: gradeLast }]
            : []),
        { key: 'profile', label: labels.profile, icon: <TrendingUp size={14} />, onSelect: openProfile },
        { key: 'summary', label: labels.copySummary, icon: <ClipboardCopy size={14} />, onSelect: copySummary },
        ...(generatePassword
            ? [
                  {
                      key: 'password',
                      label: labels.generatePassword,
                      icon: <KeyRound size={14} />,
                      onSelect: generatePassword,
                  },
              ]
            : []),
        { key: 'edit', label: labels.edit, icon: <Edit2 size={14} />, onSelect: edit },
        { key: 'delete', label: labels.remove, icon: <Trash2 size={14} />, danger: true, onSelect: remove },
    ];
}
