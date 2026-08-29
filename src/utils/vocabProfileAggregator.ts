import type {
    CefrLevel,
    Class,
    ClassVocabProfile,
    DocumentAnalysisResult,
    PersistedVocabProfile,
    Rubric,
    Student,
    StudentVocabProfile,
    VocabExportRow,
    VocabLevelStat,
} from '../types';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { buildPersistedVocabProfile, estimateLevelFromCounts } from './cefrVocabularyProfiler';

const LEVEL_ORDER: CefrLevel[] = CEFR_LEVELS;

// Module-level cache so repeated aggregation calls (e.g. on navigation) don't
// re-profile the same extracted text when a record has no stored profile.
const backfillCache = new Map<string, PersistedVocabProfile>();

/**
 * The stored vocabulary profile for a result, or one computed on the fly for
 * records analysed before the profile was persisted (back-compat).
 */
function resolveVocabProfile(result: DocumentAnalysisResult): PersistedVocabProfile {
    if (result.vocabProfile) return result.vocabProfile;
    let cached = backfillCache.get(result.extractedText);
    if (!cached) {
        cached = buildPersistedVocabProfile(result.extractedText);
        backfillCache.set(result.extractedText, cached);
    }
    return cached;
}

interface VocabAggregate {
    levelCounts: Record<CefrLevel, number>;
    contentTokenCount: number;
    offListCount: number;
    awlCount: number;
    nawlCount: number;
}

function emptyLevelCounts(): Record<CefrLevel, number> {
    return { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
}

function addCounts(target: Record<CefrLevel, number>, source: Record<CefrLevel, number>) {
    for (const level of LEVEL_ORDER) {
        target[level] += source[level];
    }
}

function aggregateResults(results: DocumentAnalysisResult[]): VocabAggregate {
    const agg: VocabAggregate = {
        levelCounts: emptyLevelCounts(),
        contentTokenCount: 0,
        offListCount: 0,
        awlCount: 0,
        nawlCount: 0,
    };
    for (const result of results) {
        const p = resolveVocabProfile(result);
        addCounts(agg.levelCounts, p.levelCounts);
        agg.contentTokenCount += p.contentTokenCount;
        agg.offListCount += p.offListCount;
        agg.awlCount += p.awlCount;
        agg.nawlCount += p.nawlCount;
    }
    return agg;
}

function buildLevelStats(levelCounts: Record<CefrLevel, number>, total: number): VocabLevelStat[] {
    return LEVEL_ORDER.map((level) => ({
        level,
        count: levelCounts[level],
        percentage: total > 0 ? (levelCounts[level] / total) * 100 : 0,
    }));
}

function share(count: number, total: number): number {
    return total > 0 ? (count / total) * 100 : 0;
}

/**
 * Build a per-student CEFR vocabulary distribution from that student's
 * document analysis results (reading each result's stored vocabProfile, or
 * profiling `extractedText` for records that predate it).
 */
export function getStudentVocabProfile(
    student: Student,
    analysisResults: DocumentAnalysisResult[]
): StudentVocabProfile {
    const studentResults = analysisResults.filter((ar) => ar.studentId === student.id && ar.extractedText);
    const agg = aggregateResults(studentResults);
    const totalWords = LEVEL_ORDER.reduce((sum, level) => sum + agg.levelCounts[level], 0);

    return {
        studentId: student.id,
        studentName: student.name,
        levelCounts: agg.levelCounts,
        levelStats: buildLevelStats(agg.levelCounts, totalWords),
        totalWords,
        estimatedLevel: estimateLevelFromCounts(agg.levelCounts),
        analysisCount: studentResults.length,
        offListPercent: share(agg.offListCount, agg.contentTokenCount),
        awlPercent: share(agg.awlCount, agg.contentTokenCount),
        nawlPercent: share(agg.nawlCount, agg.contentTokenCount),
    };
}

/**
 * Build a per-class CEFR vocabulary distribution by aggregating the class's
 * students' analyses.
 */
export function getClassVocabProfile(
    cls: Class,
    students: Student[],
    analysisResults: DocumentAnalysisResult[]
): ClassVocabProfile {
    const classStudents = students.filter((s) => s.classId === cls.id);
    const studentProfiles = classStudents.map((s) => getStudentVocabProfile(s, analysisResults));

    const classStudentIds = new Set(classStudents.map((s) => s.id));
    const classResults = analysisResults.filter((ar) => classStudentIds.has(ar.studentId) && ar.extractedText);
    const agg = aggregateResults(classResults);
    const totalWords = LEVEL_ORDER.reduce((sum, level) => sum + agg.levelCounts[level], 0);

    return {
        classId: cls.id,
        className: cls.name,
        levelCounts: agg.levelCounts,
        levelStats: buildLevelStats(agg.levelCounts, totalWords),
        totalWords,
        estimatedLevel: estimateLevelFromCounts(agg.levelCounts),
        studentProfiles,
        offListPercent: share(agg.offListCount, agg.contentTokenCount),
        awlPercent: share(agg.awlCount, agg.contentTokenCount),
        nawlPercent: share(agg.nawlCount, agg.contentTokenCount),
    };
}

/**
 * Build CEFR vocabulary distributions for every class, plus the matching
 * per-student profiles for each class's roster.
 */
export function getAllClassVocabProfiles(
    classes: Class[],
    students: Student[],
    analysisResults: DocumentAnalysisResult[]
): ClassVocabProfile[] {
    return classes.map((c) => getClassVocabProfile(c, students, analysisResults));
}

// ─── Vocabulary list export ────────────────────────────────────────────────────

/**
 * Collect vocabulary words for CSV export, optionally filtered to a single
 * CEFR band. Sources:
 *  - `Rubric.vocabularyItems` with a `cefrLevel` (source: 'rubric')
 *  - highlight words from each analysis result's stored vocabProfile
 *    (or profiled on the fly for older records) (source: 'analysis')
 *
 * Words are de-duplicated by (word, source), preferring the rubric
 * definition when both sources produce the same word.
 */
export function collectVocabExportRows(
    rubrics: Rubric[],
    analysisResults: DocumentAnalysisResult[],
    band?: CefrLevel
): VocabExportRow[] {
    const rows = new Map<string, VocabExportRow>();

    for (const rubric of rubrics) {
        for (const item of rubric.vocabularyItems ?? []) {
            if (!item.cefrLevel) continue;
            if (band && item.cefrLevel !== band) continue;
            const key = `${item.phrase.toLowerCase()}__rubric`;
            rows.set(key, {
                word: item.phrase,
                level: item.cefrLevel,
                definition: item.definition ?? '',
                source: 'rubric',
            });
        }
    }

    for (const ar of analysisResults) {
        if (!ar.extractedText) continue;
        const { highlightWords } = resolveVocabProfile(ar);
        for (const hit of highlightWords) {
            if (band && hit.level !== band) continue;
            const key = `${hit.word.toLowerCase()}__analysis`;
            if (rows.has(`${hit.word.toLowerCase()}__rubric`)) continue;
            if (rows.has(key)) continue;
            rows.set(key, {
                word: hit.word,
                level: hit.level,
                definition: '',
                source: 'analysis',
            });
        }
    }

    return Array.from(rows.values()).sort((a, b) => {
        const levelDiff = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
        if (levelDiff !== 0) return levelDiff;
        return a.word.localeCompare(b.word);
    });
}
