import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Mic, Search } from 'lucide-react';
import DropdownMenu from '../ui/DropdownMenu';
import type { Student } from '../../types';

/** Rubric-side half of the speaking launcher: pick the student here, the rubric is already known.
 *  Searchable, unlike the native select it replaces, because a class roster is routinely 30+. */
export default function SpeakingStudentMenu({
    rubricId,
    students,
    onSelect,
}: {
    rubricId: string;
    students: Student[];
    onSelect: (rubricId: string, studentId: string) => void;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const anchorRef = useRef<HTMLButtonElement>(null);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? students.filter((s) => s.name.toLowerCase().includes(q)) : students;
    }, [students, query]);

    const close = () => {
        setOpen(false);
        setQuery('');
    };

    return (
        <div style={{ position: 'relative', flex: '1 1 auto' }}>
            <button
                ref={anchorRef}
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('rubricList.speaking_select_student')}
                onClick={() => setOpen((o) => !o)}
            >
                <Mic size={14} /> {t('rubricList.speaking_select_student')}
                <ChevronDown size={12} />
            </button>
            <DropdownMenu
                open={open}
                onClose={close}
                anchorRef={anchorRef}
                minWidth={220}
                ariaLabel={t('rubricList.speaking_select_student')}
            >
                <div style={{ position: 'relative', padding: 4 }}>
                    <Search
                        size={13}
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            left: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-dim)',
                        }}
                    />
                    <input
                        type="search"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('rubricList.speaking_search_student')}
                        aria-label={t('rubricList.speaking_search_student')}
                        style={{ width: '100%', paddingLeft: 30 }}
                        // Arrow keys inside the search box edit the text, not menu items; every other
                        // key (Escape above all) has to reach DropdownMenu's document-level handler,
                        // which is what closes the menu and restores trigger focus.
                        onKeyDown={(e) => {
                            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') e.stopPropagation();
                        }}
                    />
                </div>
                {visible.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        role="menuitem"
                        className="btn btn-ghost btn-sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => {
                            close();
                            onSelect(rubricId, s.id);
                        }}
                    >
                        <Mic size={13} /> {s.name}
                    </button>
                ))}
            </DropdownMenu>
        </div>
    );
}
