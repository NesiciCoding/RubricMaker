import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, ChevronRight, Maximize2, Minimize2, Plus, Settings } from 'lucide-react';
import { plainQuestionPromptText } from '../../utils/clozeParse';
import { htmlToPlainText } from '../../utils/essayUtils';
import { questionTypeLabelKey } from '../../utils/questionTypeKey';
import type { TestQuestion, TestSection } from '../../types';

interface Props {
    sections: TestSection[];
    /** Questions in display order: their index here is the number the card and the outline show. */
    questions: TestQuestion[];
    totalPoints: number;
    issuesByQuestion: Map<string, string[]>;
    /** Question shown in the focus pane. */
    activeId?: string | null;
    /** Section whose workspace is open in the focus pane. */
    activeSectionId?: string | null;
    onSelect: (questionId: string) => void;
    /** Opens a section's workspace; the uncategorised group has none to open. */
    onSelectSection?: (sectionId: string) => void;
    onAdd: () => void;
    /** Opens the settings drawer from the rail footer. */
    onOpenSettings: () => void;
    /** False when the rail already has the whole pane; hides nothing, just swaps the button's action. */
    expanded?: boolean;
    /** Only present in the wide layout, where giving the outline the full width is useful. */
    onToggleExpand?: () => void;
}

/**
 * Navigation rail for the test builder: the whole structure at a glance, whatever question is open.
 * It reads, filters and selects — editing stays in the focus pane — so the rail never has to know
 * how a question is edited.
 */
