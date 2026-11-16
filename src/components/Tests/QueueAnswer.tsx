import type { CSSProperties } from 'react';
import type { TestQuestion } from '../../types';
import { gapCorrectAnswers, renderClozeSegments } from '../../utils/clozeParse';
import { stripHtmlTags } from '../../utils/exportDataPrep';
import { parseClozeAnswers, parsePlacedWords } from '../../utils/answerResponseParsers';
import { sentenceBuilderChunks } from '../../../supabase/functions/_shared/testScoring';
import { formatCorrectAnswer, formatGivenAnswer } from '../../utils/testAnswerText';

const PILL: CSSProperties = {
    display: 'inline-block',
    margin: '0 4px',
    padding: '0 8px',
    borderRadius: 999,
    border: '1px solid var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    fontWeight: 600,
    lineHeight: 1.9,
};

const BLANK_PILL: CSSProperties = {
    ...PILL,
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontWeight: 400,
};

const CLOZE_TYPES: ReadonlySet<TestQuestion['type']> = new Set(['cloze', 'cloze-dropdown', 'cloze-bank']);

interface Props {
    question: TestQuestion;
    /** The stored student response; omit it to render the model answer instead. */
    response?: string;
}

/**
 * Grading-queue rendering of one answer. Cloze gaps and sentence-builder tiles become inline pills so a
 * stored JSON response never reaches the teacher as raw `{"0":"went"}` / `["The","cat"]` text.
 */
export default function QueueAnswer({ question, response }: Props) {
    if (CLOZE_TYPES.has(question.type)) {
        const segments = renderClozeSegments(stripHtmlTags(question.prompt));
        const answers = response === undefined ? {} : parseClozeAnswers(response);
        return (
            <p style={{ margin: 0, lineHeight: 2.4 }}>
                {segments.map((segment, i) => {
                    if (segment.type === 'text') return <span key={i}>{segment.text}</span>;
                    const given = (answers[segment.gap.index] ?? '').trim();
                    const text =
                        response === undefined
                            ? gapCorrectAnswers(segment.gap, question.type === 'cloze-dropdown').join(' / ') || '___'
                            : given || '___';
                    return (
                        <span key={i} style={response === undefined || given ? PILL : BLANK_PILL}>
                            {text}
                        </span>
                    );
                })}
            </p>
        );
    }

    if (question.type === 'sentence-builder') {
        const rows =
            response === undefined
                ? (question.sentenceTargets ?? []).map(sentenceBuilderChunks)
                : [parsePlacedWords(response)];
        return (
            <>
                {rows.map((words, rowIndex) => (
                    <div
                        key={rowIndex}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: rowIndex === 0 ? 0 : 6 }}
                    >
                        {words.length === 0 ? (
                            <span style={BLANK_PILL}>___</span>
                        ) : (
                            words.map((word, i) => (
                                <span key={i} style={PILL}>
                                    {word}
                                </span>
                            ))
                        )}
                    </div>
                ))}
            </>
        );
    }

    if (response === undefined) {
        const model = formatCorrectAnswer(question);
        if (model.trim() !== '') return <span>{model}</span>;
        const accepted = question.expectedAnswers ?? (question.expectedAnswer ? [question.expectedAnswer] : []);
        return <span>{accepted.map(stripHtmlTags).join(' / ')}</span>;
    }

    return <span>{formatGivenAnswer(question, { questionId: question.id, response })}</span>;
}
