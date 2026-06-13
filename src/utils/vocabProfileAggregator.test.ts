import { describe, it, expect } from 'vitest';
import { DEFAULT_FORMAT } from '../types';
import type { Class, DocumentAnalysisResult, Rubric, Student } from '../types';
import {
    getStudentVocabProfile,
    getClassVocabProfile,
    getAllClassVocabProfiles,
    collectVocabExportRows,
} from './vocabProfileAggregator';

const ADVANCED_TEXT =
    'The phenomenon of globalisation has fundamentally transformed contemporary economic structures. ' +
    'Significant disparities in wealth distribution persist despite unprecedented technological advancement. ' +
    'Furthermore, the escalation of environmental degradation necessitates immediate legislative intervention.';

const SIMPLE_TEXT = 'The cat sat on the mat. The dog ran fast today. We like to play in the garden.';

function makeAnalysis(overrides: Partial<DocumentAnalysisResult>): DocumentAnalysisResult {
    return {
        id: 'ar1',
        studentId: 's1',
        rubricId: 'r1',
        attachmentId: 'a1',
        extractedText: '',
        analyzedAt: '2024-01-01T00:00:00Z',
        detectedItems: [],
        grammarErrors: [],
        grammarCheckerUsed: 'none',
        ...overrides,
    };
}

const studentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const studentB: Student = { id: 's2', name: 'Bob', classId: 'c1' };
const studentC: Student = { id: 's3', name: 'Carol', classId: 'c2' };

const classA: Class = { id: 'c1', name: 'Class A' };
const classB: Class = { id: 'c2', name: 'Class B' };

function makeRubric(overrides: Partial<Rubric>): Rubric {
    return {
        id: 'r1',
        name: 'Test Rubric',
        subject: 'English',
        description: '',
        criteria: [],
        gradeScaleId: 'gs1',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
        ...overrides,
    };
}

describe('getStudentVocabProfile', () => {
    it('returns empty/A1 distribution when there are no analysis results', () => {
        const profile = getStudentVocabProfile(studentA, []);
        expect(profile.totalWords).toBe(0);
        expect(profile.analysisCount).toBe(0);
        expect(profile.estimatedLevel).toBe('A1');
        expect(profile.levelStats).toHaveLength(6);
        expect(profile.levelStats.every((s) => s.count === 0 && s.percentage === 0)).toBe(true);
    });

    it('aggregates level counts across multiple analysis results for a student', () => {
        const results = [
            makeAnalysis({ id: 'a1', studentId: 's1', extractedText: SIMPLE_TEXT }),
            makeAnalysis({ id: 'a2', studentId: 's1', extractedText: ADVANCED_TEXT }),
            makeAnalysis({ id: 'a3', studentId: 's2', extractedText: ADVANCED_TEXT }),
        ];
        const profile = getStudentVocabProfile(studentA, results);
        expect(profile.analysisCount).toBe(2);
        expect(profile.totalWords).toBeGreaterThan(0);
        const total = profile.levelStats.reduce((sum, s) => sum + s.count, 0);
        expect(total).toBe(profile.totalWords);
        const pctSum = profile.levelStats.reduce((sum, s) => sum + s.percentage, 0);
        expect(pctSum).toBeCloseTo(100, 5);
    });

    it('ignores analysis results without extracted text', () => {
        const results = [makeAnalysis({ id: 'a1', studentId: 's1', extractedText: '' })];
        const profile = getStudentVocabProfile(studentA, results);
        expect(profile.analysisCount).toBe(0);
        expect(profile.totalWords).toBe(0);
    });
});

describe('getClassVocabProfile / getAllClassVocabProfiles', () => {
    const results = [
        makeAnalysis({ id: 'a1', studentId: 's1', extractedText: SIMPLE_TEXT }),
        makeAnalysis({ id: 'a2', studentId: 's2', extractedText: ADVANCED_TEXT }),
        makeAnalysis({ id: 'a3', studentId: 's3', extractedText: ADVANCED_TEXT }),
    ];
    const students = [studentA, studentB, studentC];

    it('aggregates per-class distributions from student profiles', () => {
        const profile = getClassVocabProfile(classA, students, results);
        expect(profile.studentProfiles).toHaveLength(2);
        expect(profile.studentProfiles.map((p) => p.studentId).sort()).toEqual(['s1', 's2']);

        const summedCounts = profile.studentProfiles.reduce((sum, sp) => sum + sp.totalWords, 0);
        expect(profile.totalWords).toBe(summedCounts);
    });

    it('returns a profile per class with an empty roster for classes with no students', () => {
        const emptyClass: Class = { id: 'c3', name: 'Class C' };
        const profile = getClassVocabProfile(emptyClass, students, results);
        expect(profile.studentProfiles).toHaveLength(0);
        expect(profile.totalWords).toBe(0);
        expect(profile.estimatedLevel).toBe('A1');
    });

    it('builds profiles for multiple classes', () => {
        const profiles = getAllClassVocabProfiles([classA, classB], students, results);
        expect(profiles.map((p) => p.classId)).toEqual(['c1', 'c2']);
        expect(profiles[1].studentProfiles).toHaveLength(1);
        expect(profiles[1].studentProfiles[0].studentId).toBe('s3');
    });
});

describe('collectVocabExportRows', () => {
    it('collects words from rubric vocabularyItems with a cefrLevel', () => {
        const rubric = makeRubric({
            vocabularyItems: [
                { id: 'v1', phrase: 'phenomenon', category: 'vocabulary', cefrLevel: 'C1', definition: 'an event' },
                { id: 'v2', phrase: 'undefined-level', category: 'vocabulary' },
            ],
        });
        const rows = collectVocabExportRows([rubric], []);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ word: 'phenomenon', level: 'C1', definition: 'an event', source: 'rubric' });
    });

    it('collects highlight words from analysis results not already covered by rubric items', () => {
        const rubric = makeRubric({ vocabularyItems: [] });
        const results = [makeAnalysis({ id: 'a1', studentId: 's1', extractedText: ADVANCED_TEXT })];
        const rows = collectVocabExportRows([rubric], results);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.source === 'analysis')).toBe(true);
        expect(rows.every((r) => r.level !== 'A1')).toBe(true);
    });

    it('filters rows by CEFR band', () => {
        const rubric = makeRubric({
            vocabularyItems: [
                { id: 'v1', phrase: 'cat', category: 'vocabulary', cefrLevel: 'A1', definition: 'an animal' },
                { id: 'v2', phrase: 'phenomenon', category: 'vocabulary', cefrLevel: 'C1', definition: 'an event' },
            ],
        });
        const rows = collectVocabExportRows([rubric], [], 'C1');
        expect(rows).toHaveLength(1);
        expect(rows[0].word).toBe('phenomenon');
    });

    it('returns an empty array when no rubrics or analysis results are provided', () => {
        expect(collectVocabExportRows([], [])).toEqual([]);
    });

    it('prefers rubric-sourced rows over analysis-sourced rows for the same word', () => {
        const rubric = makeRubric({
            vocabularyItems: [
                {
                    id: 'v1',
                    phrase: 'phenomenon',
                    category: 'vocabulary',
                    cefrLevel: 'C1',
                    definition: 'rubric-defined',
                },
            ],
        });
        const results = [makeAnalysis({ id: 'a1', studentId: 's1', extractedText: ADVANCED_TEXT })];
        const rows = collectVocabExportRows([rubric], results);
        const phenomenonRow = rows.find((r) => r.word.toLowerCase() === 'phenomenon');
        expect(phenomenonRow).toMatchObject({ source: 'rubric', definition: 'rubric-defined' });
    });
});
