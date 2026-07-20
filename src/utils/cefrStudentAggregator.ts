import type {
    CefrLevel,
    CefrSkill,
    CefrVocabProfile,
    CefrGrammarProfile,
    DocumentAnalysisResult,
    Rubric,
    StudentRubric,
    SelfAssessment,
    LinkedStandard,
    SchoolYear,
    VoTrack,
    CefrSubLevelRange,
    Test,
    StudentTest,
} from '../types';
import { CEFR_DESCRIPTORS, CEFR_SKILLS } from '../data/cefrDescriptors';
import { getCefrTargetRange } from '../data/cefrTrackYearTargets';
import { compareToRange, cefrLevelOrdinal, type ProgressStatus } from './cefrOrdinal';
import { calcGradeSummary, criterionMaxPoints } from './gradeCalc';
import { profileText } from './cefrVocabularyProfiler';
import { profileGrammar } from './grammarChecker';
import { autoScoreResponse, calcStudentTestRawPoints, calcTestMaxPoints, calcTestPercentage } from './testCalc';
import { estimatePlacement, type PlacementPathStep } from './placementResult';

/** Highest level with data for one skill, preferring 'achieved' over 'developing' over 'not_started'. */
export function highestLevelForSkill(cells: CefrCellData[], skill: CefrSkill): CefrLevel | null {
    const skillCells = cells.filter((c) => c.skill === skill && ((c.rubricCount ?? 0) > 0 || c.totalDescriptors > 0));
    if (skillCells.length === 0) return null;
    const achieved = skillCells.filter((c) => c.state === 'achieved');
    const pool = achieved.length > 0 ? achieved : skillCells;
    return pool.reduce<CefrLevel>(
        (best, c) => (cefrLevelOrdinal(c.level) > cefrLevelOrdinal(best) ? c.level : best),
        pool[0].level
    );
}

/** Lowest of each skill's highest achieved/developing level — surfaces the weakest skill first. */
export function overallLevel(cells: CefrCellData[], skills: CefrSkill[] = CEFR_SKILLS): CefrLevel | null {
    const perSkill = skills.map((sk) => highestLevelForSkill(cells, sk)).filter((l): l is CefrLevel => l !== null);
    if (perSkill.length === 0) return null;
    return perSkill.reduce<CefrLevel>(
        (worst, l) => (cefrLevelOrdinal(l) < cefrLevelOrdinal(worst) ? l : worst),
        perSkill[0]
    );
}

export interface CefrTrackYearProgress {
    year: SchoolYear;
    voTrack?: VoTrack;
    expectedRange?: CefrSubLevelRange;
    /** Weakest-skill-first achieved level across all skills with rubric/self-assessment data. */
    achievedLevel: CefrLevel | null;
    status: ProgressStatus;
}

// Module-level cache so repeated getCefrStudentOverview calls (e.g. on navigation)
// don't re-run NLP on the same extracted text
const profileCache = new Map<string, { vocab: CefrVocabProfile; grammar: CefrGrammarProfile }>();

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CefrCellDescriptor {
    descriptorId: string;
    descriptionEn: string;
    descriptionNl: string;
    confidentInSelfAssess: boolean;
}

export interface CefrCellEvidence {
    sourceType: 'rubric' | 'test';
    sourceId: string;
    sourceName: string;
    gradedAt: string;
    score: number;
    threshold: number;
}

/**
 * Practice-mode test progress for one CEFR skill/level, kept entirely separate from
 * `CefrCellData` — practice attempts are formative and must never blend into or overwrite
 * the graded achieved-level chart (rubrics + assessment-mode tests only).
 */
export interface PracticeCefrCell {
    skill: CefrSkill;
    level: CefrLevel;
    attemptCount: number;
    avgScore: number;
    bestScore: number;
    lastAttemptAt: string;
}

export interface CefrCellData {
    skill: CefrSkill;
    level: CefrLevel;
    // Rubric side
    rubricCount: number;
    avgScore: number;
    threshold: number;
    rubricAchieved: boolean;
    evidence: CefrCellEvidence[];
    // Self-assessment side
    totalDescriptors: number;
    confidentCount: number;
    confidenceRate: number;
    // Combined
    state: 'achieved' | 'developing' | 'not-started';
    descriptors: CefrCellDescriptor[];
    // Text profile (from document analysis, when available)
    textVocabEstimate?: CefrLevel;
    textGrammarEstimate?: CefrLevel;
}

