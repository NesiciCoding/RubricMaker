import type { CefrLevel, Class, DocumentAnalysisResult, Rubric, Student } from '../types';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { profileText } from './cefrVocabularyProfiler';

const LEVEL_ORDER: CefrLevel[] = CEFR_LEVELS;

// Module-level cache so repeated aggregation calls (e.g. on navigation) don't
// re-run the vocabulary profiler on the same extracted text.
const profileCache = new Map<string, Record<CefrLevel, number>>();

function getLevelCounts(text: string): Record<CefrLevel, number> {
    let cached = profileCache.get(text);
    if (!cached) {
        cached = profileText(text).levelCounts;
        profileCache.set(text, cached);
    }
    return cached;
}

function emptyLevelCounts(): Record<CefrLevel, number> {
    return { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
}

function addCounts(target: Record<CefrLevel, number>, source: Record<CefrLevel, number>) {
    for (const level of LEVEL_ORDER) {
        target[level] += source[level];
    }
}

export interface VocabLevelStat {
    level: CefrLevel;
    count: number;
    percentage: number;
}

export interface StudentVocabProfile {
    studentId: string;
    studentName: string;
    levelCounts: Record<CefrLevel, number>;
    levelStats: VocabLevelStat[];
    totalWords: number;
    estimatedLevel: CefrLevel;
    analysisCount: number;
}

export interface ClassVocabProfile {
    classId: string;
    className: string;
    levelCounts: Record<CefrLevel, number>;
    levelStats: VocabLevelStat[];
    totalWords: number;
    estimatedLevel: CefrLevel;
    studentProfiles: StudentVocabProfile[];
}

/**
 * Estimate the CEFR level for a level-count distribution: the highest level
 * whose matched-word share is at least 5% of all matches. Mirrors
 * `profileText`'s `estimatedLevel` heuristic for aggregated counts.
 */
function estimateLevel(levelCounts: Record<CefrLevel, number>): CefrLevel {
    const total = LEVEL_ORDER.reduce((sum, level) => sum + levelCounts[level], 0);
    if (total === 0) return 'A1';
    for (const level of [...LEVEL_ORDER].reverse()) {
        if (levelCounts[level] / total >= 0.05) return level;
    }
    return 'A1';
}

function buildLevelStats(levelCounts: Record<CefrLevel, number>, total: number): VocabLevelStat[] {
    return LEVEL_ORDER.map((level) => ({
        level,
        count: levelCounts[level],
        percentage: total > 0 ? (levelCounts[level] / total) * 100 : 0,
    }));
}

/**
 * Build a per-student CEFR vocabulary distribution from that student's
 * document analysis results (extracted text profiled via `profileText`).
 */
export function getStudentVocabProfile(
    student: Student,
    analysisResults: DocumentAnalysisResult[]
): StudentVocabProfile {
    const studentResults = analysisResults.filter((ar) => ar.studentId === student.id && ar.extractedText);

    const levelCounts = emptyLevelCounts();
    for (const ar of studentResults) {
        addCounts(levelCounts, getLevelCounts(ar.extractedText));
    }

    const totalWords = LEVEL_ORDER.reduce((sum, level) => sum + levelCounts[level], 0);

    return {
        studentId: student.id,
        studentName: student.name,
        levelCounts,
        levelStats: buildLevelStats(levelCounts, totalWords),
        totalWords,
        estimatedLevel: estimateLevel(levelCounts),
        analysisCount: studentResults.length,
    };
}

/**
 * Build a per-class CEFR vocabulary distribution by aggregating each
 * student's profile (see `getStudentVocabProfile`).
 */
export function getClassVocabProfile(
    cls: Class,
    students: Student[],
    analysisResults: DocumentAnalysisResult[]
): ClassVocabProfile {
    const classStudents = students.filter((s) => s.classId === cls.id);
    const studentProfiles = classStudents.map((s) => getStudentVocabProfile(s, analysisResults));

    const levelCounts = emptyLevelCounts();
    for (const sp of studentProfiles) {
        addCounts(levelCounts, sp.levelCounts);
    }

    const totalWords = LEVEL_ORDER.reduce((sum, level) => sum + levelCounts[level], 0);

    return {
        classId: cls.id,
        className: cls.name,
        levelCounts,
        levelStats: buildLevelStats(levelCounts, totalWords),
        totalWords,
        estimatedLevel: estimateLevel(levelCounts),
        studentProfiles,
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

export interface VocabExportRow {
    word: string;
    level: CefrLevel;
    definition: string;
    source: 'rubric' | 'analysis';
}

/**
 * Collect vocabulary words for CSV export, optionally filtered to a single
 * CEFR band. Sources:
 *  - `Rubric.vocabularyItems` with a `cefrLevel` (source: 'rubric')
 *  - highlight words from `profileText` over each analysis result's
 *    extracted text (source: 'analysis')
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
        const { highlightWords } = profileText(ar.extractedText);
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
