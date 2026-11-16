import { describe, it, expect } from 'vitest';
import {
    builderDraftKey,
    builderFormSignature,
    newBuilderDraftKey,
    shouldOfferBuilderDraft,
    type BuilderDraft,
    type TestBuilderForm,
} from './testBuilderDraft';

function form(overrides: Partial<TestBuilderForm> = {}): TestBuilderForm {
    return {
        name: 'Reading check',
        description: '',
        questions: [
            { id: 'q1', prompt: 'One', type: 'multiple-choice', points: 1 },
            { id: 'q2', prompt: 'Two', type: 'short-answer', points: 1 },
        ],
        sections: [{ id: 's1', title: 'Part 1' }],
        durationMinutes: '45',
        dueDate: '',
        shuffleQuestions: false,
        requireSEB: false,
        autoConfirmScores: true,
        gradeScaleId: undefined,
        normSettings: {},
        mode: 'assessment',
        placementEngine: 'mst',
        generatorMinLevel: 'A1',
        generatorMaxLevel: 'C2',
        generatorSkills: [],
        generatorTags: [],
        generatorMinQuestions: 5,
        generatorMaxQuestions: 12,
        generatorStarterBankItemId: undefined,
        allowMultipleAttempts: false,
        cefrTargetLevel: '',
        cefrSkill: '',
        contentArea: '',
        contentLanguage: '',
        printText: {},
        ...overrides,
    };
}

function draft(overrides: Partial<BuilderDraft> = {}): BuilderDraft {
    return {
        baseUpdatedAt: '2024-01-01T10:00:00.000Z',
        savedAt: '2024-01-01T10:05:00.000Z',
        form: form(),
        ...overrides,
    };
}

describe('builderDraftKey', () => {
    it('is per stored test', () => {
        expect(builderDraftKey('t1')).not.toBe(builderDraftKey('t2'));
        expect(builderDraftKey('t1')).toContain('t1');
    });

    it('gives every unsaved test its own draft, so two new tests never share one', () => {
        expect(newBuilderDraftKey('session-a')).not.toBe(newBuilderDraftKey('session-b'));
        expect(newBuilderDraftKey('session-a')).not.toBe(builderDraftKey('session-a'));
    });
});

describe('builderFormSignature', () => {
    it('ignores content edits so a typing burst is one step', () => {
        const edited = form({ name: 'Renamed', description: 'Notes' });
        edited.questions = [{ ...edited.questions[0], prompt: 'One, reworded' }, edited.questions[1]];
        expect(builderFormSignature(edited)).toBe(builderFormSignature(form()));
    });

    it('changes when a question is added, removed, reordered or retyped', () => {
        const base = builderFormSignature(form());
        expect(builderFormSignature(form({ questions: [form().questions[1]] }))).not.toBe(base);
        expect(builderFormSignature(form({ questions: [...form().questions].reverse() }))).not.toBe(base);
        const retyped = form();
        retyped.questions = [{ ...retyped.questions[0], type: 'true-false' }, retyped.questions[1]];
        expect(builderFormSignature(retyped)).not.toBe(base);
        expect(builderFormSignature(form({ sections: [] }))).not.toBe(base);
    });
});

describe('shouldOfferBuilderDraft', () => {
    it('never offers nothing', () => {
        expect(shouldOfferBuilderDraft(null, '2024-01-01T10:00:00.000Z')).toBe(false);
        expect(shouldOfferBuilderDraft(null)).toBe(false);
    });

    it('offers a newer draft written on top of the stored version', () => {
        expect(shouldOfferBuilderDraft(draft(), '2024-01-01T10:00:00.000Z')).toBe(true);
    });

    it('refuses when the stored test moved on, so a newer version is never overwritten', () => {
        expect(shouldOfferBuilderDraft(draft(), '2024-01-01T11:00:00.000Z')).toBe(false);
        expect(
            shouldOfferBuilderDraft(draft({ baseUpdatedAt: '2024-01-01T09:00:00.000Z' }), '2024-01-01T10:00:00.000Z')
        ).toBe(false);
    });

    it('refuses a draft that holds nothing newer than the saved test', () => {
        expect(
            shouldOfferBuilderDraft(draft({ savedAt: '2024-01-01T10:00:00.000Z' }), '2024-01-01T10:00:00.000Z')
        ).toBe(false);
    });

    it('offers a draft of a test that was never saved', () => {
        expect(shouldOfferBuilderDraft(draft({ baseUpdatedAt: null }))).toBe(true);
        // A draft from an existing test can never live under the new test's key.
        expect(shouldOfferBuilderDraft(draft())).toBe(false);
    });
});
