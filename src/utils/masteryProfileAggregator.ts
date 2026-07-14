import type {
    Test,
    StudentTest,
    Rubric,
    StudentRubric,
    FlashcardDeck,
    FlashcardAssignment,
    FlashcardReview,
    CefrLevel,
} from '../types';
import { GRAMMAR_CATEGORIES } from '../data/grammarStandards';
import { calcEntryPoints } from './gradeCalc';
import { autoScoreResponse } from './testCalc';
import { isMastered } from './flashcardScheduler';
import { State } from 'ts-fsrs';

export interface MasteryTestEvidence {
    attempts: number;
    correctAttempts: number;
    accuracyPct: number;
}

export interface MasteryFlashcardEvidence {
    cardCount: number;
    newCount: number;
    learningCount: number;
    reviewCount: number;
    masteredCount: number;
    dueCount: number;
}

export interface MasteryWritingEvidence {
    /** Number of graded StudentRubric entries observed for a criterion tagged with this grammar item. */
    instances: number;
    avgPct: number;
}

export interface GrammarItemMastery {
    itemId: string;
    level: CefrLevel;
    labelEn: string;
    labelNl: string;
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    test: MasteryTestEvidence | null;
    flashcards: MasteryFlashcardEvidence | null;
    writing: MasteryWritingEvidence | null;
}

export interface MasteryProfileDeps {
    tests: Test[];
    studentTests: StudentTest[];
    rubrics: Rubric[];
    studentRubrics: StudentRubric[];
    flashcardDecks: FlashcardDeck[];
    flashcardAssignments: FlashcardAssignment[];
    flashcardReviews: FlashcardReview[];
}

/** Zero-point questions can't demonstrate a fully-correct answer either way — exclude them, mirroring cefrStudentAggregator's guard. */
function isFullyCorrect(earned: number, question: { points: number }): boolean {
    return question.points > 0 && earned >= question.points;
}

function testEvidenceByItem(
    studentId: string,
    tests: Test[],
    studentTests: StudentTest[]
): Map<string, MasteryTestEvidence> {
    const result = new Map<string, { attempts: number; correct: number }>();
    const testsById = new Map(tests.map((t) => [t.id, t]));

    for (const st of studentTests) {
        if (st.studentId !== studentId) continue;
        const test = testsById.get(st.testId);
        if (!test) continue;
        for (const question of test.questions) {
            if (!question.linkedGrammarItemId) continue;
            const answer = st.answers.find((a) => a.questionId === question.id);
            if (!answer) continue;
            const earned = answer.pointsEarned ?? autoScoreResponse(question, answer.response);
            const entry = result.get(question.linkedGrammarItemId) ?? { attempts: 0, correct: 0 };
            entry.attempts += 1;
            if (isFullyCorrect(earned, question)) entry.correct += 1;
            result.set(question.linkedGrammarItemId, entry);
        }
    }

    const out = new Map<string, MasteryTestEvidence>();
    for (const [itemId, { attempts, correct }] of result) {
        out.set(itemId, {
            attempts,
            correctAttempts: correct,
            accuracyPct: attempts > 0 ? (correct / attempts) * 100 : 0,
        });
    }
    return out;
}

function flashcardEvidenceByItem(
    studentId: string,
    decks: FlashcardDeck[],
    assignments: FlashcardAssignment[],
    reviews: FlashcardReview[]
): Map<string, MasteryFlashcardEvidence> {
    const assignedDeckIds = new Set(assignments.filter((a) => a.studentId === studentId).map((a) => a.deckId));
    const reviewByDeckId = new Map(reviews.filter((r) => r.studentId === studentId).map((r) => [r.deckId, r]));

    const out = new Map<string, MasteryFlashcardEvidence>();
    for (const deck of decks) {
        if (!assignedDeckIds.has(deck.id)) continue;
        const review = reviewByDeckId.get(deck.id);
        for (const card of deck.cards) {
            if (!card.linkedGrammarItemId) continue;
            const entry = out.get(card.linkedGrammarItemId) ?? {
                cardCount: 0,
                newCount: 0,
                learningCount: 0,
                reviewCount: 0,
                masteredCount: 0,
                dueCount: 0,
            };
            entry.cardCount += 1;
            const state = review?.cardStates[card.id];
            if (!state) {
                entry.newCount += 1;
            } else {
                if (new Date(state.due).getTime() <= Date.now()) entry.dueCount += 1;
                if (isMastered(state)) entry.masteredCount += 1;
                else if (state.state === State.Review) entry.reviewCount += 1;
                else if (state.state === State.New) entry.newCount += 1;
                else entry.learningCount += 1;
            }
            out.set(card.linkedGrammarItemId, entry);
        }
    }
    return out;
}

