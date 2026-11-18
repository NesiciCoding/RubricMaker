import type { CefrLevel, Rubric, StudentRubric, StudentTest, Test, VoTrack } from '../types';
import { GRAMMAR_CATEGORIES, grammarItemToFrameworkDescriptor, resolveGrammarItemId } from '../data/grammarStandards';
import { criterionMaxPoints, criterionPercentage } from './gradeCalc';
import { autoScoreResponse } from './testCalc';
import { getQuestionGrammarIds } from './grammarLinks';
import { groupByStudentId } from './groupByStudentId';

/** At or above this percentage a standard counts as secure; below the developing floor it needs work. */
export const GRAMMAR_SECURE_PCT = 70;
export const GRAMMAR_DEVELOPING_PCT = 50;

export type GrammarStatus = 'secure' | 'developing' | 'needs-work' | 'no-evidence';

/**
 * The four level windows a teacher can show. A class opens on the one matching its VO track's CEFR
 * level and can widen to `all` (or switch) from the filter.
 */
export type GrammarLevelBand = 'a1a2' | 'b1' | 'b2plus' | 'all';

const LEVEL_ORDINAL: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

export const GRAMMAR_LEVEL_BANDS: readonly GrammarLevelBand[] = ['a1a2', 'b1', 'b2plus', 'all'];

/** Every standard in the taxonomy, for "x of y assessed" copy that must not change with the band filter. */
export const GRAMMAR_STANDARD_COUNT = GRAMMAR_CATEGORIES.reduce((sum, category) => sum + category.items.length, 0);

export function grammarStatus(pct: number | null): GrammarStatus {
    if (pct === null || !Number.isFinite(pct)) return 'no-evidence';
    if (pct >= GRAMMAR_SECURE_PCT) return 'secure';
    if (pct >= GRAMMAR_DEVELOPING_PCT) return 'developing';
    return 'needs-work';
}

export function isLevelInBand(level: CefrLevel, band: GrammarLevelBand): boolean {
    if (band === 'all') return true;
    if (band === 'a1a2') return LEVEL_ORDINAL[level] <= LEVEL_ORDINAL.A2;
    if (band === 'b1') return level === 'B1';
    return LEVEL_ORDINAL[level] >= LEVEL_ORDINAL.B2;
}

const TRACK_BAND: Record<VoTrack, GrammarLevelBand> = {
    'vmbo-bb': 'a1a2',
    'vmbo-kb': 'a1a2',
    'vmbo-tl': 'b1',
    havo: 'b1',
    vwo: 'b2plus',
};

/** The band matching a VO track's end-of-year CEFR target; no track ⇒ every band. */
export function grammarBandForTrack(track?: VoTrack): GrammarLevelBand {
    return track ? TRACK_BAND[track] : 'all';
}

/**
 * A class with one track opens on that track's band. A heterogeneous class has no single matching
 * level, so it opens on `all` rather than hiding standards half its students still need.
 */
export function grammarBandForClass(tracks: readonly VoTrack[]): GrammarLevelBand {
    if (tracks.length === 0) return 'all';
    const bands = new Set(tracks.map((track) => grammarBandForTrack(track)));
    return bands.size === 1 ? Array.from(bands)[0] : 'all';
}

export interface GrammarEvidenceDeps {
    tests: Test[];
    studentTests: StudentTest[];
    rubrics: Rubric[];
    studentRubrics: StudentRubric[];
}

export interface GrammarStandardRow {
    itemId: string;
    level: CefrLevel;
    labelEn: string;
    labelNl: string;
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    testAttempts: number;
    testCorrect: number;
    testAccuracyPct: number | null;
    writingInstances: number;
    writingAvgPct: number | null;
    /** Mean of the evidence streams this standard has; null when it has none. */
    combinedPct: number | null;
    status: GrammarStatus;
}

export interface GrammarCategoryRow {
    categoryId: string;
    labelEn: string;
    labelNl: string;
    color: string;
    /** Distinct levels of the standards in this row, low to high. */
    levels: CefrLevel[];
    assessedCount: number;
    standardCount: number;
    combinedPct: number | null;
    status: GrammarStatus;
    standards: GrammarStandardRow[];
}

export interface GrammarTargetSummary {
    targetLevel: CefrLevel;
    /** Assessed standards at or below the target level that are secure. */
    secure: number;
    /** Assessed standards at or below the target level. */
    total: number;
}