export interface StandardCellScore {
    guid: string;
    statementNotation?: string;
    description: string;
    standardSetTitle: string;
    jurisdictionTitle: string;
    rubricCount: number;
    avgScore: number;
}

export interface StandardSetGroup {
    setTitle: string;
    standards: StandardCellScore[];
}

/**
 * Most recent placement-test estimate for a student (roadmap Phase 25.2) — always
 * provisional, kept entirely separate from `cells`/`practiceCefrProgress` so it can
 * never render or aggregate as an assessed level.
 */
export interface CefrPlacementEstimate {
    level: CefrLevel;
    testId: string;
    testName: string;
    assessedAt: string;
    path: PlacementPathStep[];
}

export interface CefrStudentOverview {
    cells: CefrCellData[];
    cellMap: Map<string, CefrCellData>;
    standardSets: StandardSetGroup[];
    skillsWithRubricData: number;
    overallConfidenceRate: number;
    standardsCovered: number;
    /** Present only when schoolYear was supplied to getCefrStudentOverview. */
    trackYearProgress?: CefrTrackYearProgress;
    /** Practice-mode test progress, kept separate from `cells` — see PracticeCefrCell. */
    practiceCefrProgress: PracticeCefrCell[];
    /** Most recent placement-test estimate, when one exists — see CefrPlacementEstimate. */
    placement?: CefrPlacementEstimate;
}

// ─── Internal accumulator shape ───────────────────────────────────────────────

interface CellAccumulator {
    skill: CefrSkill;
    level: CefrLevel;
    scores: number[];
    thresholds: number[];
    /** True when at least one graded rubric level was directly tagged with this CEFR level. Overrides percentage averaging for achieved status. */
    directlyAchieved: boolean;
    // descriptorId → confident (last-write wins across multiple self-assessments)
    confidenceByDescriptor: Map<string, boolean>;
    evidence: CefrCellEvidence[];
}

interface StandardAccumulator {
    standard: LinkedStandard;
    totalEarned: number;
    totalMax: number;
    rubricIds: Set<string>;
}

// ─── Descriptor lookup map (built once) ───────────────────────────────────────

const DESCRIPTOR_MAP = new Map(CEFR_DESCRIPTORS.map((d) => [d.id, d]));

/**
 * Aggregates a student's CEFR rubric results, self-assessments, linked standards, and optional document-based text profiles into a consolidated overview.
 *
 * @param studentId - The student identifier to aggregate data for
 * @param studentRubrics - All student rubric snapshots/records (graded entries are used)
 * @param rubrics - Canonical rubric definitions used to resolve snapshots or rubric references
 * @param selfAssessments - Self-assessment records used to compute descriptor-level confidence (last-write wins for duplicate ratings)
 * @param analysisResults - Optional document analysis results used to derive per-cell vocabulary and grammar CEFR estimates; the highest estimated level per cell is kept
 * @returns A `CefrStudentOverview` containing:
 *  - `cells`: array of per-CEFR-cell data (scores, thresholds, descriptor confidence, optional text estimates),
 *  - `cellMap`: mapping of `"skill__level"` → corresponding cell,
 *  - `standardSets`: grouped standard aggregate scores,
 *  - `skillsWithRubricData`: count of cells with rubric data,
 *  - `overallConfidenceRate`: percentage of descriptors the student marked confident,
 *  - `standardsCovered`: number of distinct linked standards found
 */

