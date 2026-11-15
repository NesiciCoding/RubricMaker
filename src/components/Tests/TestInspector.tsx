import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, GraduationCap } from 'lucide-react';
import RichContent from '../Editor/RichContent';
import TestA4Preview, { type PrintTextFields } from './TestA4Preview';
import StudentAnswerSurface from './StudentAnswerSurface';
import QuestionStimulus from './QuestionStimulus';
import type { Test, TestQuestion } from '../../types';

type InspectorTab = 'paper' | 'question';

const TABS: InspectorTab[] = ['paper', 'question'];

interface Props {
    test: Test;
    onPrintTextChange: (patch: PrintTextFields) => void;
    /** Question open in the focus pane; the student-view tab previews it. */
    question?: TestQuestion | null;
    questionNumber?: number;
    questionCount: number;
    /** Effective content language of the question being previewed. */
    lang?: string;
}

/**
 * The builder's right-hand column: the printed paper (rendered by the existing A4 preview, with its
 * zoom, answer key, points and print controls) and a student view of the open question. It never
 * edits the test except for the paper's own header/intro/footer text.
 */
export default function TestInspector({
    test,
    onPrintTextChange,
    question,
    questionNumber,
    questionCount,
    lang,
}: Props) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<InspectorTab>('paper');
    /** The preview answer is local to the inspector: clicking through a question never edits the test. */
    const [previewAnswer, setPreviewAnswer] = useState<{ id: string; value: string }>({ id: '', value: '' });
    const answer = previewAnswer.id === (question?.id ?? '') ? previewAnswer.value : '';

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
                role="tablist"
                aria-label={t('tests.inspector_title')}
                style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}
            >
                {[
                    { id: 'paper' as const, labelKey: 'tests.inspector_paper', Icon: FileText },
                    { id: 'question' as const, labelKey: 'tests.inspector_question', Icon: GraduationCap },
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
                        <RichContent html={question.prompt} className="rm-question-prompt" lang={lang ?? 'en'} />
                        <QuestionStimulus question={question} lang={lang} />
                        <StudentAnswerSurface
                            question={question}
                            value={answer}
                            onChange={(value) => setPreviewAnswer({ id: question.id, value })}
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
        </div>
    );
}
