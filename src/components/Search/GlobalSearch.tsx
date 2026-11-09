import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, FileText, ClipboardList, User, Users, BookOpen, GraduationCap, Layers, Newspaper } from 'lucide-react';
import Modal from '../ui/Modal';
import { useStoreSelector } from '../../context/useStore';
import { buildSearchIndex, searchAll, type SearchResult, type SearchResultType } from '../../utils/globalSearch';
import { EmptyState } from '../ui/EmptyState';

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

/** Fixed group order for the palette; within a group the searchAll ranking is preserved. */
const GROUP_ORDER: SearchResultType[] = [
    'rubric',
    'test',
    'student',
    'class',
    'essay',
    'grade',
    'flashcardDeck',
    'newsFlash',
];

const MAX_RESULTS = 50;
const MAX_RECENTS = 8;
const RECENT_KEY = 'rm.recent-search-v1';
const LISTBOX_ID = 'gs-listbox';

interface RecentEntry {
    type: SearchResultType;
    id: string;
    label: string;
    sublabel?: string;
    route: string;
    testMode?: SearchResult['testMode'];
}

function loadRecents(): RecentEntry[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (e): e is RecentEntry =>
                !!e &&
                typeof e === 'object' &&
                typeof (e as RecentEntry).type === 'string' &&
                typeof (e as RecentEntry).id === 'string' &&
                typeof (e as RecentEntry).label === 'string' &&
                typeof (e as RecentEntry).route === 'string'
        );
    } catch {
        return [];
    }
}

interface Props {
    onClose: () => void;
    growFrom?: { x: number; y: number };
}

