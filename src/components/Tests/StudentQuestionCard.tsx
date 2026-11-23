import { useTranslation } from 'react-i18next';
import HelpPopover from './HelpPopover';
import PassageReadAloud from './PassageReadAloud';
import QuestionStimulus from './QuestionStimulus';
import StudentAnswerSurface from './StudentAnswerSurface';
import RichContent from '../Editor/RichContent';
import { renderClozeSegments } from '../../utils/clozeParse';
import { clozeInstructionKey, questionTypeHelpKey } from '../../utils/questionTypeKey';
import { htmlToPlainText } from '../../hooks/useTTS';
import { plainInlineScript } from '../../utils/inlineScript';
import type { TestQuestion } from '../../types';

export interface StudentQuestionCardProps {
    question: TestQuestion;
    index: number;
    total: number;
    value: string;
    onChange: (value: string) => void;
    code: string;
    onRecordingChange?: (recording: boolean) => void;
    /** True for an adaptive (staircase) run, where the total question count isn't known ahead of time */
    hideTotal?: boolean;
    /** Per-student read-aloud accommodation gate (roadmap Phase 44, §6.2) — practice mode is always allowed regardless. */
    readAloudAllowed?: boolean;
    /** BCP-47 base language code for read-aloud voice selection. */
    lang?: string;
    audioPlays?: number;
    onAudioPlay?: (count: number) => void;
}

/** Plain read-aloud text for a question's prompt + options — cloze gaps become `blankWord` rather
 * than their answer, so a graded cloze's read-aloud accommodation can't hand out the answer. */
export function speakableQuestionText(question: TestQuestion, blankWord: string): string {
    const promptText = ['cloze', 'cloze-dropdown', 'cloze-bank'].includes(question.type)
        ? renderClozeSegments(question.prompt)
              .map((s) => (s.type === 'gap' ? blankWord : s.text))
              .join('')
        : htmlToPlainText(question.prompt);
    const optionsText = (question.options ?? []).map((o) => plainInlineScript(o.text)).join('. ');
    return [promptText, optionsText].filter(Boolean).join('. ');
}

/**
 * The question card a student answers in the runner. Extracted so the builder's student-view preview
 * can be rendered from the same component tree in tests, instead of a hand-copied stand-in.
 */
export default function StudentQuestionCard({
    question,
    index,
    total,
    value,
    onChange,
    code,
    onRecordingChange,
    hideTotal,
    readAloudAllowed,
    lang,
    audioPlays = 0,
    onAudioPlay,
}: StudentQuestionCardProps) {
    const { t } = useTranslation();
    const isCloze = question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank';
    return (
        <div
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
            }}
        >
            {readAloudAllowed && (
                <PassageReadAloud
                    contentHtml={speakableQuestionText(question, t('tests.taking.cloze_blank_spoken'))}
                    lang={lang ?? 'en'}
                />
            )}
            <div
                style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--accent-text)',
                    marginBottom: 8,
                    letterSpacing: '0.05em',
                }}
            >
                {hideTotal
                    ? t('tests.taking.question_label_no_total', { current: index + 1 })
                    : t('tests.taking.question_label', { current: index + 1, total })}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    margin: '0 0 16px',
                    fontSize: '1rem',
                    lineHeight: 1.6,
                    color: 'var(--text)',
                }}
            >
                {isCloze ? (
                    <p style={{ margin: 0 }}>{t(clozeInstructionKey(question.type))}</p>
                ) : (
                    <RichContent html={question.prompt} className="rm-question-prompt" lang={lang ?? 'en'} />
                )}
                {(question.type === 'true-false' ||
                    question.type === 'multiple-response' ||
                    question.type === 'matching' ||
                    question.type === 'ordering' ||
                    question.type === 'categorize' ||
                    question.type === 'hot-text' ||
                    question.type === 'matrix' ||
                    isCloze) && (
                    <HelpPopover title={t(questionTypeHelpKey(question.type, 'student', 'title'))}>
                        {t(questionTypeHelpKey(question.type, 'student', 'body'))}
                    </HelpPopover>
                )}
            </div>

            <QuestionStimulus question={question} lang={lang} plays={audioPlays} onPlay={onAudioPlay} />

            <StudentAnswerSurface
                question={question}
                value={value}
                onChange={onChange}
                code={code}
                lang={lang}
                onRecordingChange={onRecordingChange}
            />
        </div>
    );
}