export interface StudentGrammarOverview {
    categories: GrammarCategoryRow[];
    /** Every standard in the band, flattened — for sorted lists and exports. */
    standards: GrammarStandardRow[];
    assessedCount: number;
    totalStandardCount: number;
    combinedPct: number | null;
    secureCount: number;
    developingCount: number;
    needsWorkCount: number;
    atTarget?: GrammarTargetSummary;
}

export interface GrammarClassStudentRow {
    studentId: string;
    assessedCount: number;
    combinedPct: number | null;
    /** Category id → score for this student, band-filtered. */
    categoryPct: Map<string, number | null>;
    /** Grammar item id → score for this student, band-filtered. */
    standardPct: Map<string, number | null>;
}

export interface GrammarStandardClassRow {
    itemId: string;
    level: CefrLevel;
    labelEn: string;
    labelNl: string;
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    /** Mean of the per-student combined scores; each student weighs the same regardless of attempts. */
    classPct: number | null;
    studentCount: number;
    testAttempts: number;
    testCorrect: number;
    writingInstances: number;
}

export interface GrammarCategoryClassRow {
    categoryId: string;
    labelEn: string;
    labelNl: string;
    color: string;
    levels: CefrLevel[];
    assessedCount: number;
    standardCount: number;
    classPct: number | null;
    status: GrammarStatus;
    standards: GrammarStandardClassRow[];
}

export interface GrammarCategoryHighlight {
    categoryId: string;
    labelEn: string;
    labelNl: string;
    pct: number;
}

export interface ClassGrammarOverview {
    students: GrammarClassStudentRow[];
    categories: GrammarCategoryClassRow[];
    assessedStandardCount: number;
    totalStandardCount: number;
    classAveragePct: number | null;
    /** Standards with a class score below the secure threshold — the reteaching list. */
    belowSecureCount: number;
    strongestCategory: GrammarCategoryHighlight | null;
    weakestCategory: GrammarCategoryHighlight | null;
}

export interface TestGrammarStudentResult {
    studentId: string;
    attempts: number;
    correct: number;
}

export interface TestGrammarStandardRow {
    itemId: string;
    level: CefrLevel;
    labelEn: string;
    labelNl: string;
    categoryId: string;
    categoryLabelEn: string;
    categoryLabelNl: string;
    categoryColor: string;
    /** 1-based positions of the tagged questions in the test. */
    questionNumbers: number[];
    attempts: number;
    correct: number;
    accuracyPct: number | null;
    studentResults: TestGrammarStudentResult[];
}

export interface TestGrammarBreakdown {
    standards: TestGrammarStandardRow[];
    taggedQuestionCount: number;
    totalQuestionCount: number;
    secureCount: number;
    belowSecureCount: number;
}

interface ItemEvidence {
    testAttempts: number;
    testCorrect: number;
    writingSumPct: number;
    writingCount: number;
}

type StudentEvidence = Map<string, ItemEvidence>;

