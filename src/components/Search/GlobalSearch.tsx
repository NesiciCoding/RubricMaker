import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, FileText, ClipboardList, User, Users, BookOpen, GraduationCap, Layers, Newspaper } from 'lucide-react';
import Modal from '../ui/Modal';
import { useApp } from '../../context/AppContext';
import { searchAll, type SearchResult, type SearchResultType } from '../../utils/globalSearch';

const TYPE_ICONS: Record<SearchResultType, React.ComponentType<{ size?: number }>> = {
    rubric: FileText,
    test: ClipboardList,
    student: User,
    class: Users,
    essay: BookOpen,
    grade: GraduationCap,
    flashcardDeck: Layers,
    newsFlash: Newspaper,
};

interface Props {
    onClose: () => void;
    growFrom?: { x: number; y: number };
}

export default function GlobalSearch({ onClose, growFrom }: Props) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, tests, students, classes, essayAssignments, flashcardDecks, newsFlashes } = useApp();
    const [query, setQuery] = useState('');

    const results = useMemo(
        () => searchAll(query, { rubrics, tests, students, classes, essayAssignments, flashcardDecks, newsFlashes }),
        [query, rubrics, tests, students, classes, essayAssignments, flashcardDecks, newsFlashes]
    );

    function go(result: SearchResult) {
        navigate(result.route);
        onClose();
    }

    return (
        <Modal
            titleId="global-search-title"
            onClose={onClose}
            growFrom={growFrom}
            maxWidth={560}
            style={{ width: '92vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}
        >
            <h2 id="global-search-title" className="sr-only">
                {t('search.open_search')}
            </h2>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                    <Search
                        size={15}
                        style={{
                            position: 'absolute',
                            left: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }}
                        aria-hidden="true"
                    />
                    <input
                        className="input"
                        style={{ paddingLeft: 36, width: '100%' }}
                        placeholder={t('search.placeholder')}
                        aria-label={t('search.placeholder')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                {query.trim() === '' ? (
                    <div className="empty-state" style={{ padding: 32 }}>
                        {t('search.hint')}
                    </div>
                ) : results.length === 0 ? (
                    <div className="empty-state" style={{ padding: 32 }}>
                        {t('search.no_results')}
                    </div>
                ) : (
                    results.slice(0, 50).map((result) => {
                        const Icon = TYPE_ICONS[result.type];
                        return (
                            <button
                                key={`${result.type}-${result.id}`}
                                onClick={() => go(result)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <Icon size={16} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, color: 'var(--text)' }}>
                                        {result.label}
                                        {(result.testMode === 'practice' || result.testMode === 'placement') && (
                                            <span
                                                style={{
                                                    marginLeft: 6,
                                                    fontSize: 10,
                                                    color: 'var(--accent)',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: 8,
                                                    padding: '0 6px',
                                                }}
                                            >
                                                {result.testMode === 'placement'
                                                    ? t('search.placement_badge')
                                                    : t('search.practice_badge')}
                                            </span>
                                        )}
                                    </div>
                                    {result.sublabel && (
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                            {result.sublabel}
                                        </div>
                                    )}
                                </div>
                                <span
                                    style={{
                                        fontSize: 10.5,
                                        textTransform: 'uppercase',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                        padding: '2px 8px',
                                    }}
                                >
                                    {t(`search.type_${result.type}`)}
                                </span>
                            </button>
                        );
                    })
                )}
            </div>
        </Modal>
    );
}
