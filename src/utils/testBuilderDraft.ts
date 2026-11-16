import type { CefrLevel, CefrSkill, QuestionBankSkill, Test, TestQuestion, TestSection } from '../types';

/**
 * Everything the test builder's form owns, as one value. Undo snapshots it and autosave stores it in
 * a local draft; UI state (open panels, column widths, the open question) stays out of it, so undo
 * never moves the layout around.
 */
export interface TestBuilderForm {
    name: Test['name'];
    description: Test['description'];
    questions: TestQuestion[];
    sections: TestSection[];
    durationMinutes: string;
    dueDate: string;
    shuffleQuestions: boolean;
    requireSEB: boolean;
    autoConfirmScores: boolean;
    gradeScaleId: Test['gradeScaleId'];
    normSettings: Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'>;
    mode: NonNullable<Test['mode']>;
    placementEngine: NonNullable<Test['placementEngine']>;
    generatorMinLevel: CefrLevel;
    generatorMaxLevel: CefrLevel;
    generatorSkills: QuestionBankSkill[];
    generatorTags: string[];
    generatorMinQuestions: number;
    generatorMaxQuestions: number;
    generatorStarterBankItemId: string | undefined;
    allowMultipleAttempts: boolean;
    cefrTargetLevel: CefrLevel | '';
    cefrSkill: CefrSkill | '';
    contentArea: 'listening' | 'reading' | 'grammar' | '';
    contentLanguage: string;
    printText: { printHeader?: string; printIntro?: string; printFooter?: string };
}

/** A draft kept on this device only, so a crash or a closed tab cannot lose the last few minutes. */
export interface BuilderDraft {
    /** The stored test's `updatedAt` when the draft was written; a draft never lands on a newer test. */
    baseUpdatedAt: string | null;
    savedAt: string;
    form: TestBuilderForm;
}

export const BUILDER_DRAFT_KEY_PREFIX = 'rm_test_builder_draft:';

/** Drafts of abandoned new-test sessions are unofferable, so they are dropped after this long. */
export const BUILDER_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** One device-local draft per stored test: nothing else can ever land on that test's work. */
export function builderDraftKey(testId: string): string {
    return `${BUILDER_DRAFT_KEY_PREFIX}${testId}`;
}

/**
 * An unsaved test has no id, so its draft is keyed by the id this editing session minted for it —
 * two new tests never offer each other's work, while a reload keeps its own draft (the id rides in
 * the URL).
 */
export function newBuilderDraftKey(draftId: string): string {
    return builderDraftKey(`new-${draftId}`);
}

/**
 * Edits that keep this signature are one undo step, so typing a prompt is one step rather than one
 * per keystroke. A question added, removed, reordered or retyped always starts a new step.
 */
export function builderFormSignature(form: TestBuilderForm): string {
    return [
        form.questions.map((question) => `${question.id}:${question.type}`).join(','),
        form.sections.map((section) => section.id).join(','),
    ].join('|');
}

/**
 * A draft is offered only when it was written on top of the stored version of the test — never when
 * the test itself moved on somewhere else, and never when it holds nothing newer.
 */
export function shouldOfferBuilderDraft(draft: BuilderDraft | null, storedUpdatedAt?: string): draft is BuilderDraft {
    if (!draft) return false;
    if (!storedUpdatedAt) return draft.baseUpdatedAt === null;
    if (draft.baseUpdatedAt !== storedUpdatedAt) return false;
    return Date.parse(draft.savedAt) > Date.parse(storedUpdatedAt);
}
