import ClozeAnswer from './ClozeAnswer';
import MatrixAnswer from './MatrixAnswer';
import MatchingAnswer from './MatchingAnswer';
import OrderingAnswer from './OrderingAnswer';
import CategorizeAnswer from './CategorizeAnswer';
import HotTextAnswer from './HotTextAnswer';
import { MultipleChoiceAnswer, MultipleResponseAnswer } from './ChoiceAnswer';
import TrueFalseAnswer from './TrueFalseAnswer';
import { DictationAnswer, NumericInput, OpenAnswer, ShortAnswerInput } from './TextAnswer';
import AudioResponseAnswer, { DEFAULT_MAX_RECORDING_SECONDS } from './AudioResponseAnswer';
import ErrorCorrectionAnswer from './ErrorCorrectionAnswer';
import SentenceBuilderAnswer from './SentenceBuilderAnswer';
import KeyWordAnswer from './KeyWordAnswer';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    /** The student's current answer for this question, as the runner stores it. */
    value: string;
    onChange: (value: string) => void;
    /** Seed for shuffled surfaces (matching, ordering, cloze bank). */
    code?: string;
    lang?: string;
    onRecordingChange?: (recording: boolean) => void;
}

/**
 * The answer surface a student gets for a question type. Shared by the student runner and the
 * builder's student-view inspector, so a teacher previews exactly what the class will see.
 */
export default function StudentAnswerSurface({ question, value, onChange, code, lang, onRecordingChange }: Props) {
    const isCloze = question.type === 'cloze' || question.type === 'cloze-dropdown' || question.type === 'cloze-bank';
    const answer = { question, value, onChange, code: code ?? '', lang };

    return (
        <div data-testid="answer-surface">
            {question.type === 'multiple-choice' && <MultipleChoiceAnswer {...answer} />}
            {question.type === 'multiple-response' && <MultipleResponseAnswer {...answer} />}
            {question.type === 'true-false' && (
                <TrueFalseAnswer
                    value={value}
                    onChange={onChange}
                    trueLabel={question.trueLabel}
                    falseLabel={question.falseLabel}
                />
            )}
            {isCloze && <ClozeAnswer {...answer} />}
            {question.type === 'matrix' && <MatrixAnswer {...answer} />}
            {question.type === 'matching' && <MatchingAnswer {...answer} />}
            {question.type === 'categorize' && <CategorizeAnswer {...answer} />}
            {question.type === 'hot-text' && <HotTextAnswer {...answer} />}
            {question.type === 'dictation' && <DictationAnswer value={value} onChange={onChange} lang={lang} />}
            {question.type === 'error-correction' && <ErrorCorrectionAnswer {...answer} />}
            {question.type === 'sentence-builder' && <SentenceBuilderAnswer {...answer} />}
            {question.type === 'key-word-transformation' && <KeyWordAnswer {...answer} />}
            {question.type === 'short-answer' && <ShortAnswerInput value={value} onChange={onChange} lang={lang} />}
            {question.type === 'numeric' && (
                <NumericInput value={value} onChange={onChange} lang={lang} unit={question.numericUnit} />
            )}
            {question.type === 'open' && <OpenAnswer value={value} onChange={onChange} lang={lang} />}
            {question.type === 'ordering' && <OrderingAnswer {...answer} />}
            {question.type === 'audio-response' && (
                <AudioResponseAnswer
                    value={value}
                    lang={lang}
                    onChange={onChange}
                    maxRecordingSeconds={question.maxRecordingSeconds ?? DEFAULT_MAX_RECORDING_SECONDS}
                    prepSeconds={question.prepSeconds}
                    cueBullets={question.cueBullets}
                    onRecordingChange={onRecordingChange}
                />
            )}
        </div>
    );
}