export function getCefrStudentOverview(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[],
    selfAssessments: SelfAssessment[],
    analysisResults?: DocumentAnalysisResult[],
    schoolYear?: SchoolYear,
    voTrack?: VoTrack,
    tests: Test[] = [],
    studentTests: StudentTest[] = []
): CefrStudentOverview {
    const cellAccMap = new Map<string, CellAccumulator>();
    const standardAccMap = new Map<string, StandardAccumulator>();
    const practiceAccMap = new Map<
        string,
        { skill: CefrSkill; level: CefrLevel; scores: number[]; lastAttemptAt: string }
    >();

    // ── Step 1: rubric scores ──────────────────────────────────────────────────

    const graded = studentRubrics.filter((sr) => sr.studentId === studentId && sr.gradedAt);

    for (const sr of graded) {
        const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
        if (!rubric) continue;

        // CEFR cell aggregation
        if (rubric.cefrTargetLevel) {
            const skill: CefrSkill = rubric.cefrSkill ?? 'writing';
            const level: CefrLevel = rubric.cefrTargetLevel;
            const key = `${skill}__${level}`;
            const summary = calcGradeSummary(sr, rubric.criteria, null, rubric);

            if (!cellAccMap.has(key)) {
                cellAccMap.set(key, {
                    skill,
                    level,
                    scores: [],
                    thresholds: [],
                    directlyAchieved: false,
                    confidenceByDescriptor: new Map(),
                    evidence: [],
                });
            }
            const acc = cellAccMap.get(key)!;
            const threshold = rubric.cefrAchieveThreshold ?? 70;
            acc.scores.push(summary.modifiedPercentage);
            acc.thresholds.push(threshold);
            acc.evidence.push({
                sourceType: 'rubric',
                sourceId: sr.rubricId,
                sourceName: rubric.name,
                gradedAt: sr.gradedAt!,
                score: summary.modifiedPercentage,
                threshold,
            });
        }

        // ── Per-criterion/level CEFR aggregation ──────────────────────────────
        // If individual RubricLevels carry a cefrLevel tag, use that directly.
        // Being graded at a tagged level is unconditionally "achieved" regardless of score averaging.
        for (const entry of sr.entries) {
            if (!entry.levelId) continue;
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            if (!criterion) continue;
            const selectedLevel = criterion.levels.find((l) => l.id === entry.levelId);
            if (!selectedLevel?.cefrLevel) continue;

            const skill: CefrSkill = criterion.cefrSkill ?? rubric.cefrSkill ?? 'writing';
            const level: CefrLevel = selectedLevel.cefrLevel;
            const key = `${skill}__${level}`;

            if (!cellAccMap.has(key)) {
                cellAccMap.set(key, {
                    skill,
                    level,
                    scores: [],
                    thresholds: [],
                    directlyAchieved: false,
                    confidenceByDescriptor: new Map(),
                    evidence: [],
                });
            }
            // Flag this cell as directly achieved — not subject to percentage averaging.
            cellAccMap.get(key)!.directlyAchieved = true;
        }

        // Standards aggregation (mirrors learningGoalsAggregator pattern)
        const pointsEarned = new Map<string, number>();
        const pointsMax = new Map<string, number>();
        const standardInfo = new Map<string, LinkedStandard>();

        for (const entry of sr.entries) {
            const criterion = rubric.criteria.find((c) => c.id === entry.criterionId);
            if (!criterion) continue;

            const activeStandards = new Map<string, LinkedStandard>();
            if (criterion.linkedStandard) activeStandards.set(criterion.linkedStandard.guid, criterion.linkedStandard);
            criterion.linkedStandards?.forEach((s) => activeStandards.set(s.guid, s));

            const selectedLevel = criterion.levels.find((l) => l.id === entry.levelId);
            let criterionEarned = 0;
            let criterionMax = 0;

            if (entry.overridePoints !== undefined) {
                criterionEarned = entry.overridePoints;
                criterionMax = criterionMaxPoints(criterion);
                activeStandards.forEach((std) => {
                    standardInfo.set(std.guid, std);
                    pointsEarned.set(std.guid, (pointsEarned.get(std.guid) ?? 0) + criterionEarned);
                    pointsMax.set(std.guid, (pointsMax.get(std.guid) ?? 0) + criterionMax);
                });
            } else if (selectedLevel && selectedLevel.subItems?.length > 0) {
                selectedLevel.subItems.forEach((si) => {
                    const siMax = si.maxPoints ?? si.points ?? 0;
                    let siEarned = 0;
                    if (entry.subItemScores?.[si.id] !== undefined) {
                        siEarned = entry.subItemScores[si.id];
                    } else if (entry.checkedSubItems.includes(si.id)) {
                        siEarned = si.points ?? siMax;
                    }
                    if (si.linkedStandards?.length) {
                        si.linkedStandards.forEach((std) => {
                            standardInfo.set(std.guid, std);
                            pointsEarned.set(std.guid, (pointsEarned.get(std.guid) ?? 0) + siEarned);
                            pointsMax.set(std.guid, (pointsMax.get(std.guid) ?? 0) + siMax);
                        });
                    } else {
                        activeStandards.forEach((std) => {
                            standardInfo.set(std.guid, std);
                            pointsEarned.set(std.guid, (pointsEarned.get(std.guid) ?? 0) + siEarned);
                            pointsMax.set(std.guid, (pointsMax.get(std.guid) ?? 0) + siMax);
                        });
                    }
                });
            } else if (selectedLevel) {
                criterionEarned = entry.selectedPoints ?? selectedLevel.minPoints;
                criterionMax = criterionMaxPoints(criterion);
                activeStandards.forEach((std) => {
                    standardInfo.set(std.guid, std);
                    pointsEarned.set(std.guid, (pointsEarned.get(std.guid) ?? 0) + criterionEarned);
                    pointsMax.set(std.guid, (pointsMax.get(std.guid) ?? 0) + criterionMax);
                });
            }
        }

        pointsEarned.forEach((earned, guid) => {
            const max = pointsMax.get(guid) ?? 0;
            if (max === 0) return;
            const std = standardInfo.get(guid)!;
            if (!standardAccMap.has(guid)) {
                standardAccMap.set(guid, {
                    standard: std,
                    totalEarned: 0,
                    totalMax: 0,
                    rubricIds: new Set(),
                });
            }
            const acc = standardAccMap.get(guid)!;
            acc.totalEarned += earned;
            acc.totalMax += max;
            acc.rubricIds.add(sr.rubricId);
        });
    }

    // ── Step 1b: test scores ───────────────────────────────────────────────────
    // Mirrors Step 1's rubric handling: mode === 'assessment' tests feed the same graded
    // cellAccMap (same precedence as rubrics — a cefrTargetLevel/cefrSkill pair is required,
    // no guessed default skill since a test's skill isn't implied the way 'writing' is for an
    // ungraded rubric). mode === 'practice' tests are accumulated entirely separately into
    // practiceAccMap and never touch cellAccMap — see the module doc on PracticeCefrCell.
    // mode === 'placement' tests skip this pipeline entirely — see Step 1c below.

    const studentTestsForStudent = studentTests.filter(
        (st) => st.studentId === studentId && (st.status === 'submitted' || st.status === 'graded')
    );

    for (const st of studentTestsForStudent) {
        const test = tests.find((tst) => tst.id === st.testId);
        if (!test || test.mode === 'placement' || !test.cefrTargetLevel || !test.cefrSkill) continue;

        const maxPoints = calcTestMaxPoints(test);
        if (maxPoints <= 0) continue;
        const rawPoints = st.rawTotalPoints ?? calcStudentTestRawPoints(test, st.answers);
        const scorePct = calcTestPercentage(rawPoints, maxPoints);

        if (test.mode === 'practice') {
            const key = `${test.cefrSkill}__${test.cefrTargetLevel}`;
            if (!practiceAccMap.has(key)) {
                practiceAccMap.set(key, {
                    skill: test.cefrSkill,
                    level: test.cefrTargetLevel,
                    scores: [],
                    lastAttemptAt: st.submittedAt ?? st.startedAt,
                });
            }
            const pAcc = practiceAccMap.get(key)!;
            pAcc.scores.push(scorePct);
            const attemptAt = st.submittedAt ?? st.startedAt;
            if (attemptAt > pAcc.lastAttemptAt) pAcc.lastAttemptAt = attemptAt;
            continue;
        }

        // Assessment mode: same graded pipeline rubrics use.
        const skill = test.cefrSkill;
        const level = test.cefrTargetLevel;
        const key = `${skill}__${level}`;
        if (!cellAccMap.has(key)) {
            cellAccMap.set(key, {
                skill,
                level,
                scores: [],
                thresholds: [],
                directlyAchieved: false,
                confidenceByDescriptor: new Map(),
                evidence: [],
            });
        }
        const acc = cellAccMap.get(key)!;
        const threshold = 70;
        acc.scores.push(scorePct);
        acc.thresholds.push(threshold);
        acc.evidence.push({
            sourceType: 'test',
            sourceId: st.testId,
            sourceName: test.name,
            gradedAt: st.submittedAt ?? st.startedAt,
            score: scorePct,
            threshold,
        });

        // Per-question direct achievement — mirrors Step 1's per-criterion cefrLevel tag:
        // a fully-correct answer on a question tagged with a CEFR descriptor unconditionally
        // achieves that descriptor's own skill/level cell, regardless of the test's overall score.
        for (const q of test.questions) {
            if (!q.linkedCefrDescriptors?.length) continue;
            const answer = st.answers.find((a) => a.questionId === q.id);
            if (!answer) continue;
            const earned = answer.pointsEarned ?? autoScoreResponse(q, answer.response);
            if (q.points <= 0 || earned < q.points) continue;
            for (const desc of q.linkedCefrDescriptors) {
                const qKey = `${desc.skill}__${desc.level}`;
                if (!cellAccMap.has(qKey)) {
                    cellAccMap.set(qKey, {
                        skill: desc.skill,
                        level: desc.level,
                        scores: [],
                        thresholds: [],
                        directlyAchieved: false,
                        confidenceByDescriptor: new Map(),
                        evidence: [],
                    });
                }
                cellAccMap.get(qKey)!.directlyAchieved = true;
            }
        }
    }

    // ── Step 1c: placement estimate ───────────────────────────────────────────
    // Entirely separate pipeline from Step 1b — a placement result is a provisional
    // CEFR estimate (see estimatePlacement), never a graded or formative data point.
    // Only the most recent placement submission is kept.

    let placement: CefrPlacementEstimate | undefined;
    for (const st of studentTestsForStudent) {
        const test = tests.find((tst) => tst.id === st.testId);
        if (!test || test.mode !== 'placement') continue;
        const estimate = estimatePlacement(test, st);
        if (!estimate) continue;
        const assessedAt = st.submittedAt ?? st.startedAt;
        if (!placement || assessedAt > placement.assessedAt) {
            placement = {
                level: estimate.level,
                testId: test.id,
                testName: test.name,
                assessedAt,
                path: estimate.path,
            };
        }
    }

    // ── Step 2: self-assessment confidence ────────────────────────────────────

    const studentSAs = selfAssessments.filter((sa) => sa.studentId === studentId);

    for (const sa of studentSAs) {
        for (const rating of sa.ratings) {
            const key = `${rating.skill}__${rating.level}`;
            if (!cellAccMap.has(key)) {
                cellAccMap.set(key, {
                    skill: rating.skill,
                    level: rating.level,
                    scores: [],
                    thresholds: [],
                    directlyAchieved: false,
                    confidenceByDescriptor: new Map(),
                    evidence: [],
                });
            }
            // Last-write wins for same descriptor across multiple self-assessments
            cellAccMap.get(key)!.confidenceByDescriptor.set(rating.descriptorId, rating.confident);
        }
    }

    // ── Step 2b: text profiling from document analysis results ────────────────

    // Maps cell key → highest estimated levels from any analysis result for that cell
    const textVocabMap = new Map<string, CefrLevel>();
    const textGrammarMap = new Map<string, CefrLevel>();

    if (analysisResults?.length) {
        const studentAnalyses = analysisResults.filter((ar) => ar.studentId === studentId && ar.extractedText);
        for (const ar of studentAnalyses) {
            const sr = graded.find((r) => r.rubricId === ar.rubricId);
            if (!sr) continue;
            const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
            if (!rubric?.cefrTargetLevel) continue;
            const key = `${rubric.cefrSkill ?? 'writing'}__${rubric.cefrTargetLevel}`;
            let cached = profileCache.get(ar.extractedText);
            if (!cached) {
                cached = { vocab: profileText(ar.extractedText), grammar: profileGrammar(ar.extractedText) };
                profileCache.set(ar.extractedText, cached);
            }
            const vocabProfile = cached.vocab;
            const grammarProfile = cached.grammar;
            const prevVocab = textVocabMap.get(key);
            if (!prevVocab || cefrLevelOrdinal(vocabProfile.estimatedLevel) > cefrLevelOrdinal(prevVocab)) {
                textVocabMap.set(key, vocabProfile.estimatedLevel);
            }
            const prevGrammar = textGrammarMap.get(key);
            if (!prevGrammar || cefrLevelOrdinal(grammarProfile.estimatedLevel) > cefrLevelOrdinal(prevGrammar)) {
                textGrammarMap.set(key, grammarProfile.estimatedLevel);
            }
        }
    }

    // ── Step 3: build CefrCellData from accumulators ──────────────────────────

    const cells: CefrCellData[] = Array.from(cellAccMap.values()).map((acc) => {
        const rubricCount = acc.scores.length;
        const avgScore = rubricCount > 0 ? acc.scores.reduce((a, b) => a + b, 0) / rubricCount : 0;
        const threshold =
            acc.thresholds.length > 0 ? acc.thresholds.reduce((a, b) => a + b, 0) / acc.thresholds.length : 70;
        // directlyAchieved overrides score averaging — being graded at a tagged level always counts as achieved.
        const rubricAchieved = acc.directlyAchieved || (rubricCount > 0 && avgScore >= threshold);

        const descriptors: CefrCellDescriptor[] = Array.from(acc.confidenceByDescriptor.entries()).map(
            ([descriptorId, confident]) => {
                const d = DESCRIPTOR_MAP.get(descriptorId);
                return {
                    descriptorId,
                    descriptionEn: d?.descriptionEn ?? descriptorId,
                    descriptionNl: d?.descriptionNl ?? descriptorId,
                    confidentInSelfAssess: confident,
                };
            }
        );

        const totalDescriptors = descriptors.length;
        const confidentCount = descriptors.filter((d) => d.confidentInSelfAssess).length;
        const confidenceRate = totalDescriptors > 0 ? (confidentCount / totalDescriptors) * 100 : 0;

        const state: CefrCellData['state'] = rubricAchieved
            ? 'achieved'
            : rubricCount > 0
              ? 'developing'
              : 'not-started';

        const cellKey = `${acc.skill}__${acc.level}`;
        const evidence = [...acc.evidence].sort(
            (a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime()
        );
        return {
            skill: acc.skill,
            level: acc.level,
            rubricCount,
            avgScore,
            threshold,
            rubricAchieved,
            evidence,
            totalDescriptors,
            confidentCount,
            confidenceRate,
            state,
            descriptors,
            textVocabEstimate: textVocabMap.get(cellKey),
            textGrammarEstimate: textGrammarMap.get(cellKey),
        };
    });

    const cellMap = new Map(cells.map((c) => [`${c.skill}__${c.level}`, c]));

    // ── Step 4: build StandardSetGroup[] ──────────────────────────────────────

    const setGroupMap = new Map<string, StandardSetGroup>();
    standardAccMap.forEach((acc) => {
        const avgScore = acc.totalMax > 0 ? (acc.totalEarned / acc.totalMax) * 100 : 0;
        const score: StandardCellScore = {
            guid: acc.standard.guid,
            statementNotation: acc.standard.statementNotation,
            description: acc.standard.description,
            standardSetTitle: acc.standard.standardSetTitle,
            jurisdictionTitle: acc.standard.jurisdictionTitle,
            rubricCount: acc.rubricIds.size,
            avgScore,
        };
        const setTitle = acc.standard.standardSetTitle;
        if (!setGroupMap.has(setTitle)) {
            setGroupMap.set(setTitle, { setTitle, standards: [] });
        }
        setGroupMap.get(setTitle)!.standards.push(score);
    });

    const standardSets = Array.from(setGroupMap.values()).sort((a, b) => a.setTitle.localeCompare(b.setTitle));

    // ── Step 5: summary stats ─────────────────────────────────────────────────

    const skillsWithRubricData = cells.filter((c) => c.rubricCount > 0).length;
    const standardsCovered = standardAccMap.size;

    const allDescriptors = cells.flatMap((c) => c.descriptors);
    const overallConfidenceRate =
        allDescriptors.length > 0
            ? (allDescriptors.filter((d) => d.confidentInSelfAssess).length / allDescriptors.length) * 100
            : 0;

    let trackYearProgress: CefrTrackYearProgress | undefined;
    if (schoolYear) {
        const expectedRange = getCefrTargetRange(schoolYear, voTrack);
        const achievedLevel = overallLevel(cells);
        trackYearProgress = {
            year: schoolYear,
            voTrack,
            expectedRange,
            achievedLevel,
            status: expectedRange ? compareToRange(achievedLevel ?? undefined, expectedRange) : 'no-data',
        };
    }

    const practiceCefrProgress: PracticeCefrCell[] = Array.from(practiceAccMap.values()).map((acc) => ({
        skill: acc.skill,
        level: acc.level,
        attemptCount: acc.scores.length,
        avgScore: acc.scores.reduce((a, b) => a + b, 0) / acc.scores.length,
        bestScore: Math.max(...acc.scores),
        lastAttemptAt: acc.lastAttemptAt,
    }));

    return {
        cells,
        cellMap,
        standardSets,
        skillsWithRubricData,
        overallConfidenceRate,
        practiceCefrProgress,
        standardsCovered,
        trackYearProgress,
        placement,
    };
}