export default function GlobalSearch({ onClose, growFrom }: Props) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        students: allStudents,
        classes,
        rubrics,
        tests,
        essayAssignments,
        newsFlashes,
        flashcardDecks,
    } = useStoreSelector((s) => ({
        students: s.students,
        classes: s.classes,
        rubrics: s.rubrics,
        tests: s.tests,
        essayAssignments: s.essayAssignments,
        newsFlashes: s.newsFlashes,
        flashcardDecks: s.flashcardDecks,
    }));
    // The roster domain hooks filtered soft-deleted rows; archived students must not
    // surface in search results.
    const students = useMemo(() => allStudents.filter((s) => !s.archivedAt), [allStudents]);

    const [query, setQuery] = useState('');
    // Keep the input responsive: run the full-corpus search at lower priority so it coalesces
    // rapid keystrokes instead of re-scanning every rubric/test/student on each keypress.
    const deferredQuery = useDeferredValue(query);

    // #1113: index normalized corpus once per data change, query it per keystroke.
    const searchData = useMemo(
        () => ({
            rubrics,
            tests,
            students,
            classes,
            essayAssignments,
            flashcardDecks,
            newsFlashes,
        }),
        [rubrics, tests, students, classes, essayAssignments, flashcardDecks, newsFlashes]
    );
    const searchIndex = useMemo(() => buildSearchIndex(searchData), [searchData]);

    const results = useMemo(
        () => searchAll(deferredQuery, searchData, searchIndex),
        [deferredQuery, searchData, searchIndex]
    );

    // ── Recents (#890): last-opened results, validated against the live corpus ──
    const [recents, setRecents] = useState<RecentEntry[]>(loadRecents);
    const validIds = useMemo(() => {
        // Mirror searchAll (globalSearch.ts): anonymized students never surface,
        // so their stored recents must not validate either — otherwise the empty
        // query would keep showing the pre-anonymization name.
        const studentIds = new Set(students.filter((s) => !s.anonymizedAt).map((s) => s.id));
        const rubricIds = new Set(rubrics.map((r) => r.id));
        const ids: Record<SearchResultType, Set<string> | null> = {
            rubric: rubricIds,
            test: new Set(tests.map((x) => x.id)),
            student: studentIds,
            class: new Set(classes.map((x) => x.id)),
            essay: new Set(essayAssignments.map((x) => x.teacherKey)),
            grade: null, // composite `${studentId}:${rubricId}`, checked below
            flashcardDeck: new Set(flashcardDecks.map((x) => x.id)),
            newsFlash: new Set(newsFlashes.map((x) => x.id)),
        };
        return { ids, studentIds, rubricIds };
    }, [students, rubrics, tests, classes, essayAssignments, flashcardDecks, newsFlashes]);

    const validRecents = useMemo(() => {
        const { ids, studentIds, rubricIds } = validIds;
        return recents
            .filter((r) => {
                if (r.type === 'grade') {
                    const [sid, rid] = r.id.split(':');
                    return !!sid && !!rid && studentIds.has(sid) && rubricIds.has(rid);
                }
                return ids[r.type]?.has(r.id) ?? false;
            })
            .slice(0, MAX_RECENTS);
    }, [recents, validIds]);

    function recordRecent(result: SearchResult) {
        const entry: RecentEntry = {
            type: result.type,
            id: result.id,
            label: result.label,
            sublabel: result.sublabel,
            route: result.route,
            testMode: result.testMode,
        };
        // Compute the next list outside the updater: updaters must stay pure
        // (React may run them twice), and the write must not be lost if `go`
        // unmounts us via onClose before the updater runs.
        const next = [entry, ...recents.filter((e) => !(e.type === entry.type && e.id === entry.id))].slice(
            0,
            MAX_RECENTS
        );
        setRecents(next);
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
            // Private-mode quota or disabled storage: recents stay in memory only.
        }
    }

    function go(result: SearchResult) {
        recordRecent(result);
        navigate(result.route);
        onClose();
    }

    // ── Visible items: recents on empty query, grouped search hits otherwise ──
    const showingRecents = query.trim() === '';
    const groups = useMemo(() => {
        if (showingRecents) {
            return validRecents.length > 0 ? [{ key: 'recent' as const, items: validRecents }] : [];
        }
        const out: { key: SearchResultType; items: SearchResult[] }[] = [];
        for (const type of GROUP_ORDER) {
            const items = results.filter((r) => r.type === type).slice(0, MAX_RESULTS);
            if (items.length > 0) out.push({ key: type, items });
        }
        // Cap the total without duplicating any ranking logic: trim whole trailing groups.
        let total = 0;
        return out.filter((g) => {
            if (total >= MAX_RESULTS) return false;
            total += g.items.length;
            return true;
        });
    }, [showingRecents, validRecents, results]);
    const flat: SearchResult[] = useMemo(() => groups.flatMap((g) => g.items), [groups]);
    // Object-identity index so rows can resolve their option number without render-scope mutation.
    const flatIndex = useMemo(() => {
        const map = new Map<SearchResult, number>();
        flat.forEach((result, index) => map.set(result, index));
        return map;
    }, [flat]);

    // ── Keyboard operation (#890): arrows move, Enter selects, focus stays in the input ──
    const [activeIndex, setActiveIndex] = useState(0);
    useEffect(() => {
        setActiveIndex(0);
    }, [deferredQuery, showingRecents, validRecents.length]);
    useEffect(() => {
        if (activeIndex >= flat.length) setActiveIndex(0);
    }, [flat.length, activeIndex]);

    const optionRefs = useRef(new Map<number, HTMLDivElement>());
    useEffect(() => {
        // scrollIntoView is absent in jsdom; the optional call keeps tests honest.
        optionRefs.current.get(activeIndex)?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        // IME confirmation (e.g. Japanese/Chinese Enter) must not navigate or select.
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Home') {
            e.preventDefault();
            setActiveIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setActiveIndex(Math.max(flat.length - 1, 0));
        } else if (e.key === 'Enter') {
            const target = flat[activeIndex];
            if (target) {
                e.preventDefault();
                go(target);
            }
        }
    }

    const activeId = flat.length > 0 ? `gs-opt-${activeIndex}` : undefined;

    function renderOption(result: SearchResult, showTypeBadge: boolean) {
        const Icon = TYPE_ICONS[result.type];
        const index = flatIndex.get(result) ?? 0;
        const active = index === activeIndex;
        return (
            <div
                key={`${result.type}-${result.id}`}
                id={`gs-opt-${index}`}
                role="option"
                aria-selected={active}
                ref={(el) => {
                    if (el) optionRefs.current.set(index, el);
                    else optionRefs.current.delete(index);
                }}
                onClick={() => go(result)}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    background: active ? 'var(--bg-elevated)' : 'transparent',
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
                                    color: 'var(--accent-text)',
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
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{result.sublabel}</div>
                    )}
                </div>
                {/* Grouped hits already sit under a type header; only mixed-type recents need the badge. */}
                {showTypeBadge && (
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
                )}
            </div>
        );
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
                        role="combobox"
                        aria-expanded={flat.length > 0}
                        aria-controls={LISTBOX_ID}
                        aria-activedescendant={activeId}
                        aria-autocomplete="list"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        autoFocus
                    />
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                {/* Screen-reader announcement of the live result count (F17). Only
                    announce once the deferred search has caught up with the input,
                    so the first keystroke can't announce the previous (empty)
                    result set. The query is part of the text so a new result set
                    with the same count still triggers an announcement, and the
                    50-row display cap is announced when it applies. */}
                <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                    {query.trim() === '' || deferredQuery !== query
                        ? ''
                        : results.length > MAX_RESULTS
                          ? t('search.results_capped', {
                                shown: MAX_RESULTS,
                                count: results.length,
                                query: deferredQuery.trim(),
                            })
                          : t('search.results_for_query', {
                                count: results.length,
                                query: deferredQuery.trim(),
                            })}
                </span>
                {query.trim() === '' ? (
                    validRecents.length === 0 ? (
                        <EmptyState style={{ padding: 32 }} description={t('search.hint')} />
                    ) : (
                        <div id={LISTBOX_ID} role="listbox" aria-label={t('search.results_list_label')}>
                            <div role="group" aria-label={t('search.recent_title')}>
                                <div
                                    role="presentation"
                                    style={{
                                        padding: '6px 16px 2px',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    {t('search.recent_title')}
                                </div>
                                {validRecents.map((result) => renderOption(result, true))}
                            </div>
                        </div>
                    )
                ) : results.length === 0 ? (
                    <EmptyState style={{ padding: 32 }} description={t('search.no_results')} />
                ) : (
                    <div id={LISTBOX_ID} role="listbox" aria-label={t('search.results_list_label')}>
                        {groups.map((group) => (
                            <div key={group.key} role="group" aria-label={t(`search.type_${group.key}`)}>
                                <div
                                    role="presentation"
                                    style={{
                                        padding: '6px 16px 2px',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    {t(`search.type_${group.key}`)}
                                </div>
                                {group.items.map((result) => renderOption(result, false))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