function mean(values: number[]): number | null {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function levelsOf(rows: { level: CefrLevel }[]): CefrLevel[] {
    return Array.from(new Set(rows.map((row) => row.level))).sort((a, b) => LEVEL_ORDINAL[a] - LEVEL_ORDINAL[b]);
}

/**
 * One pass over every test answer and graded rubric criterion that links a grammar standard,
 * grouped per student. Tests only count fully-correct answers on positive-point questions
 * (same guard as the mastery profile); rubric criteria contribute their percentage.
 */
function collectEvidence(studentIds: readonly string[], deps: GrammarEvidenceDeps): Map<string, StudentEvidence> {
    const byStudent = new Map<string, StudentEvidence>();
    for (const studentId of studentIds) byStudent.set(studentId, new Map());

    const accFor = (studentId: string, itemId: string): ItemEvidence => {
        const evidence = byStudent.get(studentId)!;
        const existing = evidence.get(itemId);
        if (existing) return existing;
        const fresh: ItemEvidence = { testAttempts: 0, testCorrect: 0, writingSumPct: 0, writingCount: 0 };
        evidence.set(itemId, fresh);
        return fresh;
    };

    const testById = new Map((deps.tests ?? []).map((test) => [test.id, test]));
    const testsByStudent = groupByStudentId(deps.studentTests ?? [], (st) => st.studentId);
    for (const studentId of byStudent.keys()) {
        for (const studentTest of testsByStudent.get(studentId) ?? []) {
            if (studentTest.status === 'in_progress') continue;
            const test = testById.get(studentTest.testId);
            if (!test) continue;
            const answers = new Map(studentTest.answers.map((answer) => [answer.questionId, answer]));
            for (const question of test.questions) {
                const grammarIds = getQuestionGrammarIds(question);
                if (grammarIds.length === 0) continue;
                const answer = answers.get(question.id);
                if (!answer) continue;
                const earned = answer.pointsEarned ?? autoScoreResponse(question, answer.response);
                const fullyCorrect = question.points > 0 && earned >= question.points;
                for (const rawId of grammarIds) {
                    // Saved links can still point at an id retired when a descriptor was split.
                    const itemId = resolveGrammarItemId(rawId);
                    const acc = accFor(studentId, itemId);
                    acc.testAttempts += 1;
                    if (fullyCorrect) acc.testCorrect += 1;
                }
            }
        }
    }

    const rubricById = new Map((deps.rubrics ?? []).map((rubric) => [rubric.id, rubric]));
    const rubricsByStudent = groupByStudentId(deps.studentRubrics ?? [], (sr) => sr.studentId);
    for (const studentId of byStudent.keys()) {
        for (const studentRubric of rubricsByStudent.get(studentId) ?? []) {
            if (studentRubric.isPeerReview || !studentRubric.gradedAt) continue;
            const rubric = studentRubric.rubricSnapshot ?? rubricById.get(studentRubric.rubricId);
            if (!rubric) continue;
            for (const criterion of rubric.criteria) {
                if (criterionMaxPoints(criterion) === 0) continue;
                const links = (criterion.frameworkDescriptors ?? []).filter(
                    (descriptor) => descriptor.framework === 'grammar'
                );
                if (links.length === 0) continue;
                const entry = studentRubric.entries.find((candidate) => candidate.criterionId === criterion.id);
                if (!entry) continue;
                const pct = criterionPercentage(entry, criterion);
                const seen = new Set<string>();
                for (const link of links) {
                    if (seen.has(link.descriptorId)) continue;
                    seen.add(link.descriptorId);
                    const acc = accFor(studentId, link.descriptorId);
                    acc.writingSumPct += pct;
                    acc.writingCount += 1;
                }
            }
        }
    }

    return byStudent;
}

function buildStandardRow(
    item: { id: string; level: CefrLevel; labelEn: string; labelNl: string },
    category: { id: string; labelEn: string; labelNl: string; color: string },
    acc: ItemEvidence | undefined
): GrammarStandardRow {
    const testAccuracyPct = acc && acc.testAttempts > 0 ? (acc.testCorrect / acc.testAttempts) * 100 : null;
    const writingAvgPct = acc && acc.writingCount > 0 ? acc.writingSumPct / acc.writingCount : null;
    const combinedPct = mean([testAccuracyPct, writingAvgPct].filter((value): value is number => value !== null));
    return {
        itemId: item.id,
        level: item.level,
        labelEn: item.labelEn,
        labelNl: item.labelNl,
        categoryId: category.id,
        categoryLabelEn: category.labelEn,
        categoryLabelNl: category.labelNl,
        categoryColor: category.color,
        testAttempts: acc?.testAttempts ?? 0,
        testCorrect: acc?.testCorrect ?? 0,
        testAccuracyPct,
        writingInstances: acc?.writingCount ?? 0,
        writingAvgPct,
        combinedPct,
        status: grammarStatus(combinedPct),
    };
}

export function getStudentGrammarOverview(
    studentId: string,
    deps: GrammarEvidenceDeps,
    options: { band?: GrammarLevelBand; targetLevel?: CefrLevel } = {}
): StudentGrammarOverview {
    const band = options.band ?? 'all';
    const evidence = collectEvidence([studentId], deps).get(studentId) ?? new Map<string, ItemEvidence>();

    // Row building runs over the whole taxonomy once; the band only narrows what the caller renders,
    // so the summary cards and the at-target count stay stable while a teacher switches bands.
    const allRows: GrammarStandardRow[] = [];
    const categories: GrammarCategoryRow[] = [];
    for (const category of GRAMMAR_CATEGORIES) {
        const rows = category.items.map((item) => buildStandardRow(item, category, evidence.get(item.id)));
        allRows.push(...rows);

        const bandRows = rows.filter((row) => isLevelInBand(row.level, band));
        if (bandRows.length === 0) continue;
        const assessed = bandRows.filter((row) => row.combinedPct !== null);
        const combinedPct = mean(assessed.map((row) => row.combinedPct!));
        categories.push({
            categoryId: category.id,
            labelEn: category.labelEn,
            labelNl: category.labelNl,
            color: category.color,
            levels: levelsOf(bandRows),
            assessedCount: assessed.length,
            standardCount: bandRows.length,
            combinedPct,
            status: grammarStatus(combinedPct),
            standards: bandRows,
        });
    }

    const assessedRows = allRows.filter((row) => row.combinedPct !== null);
    const atTarget = options.targetLevel
        ? (() => {
              const inScope = assessedRows.filter(
                  (row) => LEVEL_ORDINAL[row.level] <= LEVEL_ORDINAL[options.targetLevel!]
              );
              return {
                  targetLevel: options.targetLevel!,
                  secure: inScope.filter((row) => row.status === 'secure').length,
                  total: inScope.length,
              };
          })()
        : undefined;

    return {
        categories,
        standards: allRows.filter((row) => isLevelInBand(row.level, band)),
        assessedCount: assessedRows.length,
        totalStandardCount: allRows.length,
        combinedPct: mean(assessedRows.map((row) => row.combinedPct!)),
        secureCount: allRows.filter((row) => row.status === 'secure').length,
        developingCount: allRows.filter((row) => row.status === 'developing').length,
        needsWorkCount: allRows.filter((row) => row.status === 'needs-work').length,
        atTarget,
    };
}

export function getClassGrammarOverview(
    studentIds: readonly string[],
    deps: GrammarEvidenceDeps,
    options: { band?: GrammarLevelBand } = {}
): ClassGrammarOverview {
    const band = options.band ?? 'all';
    const evidenceByStudent = collectEvidence(studentIds, deps);

    const students: GrammarClassStudentRow[] = studentIds.map((studentId) => {
        const evidence = evidenceByStudent.get(studentId) ?? new Map<string, ItemEvidence>();
        const standardPct = new Map<string, number | null>();
        const categoryPct = new Map<string, number | null>();
        let assessedCount = 0;

        for (const category of GRAMMAR_CATEGORIES) {
            const rows = category.items.map((item) => buildStandardRow(item, category, evidence.get(item.id)));
            for (const row of rows) {
                if (!isLevelInBand(row.level, band)) continue;
                standardPct.set(row.itemId, row.combinedPct);
                if (row.combinedPct !== null) assessedCount += 1;
            }
            const bandRows = rows.filter((row) => isLevelInBand(row.level, band));
            categoryPct.set(
                category.id,
                mean(bandRows.map((row) => row.combinedPct).filter((value): value is number => value !== null))
            );
        }

        return {
            studentId,
            assessedCount,
            combinedPct: mean(Array.from(standardPct.values()).filter((value): value is number => value !== null)),
            categoryPct,
            standardPct,
        };
    });

    const classRowsByItem = new Map<string, GrammarStandardClassRow>();
    const allCategoryRows: GrammarCategoryClassRow[] = [];

    for (const category of GRAMMAR_CATEGORIES) {
        const classRows: GrammarStandardClassRow[] = [];
        for (const item of category.items) {
            const perStudent = studentIds
                .map((studentId) => ({
                    studentId,
                    evidence: evidenceByStudent.get(studentId)?.get(item.id),
                }))
                .filter((entry) => entry.evidence !== undefined);

            const scores = perStudent
                .map((entry) => buildStandardRow(item, category, entry.evidence).combinedPct)
                .filter((value): value is number => value !== null);

            const classRow: GrammarStandardClassRow = {
                itemId: item.id,
                level: item.level,
                labelEn: item.labelEn,
                labelNl: item.labelNl,
                categoryId: category.id,
                categoryLabelEn: category.labelEn,
                categoryLabelNl: category.labelNl,
                categoryColor: category.color,
                classPct: mean(scores),
                studentCount: scores.length,
                testAttempts: perStudent.reduce((sum, entry) => sum + (entry.evidence?.testAttempts ?? 0), 0),
                testCorrect: perStudent.reduce((sum, entry) => sum + (entry.evidence?.testCorrect ?? 0), 0),
                writingInstances: perStudent.reduce((sum, entry) => sum + (entry.evidence?.writingCount ?? 0), 0),
            };
            classRowsByItem.set(item.id, classRow);
            classRows.push(classRow);
        }

        const assessed = classRows.filter((row) => row.classPct !== null);
        const classPct = mean(assessed.map((row) => row.classPct!));
        allCategoryRows.push({
            categoryId: category.id,
            labelEn: category.labelEn,
            labelNl: category.labelNl,
            color: category.color,
            levels: levelsOf(classRows),
            assessedCount: assessed.length,
            standardCount: classRows.length,
            classPct,
            status: grammarStatus(classPct),
            standards: classRows.filter((row) => isLevelInBand(row.level, band)),
        });
    }

    const categories = allCategoryRows.filter((category) => category.standards.length > 0);
    const allClassRows = Array.from(classRowsByItem.values());
    const assessedClassRows = allClassRows.filter((row) => row.classPct !== null);

    const scoredCategories = allCategoryRows.filter((category) => category.classPct !== null);
    const sortedByScore = [...scoredCategories].sort((a, b) => a.classPct! - b.classPct!);
    const highlight = (category: GrammarCategoryClassRow): GrammarCategoryHighlight => ({
        categoryId: category.categoryId,
        labelEn: category.labelEn,
        labelNl: category.labelNl,
        pct: category.classPct!,
    });

    return {
        students,
        categories,
        assessedStandardCount: assessedClassRows.length,
        totalStandardCount: allClassRows.length,
        classAveragePct: mean(assessedClassRows.map((row) => row.classPct!)),
        belowSecureCount: assessedClassRows.filter((row) => row.classPct! < GRAMMAR_SECURE_PCT).length,
        weakestCategory: sortedByScore.length > 0 ? highlight(sortedByScore[0]) : null,
        strongestCategory: sortedByScore.length > 0 ? highlight(sortedByScore[sortedByScore.length - 1]) : null,
    };
}

/**
 * Per-standard accuracy for one test across a class, with each student's own result so the panel
 * can show both "the class missed this" and "this student got it".
 */
export function getTestGrammarBreakdown(test: Test, studentTests: StudentTest[]): TestGrammarBreakdown {
    interface Acc {
        questionNumbers: Set<number>;
        perStudent: Map<string, { attempts: number; correct: number }>;
    }

    const accByItem = new Map<string, Acc>();
    let taggedQuestionCount = 0;

    test.questions.forEach((question, index) => {
        const grammarIds = getQuestionGrammarIds(question).map(resolveGrammarItemId);
        if (grammarIds.length === 0) return;
        taggedQuestionCount += 1;

        for (const studentTest of studentTests) {
            if (studentTest.testId !== test.id || studentTest.status === 'in_progress') continue;
            const answer = studentTest.answers.find((candidate) => candidate.questionId === question.id);
            if (!answer) continue;
            const earned = answer.pointsEarned ?? autoScoreResponse(question, answer.response);
            const fullyCorrect = question.points > 0 && earned >= question.points;

            for (const itemId of grammarIds) {
                const acc = accByItem.get(itemId) ?? { questionNumbers: new Set<number>(), perStudent: new Map() };
                acc.questionNumbers.add(index + 1);
                const studentAcc = acc.perStudent.get(studentTest.studentId) ?? { attempts: 0, correct: 0 };
                studentAcc.attempts += 1;
                if (fullyCorrect) studentAcc.correct += 1;
                acc.perStudent.set(studentTest.studentId, studentAcc);
                accByItem.set(itemId, acc);
            }
        }
    });

    const standards: TestGrammarStandardRow[] = [];
    for (const [itemId, acc] of accByItem) {
        const descriptor = grammarItemToFrameworkDescriptor(itemId);
        if (!descriptor) continue;
        const studentResults: TestGrammarStudentResult[] = Array.from(acc.perStudent.entries()).map(
            ([studentId, result]) => ({ studentId, attempts: result.attempts, correct: result.correct })
        );
        const attempts = studentResults.reduce((sum, result) => sum + result.attempts, 0);
        const correct = studentResults.reduce((sum, result) => sum + result.correct, 0);
        standards.push({
            itemId,
            level: descriptor.level ?? 'A1',
            labelEn: descriptor.descriptionEn,
            labelNl: descriptor.descriptionNl,
            categoryId: descriptor.categoryId,
            categoryLabelEn: descriptor.categoryLabelEn,
            categoryLabelNl: descriptor.categoryLabelNl,
            categoryColor: descriptor.categoryColor,
            questionNumbers: Array.from(acc.questionNumbers).sort((a, b) => a - b),
            attempts,
            correct,
            accuracyPct: attempts > 0 ? (correct / attempts) * 100 : null,
            studentResults,
        });
    }

    const scored = standards.filter((row) => row.accuracyPct !== null);
    return {
        standards,
        taggedQuestionCount,
        totalQuestionCount: test.questions.length,
        secureCount: scored.filter((row) => row.accuracyPct! >= GRAMMAR_SECURE_PCT).length,
        belowSecureCount: scored.filter((row) => row.accuracyPct! < GRAMMAR_SECURE_PCT).length,
    };
}