function writingEvidenceByItem(
    studentId: string,
    rubrics: Rubric[],
    studentRubrics: StudentRubric[]
): Map<string, MasteryWritingEvidence> {
    const sums = new Map<string, { total: number; count: number }>();
    const studentRubricsByRubricId = new Map<string, StudentRubric[]>();
    for (const sr of studentRubrics) {
        if (sr.studentId !== studentId || sr.isPeerReview || !sr.gradedAt) continue;
        const list = studentRubricsByRubricId.get(sr.rubricId) ?? [];
        list.push(sr);
        studentRubricsByRubricId.set(sr.rubricId, list);
    }

    for (const rubric of rubrics) {
        const srs = studentRubricsByRubricId.get(rubric.id);
        if (!srs || srs.length === 0) continue;
        for (const criterion of rubric.criteria) {
            const grammarLinks = (criterion.frameworkDescriptors ?? []).filter((d) => d.framework === 'grammar');
            if (grammarLinks.length === 0) continue;
            const maxPts = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
            if (maxPts === 0) continue;
            for (const sr of srs) {
                const entry = sr.entries.find((e) => e.criterionId === criterion.id);
                if (!entry) continue;
                const pct = (calcEntryPoints(entry, criterion) / maxPts) * 100;
                for (const link of grammarLinks) {
                    const s = sums.get(link.descriptorId) ?? { total: 0, count: 0 };
                    s.total += pct;
                    s.count += 1;
                    sums.set(link.descriptorId, s);
                }
            }
        }
    }

    const out = new Map<string, MasteryWritingEvidence>();
    for (const [itemId, { total, count }] of sums) {
        out.set(itemId, { instances: count, avgPct: count > 0 ? total / count : 0 });
    }
    return out;
}

/**
 * Merges test accuracy, flashcard FSRS state, and rubric grammar-descriptor evidence into one
 * row per grammar item — "what does this student actually know" across every domain that tags
 * `GrammarItem.id`. Re-running grammar detection over stored essay/document text is deliberately
 * out of scope here (a fourth, heavier evidence stream) — see the wiki Phase 24.3 note.
 */
export function getStudentMasteryProfile(studentId: string, deps: MasteryProfileDeps): GrammarItemMastery[] {
    const testEvidence = testEvidenceByItem(studentId, deps.tests, deps.studentTests);
    const flashcardEvidence = flashcardEvidenceByItem(
        studentId,
        deps.flashcardDecks,
        deps.flashcardAssignments,
        deps.flashcardReviews
    );
    const writingEvidence = writingEvidenceByItem(studentId, deps.rubrics, deps.studentRubrics);

    const rows: GrammarItemMastery[] = [];
    for (const category of GRAMMAR_CATEGORIES) {
        for (const item of category.items) {
            rows.push({
                itemId: item.id,
                level: item.level,
                labelEn: item.labelEn,
                labelNl: item.labelNl,
                categoryId: category.id,
                categoryLabelEn: category.labelEn,
                categoryLabelNl: category.labelNl,
                test: testEvidence.get(item.id) ?? null,
                flashcards: flashcardEvidence.get(item.id) ?? null,
                writing: writingEvidence.get(item.id) ?? null,
            });
        }
    }
    return rows;
}

/** Rows where at least one evidence stream has data — the useful subset for a summary table. */
export function withEvidenceOnly(rows: GrammarItemMastery[]): GrammarItemMastery[] {
    return rows.filter((r) => r.test || r.flashcards || r.writing);
}
