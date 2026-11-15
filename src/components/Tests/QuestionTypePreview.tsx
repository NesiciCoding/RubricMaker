import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { QUESTION_TYPE_SAMPLES } from './questionTypeSamples';
import { MultipleChoiceAnswer, MultipleResponseAnswer } from './ChoiceAnswer';
import TrueFalseAnswer from './TrueFalseAnswer';
import { DictationAnswer, NumericInput, OpenAnswer, ShortAnswerInput } from './TextAnswer';
import ClozeAnswer from './ClozeAnswer';
import MatrixAnswer from './MatrixAnswer';
import MatchingAnswer from './MatchingAnswer';
import OrderingAnswer from './OrderingAnswer';
import CategorizeAnswer from './CategorizeAnswer';
import HotTextAnswer from './HotTextAnswer';
import KeyWordAnswer from './KeyWordAnswer';
import ErrorCorrectionAnswer from './ErrorCorrectionAnswer';
import SentenceBuilderAnswer from './SentenceBuilderAnswer';
import AudioResponseAnswer from './AudioResponseAnswer';
import type { TestQuestion, TestQuestionType } from '../../types';

/** Width the student surface is designed at; everything is scaled down from here. */
export const PREVIEW_WIDTH = 520;

/**
 * Used until the host can be measured. Deliberately below the card's usual width ratio: a preview
 * that is briefly a little small is harmless, one rendered at 1:1 overflows the card and looks
 * like a clipped screenshot.
 */
const UNMEASURED_SCALE = 0.6;

const noop = () => {};

type Renderer = (question: TestQuestion, value: string) => ReactNode;

/**
 * Renders the real answer control for each type. Because these are the app's own components,
 * a change to any of them (or to the design tokens) updates every preview — nothing here is
 * an image that can go stale.
 */
const RENDERERS: Record<TestQuestionType, Renderer> = {
    'multiple-choice': (question, value) => <MultipleChoiceAnswer question={question} value={value} onChange={noop} />,
    'multiple-response': (question, value) => (
        <MultipleResponseAnswer question={question} value={value} onChange={noop} />
    ),
    'true-false': (_question, value) => <TrueFalseAnswer value={value} onChange={noop} />,
    matching: (question, value) => <MatchingAnswer question={question} value={value} onChange={noop} code="preview" />,
    ordering: (question, value) => <OrderingAnswer question={question} value={value} onChange={noop} code="preview" />,
    categorize: (question, value) => (
        <CategorizeAnswer question={question} value={value} onChange={noop} code="preview" />
    ),
    'hot-text': (question, value) => <HotTextAnswer question={question} value={value} onChange={noop} />,
    matrix: (question, value) => <MatrixAnswer question={question} value={value} onChange={noop} />,
    'short-answer': (_question, value) => <ShortAnswerInput value={value} onChange={noop} />,
    numeric: (_question, value) => <NumericInput value={value} onChange={noop} />,
    open: (_question, value) => <OpenAnswer value={value} onChange={noop} />,
    dictation: (_question, value) => <DictationAnswer value={value} onChange={noop} />,
    cloze: (question, value) => <ClozeAnswer question={question} value={value} onChange={noop} code="preview" />,
    'cloze-dropdown': (question, value) => (
        <ClozeAnswer question={question} value={value} onChange={noop} code="preview" />
    ),
    'cloze-bank': (question, value) => <ClozeAnswer question={question} value={value} onChange={noop} code="preview" />,
    'key-word-transformation': (question, value) => <KeyWordAnswer question={question} value={value} onChange={noop} />,
    'error-correction': (question, value) => (
        <ErrorCorrectionAnswer question={question} value={value} onChange={noop} />
    ),
    'sentence-builder': (question, value) => (
        <SentenceBuilderAnswer question={question} value={value} onChange={noop} />
    ),
    'audio-response': (question) => (
        <AudioResponseAnswer
            value=""
            onChange={noop}
            maxRecordingSeconds={question.maxRecordingSeconds ?? 60}
            cueBullets={question.cueBullets}
        />
    ),
};

interface Props {
    type: TestQuestionType;
    /** `card` clips to `maxHeight` for the grid; `full` shows the whole surface for the guide. */
    variant?: 'card' | 'full';
    maxHeight?: number;
}

export default function QuestionTypePreview({ type, variant = 'card', maxHeight = 150 }: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(UNMEASURED_SCALE);
    const [height, setHeight] = useState<number | undefined>(variant === 'card' ? maxHeight : undefined);
    const [clipped, setClipped] = useState(false);
    const [offsetY, setOffsetY] = useState(0);

    useLayoutEffect(() => {
        const host = hostRef.current;
        const inner = innerRef.current;
        /* v8 ignore next -- refs are attached before the layout effect runs */
        if (!host || !inner) return;
        const measure = () => {
            const width = host.clientWidth;
            /* v8 ignore next -- a hidden host measures 0; keep the last known scale rather than guess */
            if (!Number.isFinite(width) || width <= 0) return;
            const next = Math.max(0.2, Math.min(1, width / PREVIEW_WIDTH));
            const contentHeight = inner.offsetHeight * next;
            setScale(next);
            if (variant === 'card') {
                // Cards reserve one height so the grid keeps its rhythm; a short control would
                // otherwise sit against the top edge with a band of empty space below it.
                setHeight(maxHeight);
                setClipped(contentHeight > maxHeight);
                setOffsetY(Math.max(0, Math.round((maxHeight - contentHeight) / 2)));
            } else {
                setHeight(Math.round(contentHeight));
                setClipped(false);
                setOffsetY(0);
            }
        };
        measure();
        // A second pass after paint catches a first read taken before fonts and layout settled.
        const frame = requestAnimationFrame(measure);
        const Observer = (globalThis as { ResizeObserver?: new (callback: () => void) => ResizeObserver })
            .ResizeObserver;
        /* v8 ignore next -- ResizeObserver is missing in the jsdom test environment */
        if (!Observer) return () => cancelAnimationFrame(frame);
        const observer = new Observer(measure);
        observer.observe(host);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [type, variant, maxHeight]);

    const sample = QUESTION_TYPE_SAMPLES[type];

    return (
        <div
            ref={hostRef}
            className={`qtype-preview${variant === 'card' ? ' qtype-preview-card' : ''}${clipped ? ' is-clipped' : ''}`}
            style={height === undefined ? undefined : { height }}
            aria-hidden="true"
        >
            <div
                ref={innerRef}
                className="qtype-preview-inner"
                style={{ transform: `translateY(${offsetY}px) scale(${scale})` }}
            >
                <div className="qtype-preview-surface">{RENDERERS[type](sample.question, sample.value)}</div>
            </div>
        </div>
    );
}
