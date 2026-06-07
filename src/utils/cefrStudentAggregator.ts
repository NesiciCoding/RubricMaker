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
} from '../types';
import { CEFR_DESCRIPTORS } from '../data/cefrDescriptors';
import { calcGradeSummary } from './gradeCalc';
import { profileText } from './cefrVocabularyProfiler';
import { profileGrammar } from './grammarChecker';

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

export interface CefrCellData {
    skill: CefrSkill;
    level: CefrLevel;
    // Rubric side
    rubricCount: number;
    avgScore: number;
    threshold: number;
    rubricAchieved: boolean;
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

export interface CefrStudentOverview {
    cells: CefrCellData[];
    cellMap: Map<string, CefrCellData>;
    standardSets: StandardSetGroup[];
    skillsWithRubricData: number;
    overallConfidenceRate: number;
    standardsCovered: number;
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
    analysisResults?: DocumentAnalysisResult[]
): CefrStudentOverview {
    const cellAccMap = new Map<string, CellAccumulator>();
    const standardAccMap = new Map<string, StandardAccumulator>();

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
                });
            }
            const acc = cellAccMap.get(key)!;
            acc.scores.push(summary.modifiedPercentage);
            acc.thresholds.push(rubric.cefrAchieveThreshold ?? 70);
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
                cellAccMap.set(key, { skill, level, scores: [], thresholds: [], directlyAchieved: false, confidenceByDescriptor: new Map() });
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
                criterionMax = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
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
                criterionMax = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
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
    const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

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
            if (!prevVocab || LEVEL_ORDER.indexOf(vocabProfile.estimatedLevel) > LEVEL_ORDER.indexOf(prevVocab)) {
                textVocabMap.set(key, vocabProfile.estimatedLevel);
            }
            const prevGrammar = textGrammarMap.get(key);
            if (!prevGrammar || LEVEL_ORDER.indexOf(grammarProfile.estimatedLevel) > LEVEL_ORDER.indexOf(prevGrammar)) {
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
        return {
            skill: acc.skill,
            level: acc.level,
            rubricCount,
            avgScore,
            threshold,
            rubricAchieved,
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

    return { cells, cellMap, standardSets, skillsWithRubricData, overallConfidenceRate, standardsCovered };
}
