import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, GraduationCap, KeyRound, Maximize2, Minimize2 } from 'lucide-react';
import RichContent from '../Editor/RichContent';
import TestA4Preview, { type PrintTextFields } from './TestA4Preview';
import StudentAnswerSurface from './StudentAnswerSurface';
import QuestionStimulus from './QuestionStimulus';
import { clozeInstructionKey } from '../../utils/questionTypeKey';
import { formatCorrectAnswer } from '../../utils/testAnswerText';
import type { Test, TestQuestion } from '../../types';

type InspectorTab = 'paper' | 'question' | 'answers';

const TABS: InspectorTab[] = ['paper', 'question', 'answers'];

interface Props {
    test: Test;
    onPrintTextChange: (patch: PrintTextFields) => void;
    /** Question open in the focus pane; the student-view tab previews it. */
    question?: TestQuestion | null;
    questionNumber?: number;
    questionCount: number;
    /** Effective content language of the question being previewed. */
    lang?: string;
    /** True when the inspector already has the whole pane. */
    expanded?: boolean;
    /** Only present in the wide layout: the sheet has its own close button. */
    onToggleExpand?: () => void;
}

/** One labelled block of the answer-key tab. */
function AnswerLine({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="text-muted text-xs">{label}</span>
            <div>{children}</div>
        </div>
    );
}

/**
 * The builder's right-hand column: the printed paper (rendered by the existing A4 preview, with its
 * zoom, answer key, points and print controls), a student view of the open question, and that
 * question's answer key. It never edits the test except for the paper's own header/intro/footer text.
 *
 * All three tabs are teacher-only: the test builder is the only surface that mounts this component,
 * so the key is never reachable from a student route.
 */
