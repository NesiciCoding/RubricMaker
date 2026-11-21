import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, ChevronRight, Maximize2, Minimize2, Plus, Settings } from 'lucide-react';
import { plainQuestionPromptText } from '../../utils/clozeParse';
import { htmlToPlainText } from '../../utils/essayUtils';
import { questionTypeLabelKey } from '../../utils/questionTypeKey';
import type { TestQuestion, TestSection } from '../../types';
import ContextMenu, { useContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import MenuButton from '../ui/MenuButton';
import type { BuilderInsights } from '../../utils/builderItemAnalysis';

interface Props {
    sections: TestSection[];
    /** Questions in display order: their index here is the number the card and the outline show. */
    questions: TestQuestion[];
    totalPoints: number;
    issuesByQuestion: Map<string, string[]>;
    /** Graded results of the saved test, keyed by question id; absent while the test has no sittings. */
    insights?: BuilderInsights;
    /** Question shown in the focus pane. */
    activeId?: string | null;
    /** Section whose workspace is open in the focus pane. */
    activeSectionId?: string | null;
    onSelect: (questionId: string) => void;
    /** Actions offered for a question row by right-click (and the ⋯ button on touch); omit for a read-only rail. */
    questionMenu?: (question: TestQuestion) => ContextMenuItem[];
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
    insights,
    activeId,
    activeSectionId,
    onSelect,
    questionMenu,
    onSelectSection,
    onAdd,
    onOpenSettings,
    expanded = false,
    onToggleExpand,
}: Props) {
    const { t } = useTranslation();
    const menu = useContextMenu();
    const [query, setQuery] = useState('');
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [reviewOnlyRequested, setNeedsReviewOnly] = useState(false);
    const treeRef = useRef<HTMLDivElement | null>(null);
    const needle = query.trim().toLowerCase();
    const needsReviewOnly = reviewOnlyRequested && !!insights?.hasData;
    const needsReviewIds = insights?.needsReviewIds ?? new Set<string>();

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
            questions: group.questions.filter((q) => {
                if (
                    needle &&
                    !labelFor(q).toLowerCase().includes(needle) &&
                    !group.title.toLowerCase().includes(needle)
                ) {
                    return false;
                }
                return !needsReviewOnly || needsReviewIds.has(q.id);
            }),
        }))
        // A section with no questions yet is still a section to open — it is the only way to reach
        // its workspace (and its own add-question button) from the rail.
        .filter((group) => group.questions.length > 0 || (!needle && !needsReviewOnly && group.id !== '__none__'));

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

            {insights?.hasData && (
                <button
                    type="button"
                    aria-pressed={needsReviewOnly}
                    data-testid="outline-needs-review"
                    onClick={() => setNeedsReviewOnly((prev) => !prev)}
                    className="btn btn-ghost btn-sm"
                    style={{
                        width: '100%',
                        justifyContent: 'center',
                        marginBottom: 10,
                        fontSize: '0.78rem',
                        border: `1px solid ${needsReviewOnly ? 'var(--accent)' : 'var(--border)'}`,
                        background: needsReviewOnly ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
                    }}
                >
                    {t('tests.builder_insight.needs_review', { total: needsReviewIds.size })}
                </button>
            )}

            {questions.length === 0 && groups.length === 0 && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                    {t('tests.no_questions')}
                </p>
            )}

            {questions.length > 0 && groups.length === 0 && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                    {t(
                        needsReviewOnly && !needle
                            ? 'tests.builder_insight.needs_review_none'
                            : 'tests.outline_no_matches'
                    )}
                </p>
            )}

            {(() => {
                const collapsibleGroupIds = groups
                    .filter((group) => !!onSelectSection && group.id !== '__none__')
                    .map((group) => group.id);
                const visibleQuestionIds = groups
                    .filter((group) => !collapsedSections.has(group.id))
                    .flatMap((group) => group.questions.map((question) => question.id));
                // Exactly one row holds the tab stop — the open question, else the open section, else the
                // first row — so Tab enters the outline once and the arrow keys take over from there.
                const treeTabStop =
                    (activeId && visibleQuestionIds.includes(activeId) ? `q:${activeId}` : undefined) ??
                    (activeSectionId && collapsibleGroupIds.includes(activeSectionId)
                        ? `s:${activeSectionId}`
                        : undefined) ??
                    (visibleQuestionIds[0] ? `q:${visibleQuestionIds[0]}` : undefined) ??
                    (collapsibleGroupIds[0] ? `s:${collapsibleGroupIds[0]}` : undefined);
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
                                                tabIndex={treeTabStop === `s:${group.id}` ? 0 : -1}
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
                                                const insight = insights?.byQuestion.get(question.id);
                                                const openMenu = (event: React.MouseEvent) =>
                                                    menu.open(
                                                        event,
                                                        questionMenu?.(question) ?? [],
                                                        t('tests.outline_menu_label')
                                                    );
                                                return (
                                                    <div
                                                        key={question.id}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 2 }}
                                                        data-longpress={questionMenu ? '' : undefined}
                                                        onContextMenu={questionMenu ? openMenu : undefined}
                                                    >
                                                        <button
                                                            type="button"
                                                            role="treeitem"
                                                            aria-selected={active}
                                                            aria-current={active ? 'true' : undefined}
                                                            tabIndex={treeTabStop === `q:${question.id}` ? 0 : -1}
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
                                                                flex: 1,
                                                                minWidth: 0,
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
                                                                {insight && insight.readings.length > 0 && (
                                                                    <span
                                                                        className="text-xs"
                                                                        data-testid={`outline-reading-${question.id}`}
                                                                        title={insight.readings
                                                                            .map((reading) =>
                                                                                t(
                                                                                    `tests.builder_insight.reading_${reading}`
                                                                                )
                                                                            )
                                                                            .join(' · ')}
                                                                        style={{
                                                                            color: 'var(--yellow-text)',
                                                                            fontWeight: 600,
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                    >
                                                                        {t(
                                                                            `tests.builder_insight.reading_${insight.readings[0]}`
                                                                        )}
                                                                    </span>
                                                                )}
                                                                {question.points}
                                                            </span>
                                                        </button>
                                                        {questionMenu && (
                                                            <MenuButton
                                                                className="menu-touch-only"
                                                                label={t('tests.outline_menu_label')}
                                                                onOpen={openMenu}
                                                            />
                                                        )}
                                                    </div>
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

            {(() => {
                const insight = activeId ? insights?.byQuestion.get(activeId) : undefined;
                if (!insight) return null;
                return (
                    <section
                        aria-labelledby="test-outline-insight"
                        data-testid="outline-insight"
                        style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: '1px solid var(--border)',
                        }}
                    >
                        <h2
                            id="test-outline-insight"
                            className="card-heading"
                            style={{
                                margin: 0,
                                fontSize: '0.72rem',
                                letterSpacing: '0.07em',
                                textTransform: 'uppercase',
                                color: 'var(--text-muted)',
                            }}
                        >
                            {t('tests.builder_insight.title')}
                        </h2>
                        <dl
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr',
                                gap: '2px 8px',
                                margin: '6px 0 0',
                                fontSize: '0.78rem',
                            }}
                        >
                            <dt className="text-muted">{t('tests.builder_insight.n')}</dt>
                            <dd style={{ margin: 0 }}>{insight.sampleSize}</dd>
                            <dt className="text-muted">{t('tests.builder_insight.p_value')}</dt>
                            <dd style={{ margin: 0 }}>{insight.pValue === null ? '—' : insight.pValue.toFixed(2)}</dd>
                            <dt className="text-muted">{t('tests.builder_insight.discrimination')}</dt>
                            <dd style={{ margin: 0 }}>
                                {insight.discrimination === null
                                    ? t('tests.builder_insight.not_measured')
                                    : insight.discrimination.toFixed(2)}
                            </dd>
                        </dl>
                        {insights && insights.classes.length > 0 && (
                            <p className="text-muted text-xs" style={{ margin: '6px 0 0' }}>
                                {t('tests.builder_insight.classes', { classes: insights.classes.join(', ') })}
                            </p>
                        )}
                        <p className="text-xs" style={{ margin: '6px 0 0' }}>
                            {insight.readings.length === 0
                                ? t(
                                      insight.discrimination === null
                                          ? 'tests.builder_insight.on_target_difficulty'
                                          : 'tests.builder_insight.on_target'
                                  )
                                : insight.readings
                                      .map((reading) => t(`tests.builder_insight.explain_${reading}`))
                                      .join(' ')}
                        </p>
                        <p className="text-muted text-xs" style={{ margin: '6px 0 0' }}>
                            {t('tests.builder_insight.min_sample', { total: insights?.minSample ?? 0 })}
                        </p>
                    </section>
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
            <ContextMenu {...menu.menuProps} />
        </nav>
    );
}
