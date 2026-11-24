import type { TestQuestion } from '../types';

export interface OptionFeedbackLine {
    text: string;
    feedback: string;
}

/** The feedback attached to the options a student actually picked, for the practice-mode review. */
export function pickedOptionFeedback(
    question: Pick<TestQuestion, 'type' | 'options'>,
    response: string
): OptionFeedbackLine[] {
    if (question.type !== 'multiple-choice' && question.type !== 'multiple-response') return [];
    let picked: string[] = [];
    if (question.type === 'multiple-choice') {
        picked = response ? [response] : [];
    } else {
        try {
            const parsed: unknown = response ? JSON.parse(response) : [];
            picked = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
        } catch {
            picked = [];
        }
    }
    return (question.options ?? [])
        .filter((o) => picked.includes(o.id) && o.feedback?.trim())
        .map((o) => ({ text: o.text, feedback: o.feedback!.trim() }));
}