export default function TestInspector({
    test,
    onPrintTextChange,
    question,
    questionNumber,
    questionCount,
    lang,
    expanded = false,
    onToggleExpand,
}: Props) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<InspectorTab>('paper');
    /**
     * The preview answer and play count are local to the inspector: clicking through a question never
     * edits the test. Both are keyed by the question's identity *and* its type, because a type change
     * keeps the id but replaces the answer surface that would understand the old value.
     */
    const [previewAnswer, setPreviewAnswer] = useState<{
        id: string;
        type: TestQuestion['type'] | '';
        value: string;
    }>({ id: '', type: '', value: '' });
    const [previewPlays, setPreviewPlays] = useState<{ id: string; count: number }>({ id: '', count: 0 });
    const answer =
        question && previewAnswer.id === question.id && previewAnswer.type === question.type ? previewAnswer.value : '';
    const plays = question && previewPlays.id === question.id ? previewPlays.count : 0;
    /** The model answer as the grading key states it; '' for types graded by hand or against a rubric. */
    const answerKey = question ? formatCorrectAnswer(question) : '';

    const panelId = (id: InspectorTab) => `test-inspector-${id}`;
    const tabRefs = useRef<Partial<Record<InspectorTab, HTMLButtonElement | null>>>({});

    /** Arrow keys move between tabs, Home/End jump to the ends — the WAI-ARIA tabs keyboard pattern. */
    const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: InspectorTab) => {
        const index = TABS.indexOf(id);
        let next: InspectorTab | undefined;
        if (event.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length];
        else if (event.key === 'ArrowLeft') next = TABS[(index - 1 + TABS.length) % TABS.length];
        else if (event.key === 'Home') next = TABS[0];
        else if (event.key === 'End') next = TABS[TABS.length - 1];
        if (!next) return;
        event.preventDefault();
        setTab(next);
        tabRefs.current[next]?.focus();
    };

    return (
        <div data-testid="inspector" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: 6,
                }}
            >
                <div
                    role="tablist"
                    aria-label={t('tests.inspector_title')}
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}
                >
                    {[
                        { id: 'paper' as const, labelKey: 'tests.inspector_paper', Icon: FileText },
                        { id: 'question' as const, labelKey: 'tests.inspector_question', Icon: GraduationCap },
                        { id: 'answers' as const, labelKey: 'tests.inspector_answers', Icon: KeyRound },
                    ].map(({ id, labelKey, Icon }) => {
                        const active = tab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                id={`test-inspector-tab-${id}`}
                                aria-selected={active}
                                aria-controls={panelId(id)}
                                tabIndex={active ? 0 : -1}
                                data-testid={`inspector-tab-${id}`}
                                ref={(element) => {
                                    tabRefs.current[id] = element;
                                }}
                                onClick={() => setTab(id)}
                                onKeyDown={(event) => handleTabKeyDown(event, id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '5px 9px',
                                    borderRadius: 999,
                                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                                    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
                                    color: 'var(--text)',
                                    font: 'inherit',
                                    fontSize: '0.8rem',
                                    fontWeight: active ? 600 : 400,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <Icon size={13} />
                                {t(labelKey)}
                            </button>
                        );
                    })}
                </div>
                {onToggleExpand && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={onToggleExpand}
                        aria-label={expanded ? t('tests.inspector_restore') : t('tests.inspector_expand')}
                        title={expanded ? t('tests.inspector_restore') : t('tests.inspector_expand')}
                        data-testid="inspector_expand"
                        style={{ marginLeft: 'auto' }}
                    >
                        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                )}
            </div>

            <div
                role="tabpanel"
                id={panelId('paper')}
                aria-labelledby="test-inspector-tab-paper"
                hidden={tab !== 'paper'}
            >
                <div data-testid="a4-pane">
                    <TestA4Preview test={test} onChange={onPrintTextChange} />
                </div>
            </div>

            <div
                role="tabpanel"
                id={panelId('question')}
                aria-labelledby="test-inspector-tab-question"
                hidden={tab !== 'question'}
                data-testid="inspector-student-view"
            >
                {question ? (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: 14,
                            background: 'var(--bg-elevated)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span className="text-muted text-xs">
                                {t('tests.question_number', { number: questionNumber ?? 1 })} / {questionCount}
                            </span>
                            <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>
                                {t('tests.points_total', { count: question.points })}
                            </span>
                        </div>
                        {question.type === 'cloze' ||
                        question.type === 'cloze-dropdown' ||
                        question.type === 'cloze-bank' ? (
                            <p style={{ margin: 0 }}>{t(clozeInstructionKey(question.type))}</p>
                        ) : (
                            <RichContent html={question.prompt} className="rm-question-prompt" lang={lang ?? 'en'} />
                        )}
                        <QuestionStimulus
                            question={question}
                            lang={lang}
                            plays={plays}
                            onPlay={(count) => setPreviewPlays({ id: question.id, count })}
                        />
                        <StudentAnswerSurface
                            key={question.id}
                            question={question}
                            value={answer}
                            onChange={(value) => setPreviewAnswer({ id: question.id, type: question.type, value })}
                            lang={lang}
                        />
                        <p className="text-muted text-xs" style={{ margin: 0 }}>
                            {t('tests.inspector_preview_note')}
                        </p>
                    </div>
                ) : (
                    <p className="text-muted text-sm" style={{ margin: 0 }}>
                        {t('tests.inspector_no_question')}
                    </p>
                )}
            </div>

            <div
                role="tabpanel"
                id={panelId('answers')}
                aria-labelledby="test-inspector-tab-answers"
                hidden={tab !== 'answers'}
                data-testid="inspector-answers"
            >
                {question ? (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: 14,
                            background: 'var(--bg-elevated)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span className="text-muted text-xs">
                                {t('tests.question_number', { number: questionNumber ?? 1 })} / {questionCount}
                            </span>
                            <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>
                                {t('tests.points_total', { count: question.points })}
                            </span>
                        </div>
                        <AnswerLine label={t('tests.inspector_answers_key')}>
                            {answerKey ? (
                                <span style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>{answerKey}</span>
                            ) : (
                                <span className="text-muted text-sm">{t('tests.inspector_answers_none')}</span>
                            )}
                        </AnswerLine>
                        {question.hint && (
                            <AnswerLine label={t('tests.inspector_answers_hint')}>
                                <span>{question.hint}</span>
                            </AnswerLine>
                        )}
                        {question.explanation && (
                            <AnswerLine label={t('tests.inspector_answers_explanation')}>
                                <RichContent html={question.explanation} lang={lang ?? 'en'} />
                            </AnswerLine>
                        )}
                    </div>
                ) : (
                    <p className="text-muted text-sm" style={{ margin: 0 }}>
                        {t('tests.inspector_no_question')}
                    </p>
                )}
            </div>
        </div>
    );
}
