import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Maximize2, Minimize2, Plus, Settings } from 'lucide-react';
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

            {groups.map((group) => {
                const sectionActive = group.id === activeSectionId;
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
                    <div key={group.id} style={{ marginBottom: 10 }}>
                        {onSelectSection && group.id !== '__none__' ? (
                            <button
                                type="button"
                                onClick={() => onSelectSection(group.id)}
                                aria-current={sectionActive ? 'true' : undefined}
                                title={group.title}
                                data-testid={`outline-section-${group.id}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    width: '100%',
                                    margin: '0 0 4px',
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
                        {group.questions.map((question) => {
                            const active = question.id === activeId;
                            const issues = issuesByQuestion.get(question.id) ?? [];
                            return (
                                <button
                                    key={question.id}
                                    type="button"
                                    onClick={() => onSelect(question.id)}
                                    title={labelFor(question)}
                                    data-testid={`outline-question-${question.id}`}
                                    aria-current={active ? 'true' : undefined}
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
                                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
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
                );
            })}

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
