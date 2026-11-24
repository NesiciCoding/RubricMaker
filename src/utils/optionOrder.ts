import { seededShuffle } from './seededShuffle';
import type { TestOption, TestQuestion } from '../types';

/** The options in the order a student sees them: authored order, or a per-student shuffle with the last one optionally pinned. */
export function displayOptions(
    question: Pick<TestQuestion, 'id' | 'options' | 'shuffleOptions' | 'pinLastOption'>,
    code: string
): TestOption[] {
    const options = question.options ?? [];
    if (!question.shuffleOptions || options.length < 2) return options;
    const pinned = question.pinLastOption ? options[options.length - 1] : undefined;
    const movable = pinned ? options.slice(0, -1) : options;
    const shuffled = seededShuffle(movable, `${code}-${question.id}-options`);
    return pinned ? [...shuffled, pinned] : shuffled;
}
