import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { plainQuestionPromptText } from '../../utils/clozeParse';
import { htmlToPlainText } from '../../utils/essayUtils';
import { questionTypeLabelKey } from '../../utils/questionTypeKey';
import type { TestQuestion, TestSection } from '../../types';

interface Props {
    /** Questions in display order: the index here is the number the switcher shows. */
    questions: TestQuestion[];
    sections: TestSection[];
    activeQuestionId?: string | null;
    /** Section whose workspace is open, so its chip can show as current. */
    activeSectionId?: string | null;
    onSelectQuestion: (questionId: string) => void;
    onSelectSection: (sectionId: string) => void;
    onAdd: () => void;
}

/**
 * The narrow-width answer to the outline rail: one row that selects the question the pane shows.
 * A select rather than a list, so long prompts and the longer German/French labels truncate inside
 * the control instead of reflowing the page.
 */
export default function QuestionSwitcher({
    questions,
    sections,
    activeQuestionId,
    activeSectionId,
    onSelectQuestion,
    onSelectSection,
    onAdd,
}: Props) {
    const { t } = useTranslation();

    const labelFor = (question: TestQuestion) =>
        htmlToPlainText(plainQuestionPromptText(question)).trim() || t(questionTypeLabelKey(question.type));
    const numberOf = (question: TestQuestion) => questions.indexOf(question) + 1;
    const index = questions.findIndex((question) => question.id === activeQuestionId);
    const sectionIds = new Set(sections.map((section) => section.id));
    const groups = [
        {
            id: '__none__',
            title: t('tests.no_section'),
            questions: questions.filter((question) => !question.sectionId || !sectionIds.has(question.sectionId)),
        },
        ...sections.map((section) => ({
            id: section.id,
            title: section.title,
            questions: questions.filter((question) => question.sectionId === section.id),
        })),
    ].filter((group) => group.questions.length > 0);

    return (
        <div
            data-testid="question-switcher"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}
        >
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="switcher-prev"
                aria-label={t('tests.switcher_previous')}
                title={t('tests.switcher_previous')}
                disabled={index <= 0}
                onClick={() => {
                    const previous = questions[index - 1];
                    if (previous) onSelectQuestion(previous.id);
                }}
            >
                <ChevronLeft size={15} />
            </button>

            <select
                id="builder-question-switcher"
                data-testid="switcher-select"
                aria-label={t('tests.switcher_label')}
                value={activeQuestionId ?? ''}
                onChange={(event) => onSelectQuestion(event.target.value)}
                style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%' }}
            >
                {groups.map((group) => (
                    <optgroup key={group.id} label={group.title}>
                        {group.questions.map((question) => (
                            <option key={question.id} value={question.id} title={labelFor(question)}>
                                {`${numberOf(question)}. ${labelFor(question)}`}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>

            <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="switcher-next"
                aria-label={t('tests.switcher_next')}
                title={t('tests.switcher_next')}
                disabled={index < 0 || index >= questions.length - 1}
                onClick={() => {
                    const next = questions[index + 1];
                    if (next) onSelectQuestion(next.id);
                }}
            >
                <ChevronRight size={15} />
            </button>

            <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
                <Plus size={14} /> {t('tests.add_question')}
            </button>

            {sections.length > 0 && (
                <div
                    data-testid="switcher-sections"
                    role="group"
                    aria-label={t('tests.switcher_sections')}
                    style={{
                        display: 'flex',
                        gap: 6,
                        width: '100%',
                        overflowX: 'auto',
                        paddingBottom: 2,
                    }}
                >
                    <span className="text-muted text-xs" style={{ alignSelf: 'center', flexShrink: 0 }}>
                        {t('tests.switcher_sections')}
                    </span>
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            data-testid={`switcher-section-${section.id}`}
                            aria-pressed={section.id === activeSectionId}
                            title={section.title}
                            onClick={() => onSelectSection(section.id)}
                            style={{
                                flexShrink: 0,
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                border:
                                    section.id === activeSectionId
                                        ? '1px solid var(--accent)'
                                        : '1px solid var(--border)',
                            }}
                        >
                            {section.title}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
