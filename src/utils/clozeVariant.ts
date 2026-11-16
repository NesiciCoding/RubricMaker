import { nanoid } from './nanoid';
import { clozeGapToSyntax, gapCorrectAnswers, matchClozeGaps, parseClozeGaps } from './clozeParse';
import { suggestDistractors } from './distractorSuggestions';
import type { TestQuestion } from '../types';

export type ClozeVariantKind = 'dropdown' | 'bank';

const CLOZE_TYPES = new Set(['cloze', 'cloze-dropdown', 'cloze-bank']);
const DISTRACTORS_PER_GAP = 2;

function distractorsFor(answer: string, correct: string[]): string[] {
    const taken = new Set(correct.map((c) => c.trim().toLowerCase()));
    const found: string[] = [];
    for (const suggestion of suggestDistractors(answer)) {
        if (taken.has(suggestion.word)) continue;
        found.push(suggestion.word);
        if (found.length >= DISTRACTORS_PER_GAP) break;
    }
    return found;
}

/**
 * A duplicated, easier copy of a cloze question: half the gaps are filled in for the student, and
 * every remaining gap is answered from options — a dropdown (`cloze-dropdown`) or a shared word box
 * (`cloze-bank`). Distractors come from the existing deterministic suggestion sources (word forms,
 * EFL confusables, same-level words), never generated text. Points are copied unchanged, so the two
 * versions stay comparable.
 *
 * A gap with too few options to be a real choice is filled in rather than left as a one-option
 * list. Returns null when the question is not a cloze, has no gaps, or nothing would be simplified.
 */
export function buildEasierClozeVariant(question: TestQuestion, kind: ClozeVariantKind): TestQuestion | null {
    if (!CLOZE_TYPES.has(question.type)) return null;
    const matches = matchClozeGaps(question.prompt);
    if (matches.length === 0) return null;
    const legacyFirstOnly = question.type === 'cloze-dropdown';
    const maxGaps = Math.max(1, Math.ceil(matches.length / 2));

    let prompt = question.prompt;
    let kept = 0;
    const bankDistractors: string[] = [];

    for (let i = matches.length - 1; i >= 0; i--) {
        const { gap, start, end } = matches[i];
        const correct = gapCorrectAnswers(gap, legacyFirstOnly);
        const shouldKeep = i % 2 === 0 && kept < maxGaps;
        const options = shouldKeep && kind === 'dropdown' ? distractorsFor(correct[0] ?? '', correct) : [];
        if (!shouldKeep || (kind === 'dropdown' && options.length === 0)) {
            prompt = `${prompt.slice(0, start)}${correct[0] ?? ''}${prompt.slice(end)}`;
            continue;
        }
        kept += 1;
        if (kind === 'bank') {
            bankDistractors.push(...distractorsFor(correct[0] ?? '', correct));
        }
        const alternatives = kind === 'dropdown' ? [...correct, ...options] : correct;
        const roles = alternatives.map((_, index) =>
            index < correct.length ? ('correct' as const) : ('wrong' as const)
        );
        prompt = `${prompt.slice(0, start)}${clozeGapToSyntax({
            index: i,
            alternatives,
            ...(kind === 'dropdown' ? { roles } : {}),
        })}${prompt.slice(end)}`;
    }

    if (kept === 0) return null;
    return {
        ...question,
        id: nanoid(),
        type: kind === 'dropdown' ? 'cloze-dropdown' : 'cloze-bank',
        prompt,
        points: question.points,
        variantOfQuestionId: question.id,
        wordFormation: undefined,
        eloRating: undefined,
        bankDistractors: kind === 'bank' ? [...new Set(bankDistractors)] : undefined,
        bankUniqueUse: kind === 'bank' ? true : undefined,
    };
}

/** True when the question is a cloze this builder could simplify; used to decide whether to offer the action. */
export function canBuildEasierClozeVariant(question: TestQuestion): boolean {
    return CLOZE_TYPES.has(question.type) && parseClozeGaps(question.prompt).length > 0;
}