export default function TestOutlineRail({
    sections,
    questions,
    totalPoints,
    issuesByQuestion,
    activeId,
    activeSectionId,
    onSelect,
    onSelectSection,
    onAdd,
    onOpenSettings,
    expanded = false,
    onToggleExpand,
}: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const treeRef = useRef<HTMLDivElement | null>(null);
    const needle = query.trim().toLowerCase();

    const labelFor = (question: TestQuestion) =>
        htmlToPlainText(plainQuestionPromptText(question)).trim() || t(questionTypeLabelKey(question.type));

    const sectionIds = new Set(sections.map((s) => s.id));
    const groups = [
        {
            id: '__none__',
            title: t('tests.no_section'),
            questions: questions.filter((q) => !q.sectionId || !sectionIds.has(q.sectionId)),
        },
        ...sections.map((section) => ({
            id: section.id,
            title: section.title,
            questions: questions.filter((q) => q.sectionId === section.id),
        })),
    ]
        .map((group) => ({
            ...group,
            questions: needle
                ? group.questions.filter(
                      (q) => labelFor(q).toLowerCase().includes(needle) || group.title.toLowerCase().includes(needle)
                  )
                : group.questions,
        }))
        // A section with no questions yet is still a section to open — it is the only way to reach
        // its workspace (and its own add-question button) from the rail.
        .filter((group) => group.questions.length > 0 || (!needle && group.id !== '__none__'));

    const numberOf = (question: TestQuestion) => questions.indexOf(question) + 1;

    // A collapsed section unmounts its rows, so the mounted rows are exactly the walkable ones.
    const treeRows = () => Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-tree-row]') ?? []);

    function focusRow(offset: number) {
        const rows = treeRows();
        if (rows.length === 0) return;
        const next = Math.min(Math.max(offset, 0), rows.length - 1);
        rows[next]?.focus();
    }

    function setSectionCollapsed(sectionId: string, collapsed: boolean, header?: HTMLElement | null) {
        setCollapsedSections((prev) => {
            const had = prev.has(sectionId);
            if (had === collapsed) return prev;
            const next = new Set(prev);
            if (collapsed) next.add(sectionId);
            else next.delete(sectionId);
            return next;
        });
        if (collapsed) header?.focus({ preventScroll: true });
    }

    /** Arrow keys walk the outline; Enter opens, and Left/Right collapse or expand a section. */
    function handleTreeKeyDown(event: React.KeyboardEvent) {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-tree-row]');
        if (!row) return;
        const rows = treeRows();
        const index = rows.indexOf(row);
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusRow(index + 1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusRow(index - 1);
            return;
        }
        if (event.key === 'Home') {
            event.preventDefault();
            focusRow(0);
            return;
        }
        if (event.key === 'End') {
            event.preventDefault();
            focusRow(rows.length - 1);
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            row.click();
            return;
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const sectionId = row.dataset.sectionId;
        if (row.dataset.rowKind === 'section') {
            if (sectionId) setSectionCollapsed(sectionId, event.key === 'ArrowLeft', row);
            return;
        }
        if (event.key === 'ArrowLeft') {
            const header = row.closest('[data-tree-group]')?.querySelector<HTMLElement>('[data-row-kind="section"]');
            header?.focus({ preventScroll: true });
        }
    }

    return (
        <nav
            aria-labelledby="test-outline-heading"
            style={{
                position: 'sticky',
                top: 12,
                alignSelf: 'start',
                // Maximised, the outline stops growing at a readable line length instead of
                // stretching a prompt and its points to opposite edges of the page.
                ...(expanded ? { width: '100%', maxWidth: 760, margin: '0 auto' } : {}),
                maxHeight: 'calc(100vh - 24px)',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--bg-panel)',
                padding: '12px 10px 10px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h2
                    id="test-outline-heading"
                    className="card-heading"
                    style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                    }}
                >
                    {t('tests.outline_title')}
                </h2>
                {onToggleExpand && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={onToggleExpand}
                        aria-label={expanded ? t('tests.rail_restore') : t('tests.rail_expand')}
                        title={expanded ? t('tests.rail_restore') : t('tests.rail_expand')}
                        data-testid="outline_expand"
                        style={{ marginLeft: 'auto' }}
                    >
                        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                )}
            </div>
            <p className="text-muted text-xs" style={{ margin: '4px 0 8px' }}>
                {t('tests.questions_summary', {
                    count: questions.length,
                    points: t('tests.points_total', { count: totalPoints }),
                })}
            </p>

            {questions.length > 0 && (
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('tests.outline_search_placeholder')}
                    aria-label={t('tests.outline_search_placeholder')}
                    style={{ width: '100%', fontSize: '0.8rem', marginBottom: 10 }}
                />
            )}

            {questions.length === 0 && groups.length === 0 && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                    {t('tests.no_questions')}
                </p>
            )}

            {questions.length > 0 && groups.length === 0 && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                    {t('tests.outline_no_matches')}
                </p>
            )}

            {(() => {
                const firstQuestionId = groups.flatMap((group) => group.questions)[0]?.id;
                const tabbableQuestionId = questions.some((q) => q.id === activeId) ? activeId : firstQuestionId;
                return (
                    <div role="tree" aria-labelledby="test-outline-heading" ref={treeRef} onKeyDown={handleTreeKeyDown}>
                        {groups.map((group) => {
                            const sectionActive = group.id === activeSectionId;
                            const collapsible = !!onSelectSection && group.id !== '__none__';
                            const collapsed = collapsedSections.has(group.id);
                            const sectionLabel = (
                                <span
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontWeight: 600,
                                        color: sectionActive ? 'var(--text)' : 'var(--text-muted)',
                                    }}
                                >
                                    {group.title}
                                </span>
                            );
                            return (
                                <div key={group.id} data-tree-group={group.id} style={{ marginBottom: 10 }}>
                                    {collapsible ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <button
                                                type="button"
                                                role="treeitem"
                                                aria-expanded={!collapsed}
                                                aria-selected={sectionActive}
                                                aria-current={sectionActive ? 'true' : undefined}
                                                tabIndex={sectionActive ? 0 : -1}
                                                data-tree-row="true"
                                                data-row-kind="section"
                                                data-section-id={group.id}
                                                onClick={() => onSelectSection?.(group.id)}
                                                title={group.title}
                                                data-testid={`outline-section-${group.id}`}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    flex: 1,
                                                    minWidth: 0,
                                                    margin: 0,
                                                    padding: '3px 6px',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    background: sectionActive
                                                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                                        : 'none',
                                                    font: 'inherit',
                                                    fontSize: '0.75rem',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {sectionLabel}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-icon btn-sm"
                                                tabIndex={-1}
                                                aria-label={t(
                                                    collapsed
                                                        ? 'tests.outline_expand_section'
                                                        : 'tests.outline_collapse_section',
                                                    { name: group.title }
                                                )}
                                                title={t(
                                                    collapsed
                                                        ? 'tests.outline_expand_section'
                                                        : 'tests.outline_collapse_section',
                                                    { name: group.title }
                                                )}
                                                data-testid={`outline-section-toggle-${group.id}`}
                                                onClick={() => setSectionCollapsed(group.id, !collapsed)}
                                                style={{ padding: 2, minHeight: 20, minWidth: 20 }}
                                            >
                                                {collapsed ? (
                                                    <ChevronRight size={12} aria-hidden="true" />
                                                ) : (
                                                    <ChevronDown size={12} aria-hidden="true" />
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <p
                                            className="text-xs"
                                            style={{
                                                margin: '0 0 4px 6px',
                                                fontWeight: 600,
                                                color: 'var(--text-muted)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={group.title}
                                        >
                                            {group.title}
                                        </p>
                                    )}
                                    {!collapsed && (
                                        <div role="group">
                                            {group.questions.map((question) => {
                                                const active = question.id === activeId;
                                                const issues = issuesByQuestion.get(question.id) ?? [];
                                                return (
                                                    <button
                                                        key={question.id}
                                                        type="button"
                                                        role="treeitem"
                                                        aria-selected={active}
                                                        aria-current={active ? 'true' : undefined}
                                                        tabIndex={question.id === tabbableQuestionId ? 0 : -1}
                                                        data-tree-row="true"
                                                        data-row-kind="question"
                                                        data-section-id={group.id}
                                                        onClick={() => onSelect(question.id)}
                                                        title={labelFor(question)}
                                                        data-testid={`outline-question-${question.id}`}
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '22px minmax(0, 1fr) auto',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                            width: '100%',
                                                            padding: '5px 6px',
                                                            border: 'none',
                                                            borderRadius: 6,
                                                            background: active
                                                                ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                                                                : 'none',
                                                            color: 'var(--text)',
                                                            font: 'inherit',
                                                            fontSize: '0.8rem',
                                                            fontWeight: active ? 600 : 400,
                                                            textAlign: 'left',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontVariantNumeric: 'tabular-nums',
                                                                color: 'var(--text-muted)',
                                                            }}
                                                        >
                                                            {numberOf(question)}
                                                        </span>
                                                        <span
                                                            style={{
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {labelFor(question)}
                                                        </span>
                                                        <span
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                color: 'var(--text-muted)',
                                                                fontVariantNumeric: 'tabular-nums',
                                                            }}
                                                        >
                                                            {issues.length > 0 && (
                                                                <AlertCircle
                                                                    size={12}
                                                                    style={{ color: 'var(--yellow-text)' }}
                                                                    aria-label={t('tests.issues_title')}
                                                                />
                                                            )}
                                                            {question.points}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })()}

            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onAdd}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            >
                <Plus size={14} /> {t('tests.add_question')}
            </button>
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onOpenSettings}
                data-testid="outline_settings"
                style={{
                    width: '100%',
                    justifyContent: 'center',
                    marginTop: 6,
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                    borderRadius: 0,
                }}
            >
                <Settings size={14} /> {t('tests.settings_title')}
            </button>
        </nav>
    );
}
