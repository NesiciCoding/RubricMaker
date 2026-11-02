import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPen } from 'lucide-react';
import { loadDb } from '../../services/database/lazyDb';
import { lastEditedNameCache as nameCache } from './lastEditedNameCache';

interface Props {
    /** Profile id the server stamped as the last editor (StudentRubric/StudentTest.lastEditedBy). */
    editorId?: string;
    /** The signed-in teacher, so their own edits read as "you". */
    currentUserId: string | null;
    /** When it was last changed. */
    at?: string;
}

/** "Last changed by …" for a grade or test result that co-teachers can edit. */
export default function LastEditedNote({ editorId, currentUserId, at }: Props) {
    const { t, i18n } = useTranslation();
    const isMe = !!editorId && editorId === currentUserId;
    const [name, setName] = useState<string | null | undefined>(() =>
        editorId && !isMe ? nameCache.get(editorId) : undefined
    );

    useEffect(() => {
        if (!editorId || isMe || nameCache.has(editorId)) {
            setName(editorId ? nameCache.get(editorId) : undefined);
            return;
        }
        let cancelled = false;
        loadDb()
            .then((db) => db.storageSync.adapter.fetchProfileNames([editorId]))
            .then((names) => names[editorId] ?? null)
            .catch(() => null)
            .then((found) => {
                nameCache.set(editorId, found);
                if (!cancelled) setName(found);
            });
        return () => {
            cancelled = true;
        };
    }, [editorId, isMe]);

    if (!editorId) return null;
    const who = isMe ? t('gradeStudent.last_edited_you') : name || t('sharing.unknown_teacher');
    const when = at ? new Date(at).toLocaleString(i18n.language) : undefined;
    return (
        <p
            className="text-muted text-xs no-print"
            data-testid="last-edited-note"
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 12px' }}
        >
            <UserPen size={13} aria-hidden="true" />
            {when
                ? t('gradeStudent.last_edited_by_at', { name: who, when })
                : t('gradeStudent.last_edited_by', { name: who })}
        </p>
    );
}
