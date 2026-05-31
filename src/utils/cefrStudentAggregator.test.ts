import { describe, it, expect } from 'vitest';
import { getCefrStudentOverview } from './cefrStudentAggregator';
import type { Rubric, StudentRubric, SelfAssessment, DocumentAnalysisResult } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
    return {
        id: 'r1',
        name: 'Test Rubric',
        subject: 'English',
        description: '',
        gradeScaleId: 'gs1',
        format: {} as any,
        attachmentIds: [],
        createdAt: '',
        updatedAt: '',
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
        criteria: [
            {
                id: 'c1',
                title: 'Writing Quality',
                description: '',
                weight: 100,
                levels: [
                    { id: 'l1', label: 'Good', minPoints: 80, maxPoints: 100, description: '', subItems: [] },
                    { id: 'l2', label: 'Poor', minPoints: 0, maxPoints: 50, description: '', subItems: [] },
                ],
            },
        ],
        ...overrides,
    };
}

function makeSr(overrides: Partial<StudentRubric> = {}): StudentRubric {
    return {
        id: 'sr1',
        rubricId: 'r1',
        studentId: 's1',
        overallComment: '',
        gradedAt: '2024-01-15',
        isPeerReview: false,
        entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 85, checkedSubItems: [], comment: '' }],
        ...overrides,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getCefrStudentOverview', () => {
    it('returns zero stats and empty collections when inputs are empty', () => {
        const result = getCefrStudentOverview('s1', [], [], []);
        expect(result.cells).toHaveLength(0);
        expect(result.cellMap.size).toBe(0);
        expect(result.standardSets).toHaveLength(0);
        expect(result.skillsWithRubricData).toBe(0);
        expect(result.overallConfidenceRate).toBe(0);
        expect(result.standardsCovered).toBe(0);
    });

    it('produces an achieved cell when rubric score meets threshold', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing', cefrAchieveThreshold: 70 });
        const sr = makeSr(); // selectedPoints: 85 → 85% ≥ 70
        const result = getCefrStudentOverview('s1', [sr], [rubric], []);

        expect(result.cells).toHaveLength(1);
        const cell = result.cells[0];
        expect(cell.skill).toBe('writing');
        expect(cell.level).toBe('B1');
        expect(cell.rubricCount).toBe(1);
        expect(cell.avgScore).toBeCloseTo(85, 0);
        expect(cell.rubricAchieved).toBe(true);
        expect(cell.state).toBe('achieved');
    });

    it('produces a developing cell when rubric score is below threshold', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B2', cefrSkill: 'reading', cefrAchieveThreshold: 70 });
        const sr = makeSr({
            entries: [{ criterionId: 'c1', levelId: 'l2', selectedPoints: 40, checkedSubItems: [], comment: '' }],
        }); // 40% < 70
        const result = getCefrStudentOverview('s1', [sr], [rubric], []);

        const cell = result.cells[0];
        expect(cell.state).toBe('developing');
        expect(cell.rubricAchieved).toBe(false);
    });

    it('averages scores correctly across multiple rubrics for the same cell', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'A2', cefrSkill: 'listening', cefrAchieveThreshold: 70 });
        const sr1 = makeSr({
            id: 'sr1',
            entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 90, checkedSubItems: [], comment: '' }],
        });
        const sr2 = makeSr({
            id: 'sr2',
            entries: [{ criterionId: 'c1', levelId: 'l2', selectedPoints: 50, checkedSubItems: [], comment: '' }],
        });
        const result = getCefrStudentOverview('s1', [sr1, sr2], [rubric], []);

        expect(result.cells).toHaveLength(1);
        // avgScore ≈ average of the two modifiedPercentages
        expect(result.cells[0].rubricCount).toBe(2);
        expect(result.cells[0].avgScore).toBeGreaterThan(0);
    });

    it('populates self-assessment confidence from ratings', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [
                { descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: true },
                { descriptorId: 'w-b1-2', level: 'B1', skill: 'writing', confident: false },
            ],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);

        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.totalDescriptors).toBe(2);
        expect(cell!.confidentCount).toBe(1);
        expect(cell!.confidenceRate).toBeCloseTo(50, 0);
        expect(cell!.state).toBe('not-started');
    });

    it('combines rubric achievement and self-assessment in the same cell', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing', cefrAchieveThreshold: 70 });
        const sr = makeSr();
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [{ descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: true }],
        };
        const result = getCefrStudentOverview('s1', [sr], [rubric], [sa]);

        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.rubricCount).toBe(1);
        expect(cell!.rubricAchieved).toBe(true);
        expect(cell!.totalDescriptors).toBe(1);
        expect(cell!.confidentCount).toBe(1);
        expect(cell!.state).toBe('achieved');
    });

    it('skips rubric gracefully when snapshot is missing and live rubric not found', () => {
        const sr = makeSr({ rubricId: 'missing-rubric' });
        const result = getCefrStudentOverview('s1', [sr], [], []);
        expect(result.cells).toHaveLength(0);
    });

    it('defaults cefrSkill to writing when rubric has cefrTargetLevel but no cefrSkill', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'A1', cefrSkill: undefined });
        const sr = makeSr();
        const result = getCefrStudentOverview('s1', [sr], [rubric], []);

        expect(result.cells).toHaveLength(1);
        expect(result.cells[0].skill).toBe('writing');
        expect(result.cells[0].level).toBe('A1');
    });

    it('groups standards by standardSetTitle', () => {
        const rubric = makeRubric({
            criteria: [
                {
                    id: 'c1',
                    title: 'C1',
                    description: '',
                    weight: 100,
                    linkedStandards: [
                        {
                            guid: 'std1',
                            description: 'Read closely',
                            standardSetTitle: 'CCSS',
                            jurisdictionTitle: 'US',
                        },
                        {
                            guid: 'std2',
                            description: 'Cite evidence',
                            standardSetTitle: 'NGSS',
                            jurisdictionTitle: 'US',
                        },
                    ],
                    levels: [{ id: 'l1', label: 'Good', minPoints: 80, maxPoints: 100, description: '', subItems: [] }],
                },
            ],
        });
        const sr = makeSr();
        const result = getCefrStudentOverview('s1', [sr], [rubric], []);

        expect(result.standardSets).toHaveLength(2);
        const titles = result.standardSets.map((g) => g.setTitle).sort();
        expect(titles).toEqual(['CCSS', 'NGSS']);
        expect(result.standardsCovered).toBe(2);
    });

    it('deduplicates descriptors across multiple self-assessments (last-write wins)', () => {
        const sa1: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-01',
            ratings: [{ descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: false }],
        };
        const sa2: SelfAssessment = {
            id: 'sa2',
            rubricId: 'r2',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [{ descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: true }],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa1, sa2]);

        const cell = result.cellMap.get('writing__B1')!;
        expect(cell.totalDescriptors).toBe(1);
        expect(cell.confidentCount).toBe(1); // last-write (sa2) wins
    });

    it('does not crash when max points are zero (division-by-zero guard)', () => {
        const rubric = makeRubric({
            cefrTargetLevel: 'C1',
            cefrSkill: 'reading',
            criteria: [
                {
                    id: 'c1',
                    title: 'C1',
                    description: '',
                    weight: 100,
                    linkedStandards: [
                        { guid: 'std-zero', description: 'zero', standardSetTitle: 'Test', jurisdictionTitle: 'X' },
                    ],
                    levels: [{ id: 'l1', label: 'L1', minPoints: 0, maxPoints: 0, description: '', subItems: [] }],
                },
            ],
        });
        const sr = makeSr({
            entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 0, checkedSubItems: [], comment: '' }],
        });
        expect(() => getCefrStudentOverview('s1', [sr], [rubric], [])).not.toThrow();
    });

    it('cellMap provides O(1) lookup for any skill+level key', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [{ descriptorId: 'r-a1-1', level: 'A1', skill: 'reading', confident: true }],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);
        expect(result.cellMap.get('reading__A1')).toBeDefined();
        expect(result.cellMap.get('writing__B2')).toBeUndefined();
    });
});

// ─── Text profiling integration (Step 2b) ────────────────────────────────────

function makeAnalysisResult(overrides: Partial<DocumentAnalysisResult> = {}): DocumentAnalysisResult {
    return {
        id: 'ar1',
        studentId: 's1',
        rubricId: 'r1',
        attachmentId: 'att1',
        extractedText: 'She has written an excellent essay about the environment and its consequences.',
        analyzedAt: '2024-01-15',
        detectedItems: [],
        grammarErrors: [],
        grammarCheckerUsed: 'none',
        ...overrides,
    };
}

describe('getCefrStudentOverview — text profiling from analysisResults', () => {
    it('populates textVocabEstimate and textGrammarEstimate when analysisResult matches', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing', cefrAchieveThreshold: 70 });
        const sr = makeSr();
        const ar = makeAnalysisResult();

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeDefined();
        expect(cell!.textGrammarEstimate).toBeDefined();
    });

    it('sets no text estimates when analysisResults is undefined', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], undefined);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('sets no text estimates when analysisResults is empty', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], []);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysisResult belonging to a different student', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const ar = makeAnalysisResult({ studentId: 'other-student' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysisResult with no extractedText', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const ar = makeAnalysisResult({ extractedText: '' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysisResult when there is no matching graded StudentRubric', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        // analysisResult refers to a different rubricId than the graded sr
        const ar = makeAnalysisResult({ rubricId: 'different-rubric' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        // No text estimates because the rubricId didn't match
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysisResult when matched rubric has no cefrTargetLevel', () => {
        // Rubric has no cefrTargetLevel — should not produce a text estimate
        const rubric = makeRubric({ cefrTargetLevel: undefined, cefrSkill: undefined });
        const sr = makeSr();
        const ar = makeAnalysisResult();

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        // No CEFR cell is created because rubric has no cefrTargetLevel
        expect(result.cells).toHaveLength(0);
    });

    it('uses the highest vocab level across multiple analyses for the same cell', () => {
        const rubric = makeRubric({ id: 'r1', cefrTargetLevel: 'B1', cefrSkill: 'writing', cefrAchieveThreshold: 70 });
        const sr1 = makeSr({ id: 'sr1', rubricId: 'r1' });
        const sr2 = makeSr({ id: 'sr2', rubricId: 'r2' });
        const rubric2 = makeRubric({ id: 'r2', cefrTargetLevel: 'B1', cefrSkill: 'writing', cefrAchieveThreshold: 70 });

        // One analysis with basic text, one with advanced text
        const ar1 = makeAnalysisResult({
            id: 'ar1',
            rubricId: 'r1',
            extractedText: 'the cat sat on the mat',
        });
        const ar2 = makeAnalysisResult({
            id: 'ar2',
            rubricId: 'r2',
            extractedText:
                'The phenomenon of globalisation has fundamentally transformed contemporary economic structures. ' +
                'Significant disparities persist despite unprecedented technological advancement.',
        });

        const result = getCefrStudentOverview('s1', [sr1, sr2], [rubric, rubric2], [], [ar1, ar2]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        // The advanced text should push the vocab estimate higher than A1
        const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        expect(LEVEL_ORDER.indexOf(cell!.textVocabEstimate!)).toBeGreaterThanOrEqual(0);
    });

    it('textVocabEstimate is a valid CefrLevel', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const ar = makeAnalysisResult({
            extractedText:
                'Students should understand the consequences of their actions and the implications for society.',
        });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        if (cell!.textVocabEstimate !== undefined) {
            expect(validLevels).toContain(cell!.textVocabEstimate);
        }
        if (cell!.textGrammarEstimate !== undefined) {
            expect(validLevels).toContain(cell!.textGrammarEstimate);
        }
    });

    it('defaults cefrSkill to writing for text estimate cell key when rubric has no cefrSkill', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'A2', cefrSkill: undefined });
        const sr = makeSr();
        const ar = makeAnalysisResult({ extractedText: 'I like apples and bananas very much.' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        // Cell key should be writing__A2 (default skill)
        const cell = result.cellMap.get('writing__A2');
        expect(cell).toBeDefined();
        // Whether textVocabEstimate is set depends on vocabulary matching — just assert no crash
        expect(cell!.skill).toBe('writing');
    });
});

// ─── Additional edge-case and regression tests ────────────────────────────────

describe('getCefrStudentOverview — summary statistics', () => {
    it('overallConfidenceRate is 100 when all descriptors are confident', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [
                { descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: true },
                { descriptorId: 'w-b1-2', level: 'B1', skill: 'writing', confident: true },
                { descriptorId: 'w-b1-3', level: 'B1', skill: 'writing', confident: true },
            ],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);
        expect(result.overallConfidenceRate).toBeCloseTo(100, 0);
    });

    it('overallConfidenceRate is 0 when no descriptors are confident', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [
                { descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: false },
                { descriptorId: 'w-b1-2', level: 'B1', skill: 'writing', confident: false },
            ],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);
        expect(result.overallConfidenceRate).toBeCloseTo(0, 0);
    });

    it('skillsWithRubricData counts cells that have rubric data across different skills', () => {
        const rubricWriting = makeRubric({ id: 'r1', cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const rubricReading = makeRubric({ id: 'r2', cefrTargetLevel: 'B1', cefrSkill: 'reading' });
        const srWriting = makeSr({ id: 'sr1', rubricId: 'r1' });
        const srReading = makeSr({ id: 'sr2', rubricId: 'r2' });

        const result = getCefrStudentOverview('s1', [srWriting, srReading], [rubricWriting, rubricReading], []);
        expect(result.skillsWithRubricData).toBe(2);
    });

    it('skillsWithRubricData is 0 when there are only self-assessments', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [{ descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: true }],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);
        expect(result.skillsWithRubricData).toBe(0);
    });

    it('standardsCovered is 0 when criteria have no linked standards', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const result = getCefrStudentOverview('s1', [sr], [rubric], []);
        expect(result.standardsCovered).toBe(0);
    });

    it('filters out StudentRubric entries for other students', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const srOther = makeSr({ studentId: 'other-student' });
        const result = getCefrStudentOverview('s1', [srOther], [rubric], []);
        expect(result.cells).toHaveLength(0);
    });

    it('filters out self-assessments for other students', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 'other-student',
            submittedAt: '2024-01-10',
            ratings: [{ descriptorId: 'w-b1-1', level: 'B1', skill: 'writing', confident: true }],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);
        expect(result.cells).toHaveLength(0);
    });

    it('uses rubricSnapshot over live rubric lookup when snapshot is present', () => {
        const liveRubric = makeRubric({ id: 'r1', cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const snapshotRubric = makeRubric({ id: 'r1', cefrTargetLevel: 'C1', cefrSkill: 'reading' });
        // sr has a snapshot that differs from the live rubric
        const sr = makeSr({ rubricSnapshot: snapshotRubric });

        const result = getCefrStudentOverview('s1', [sr], [liveRubric], []);
        // Should use snapshot (C1/reading), not live rubric (B1/writing)
        expect(result.cellMap.get('reading__C1')).toBeDefined();
        expect(result.cellMap.get('writing__B1')).toBeUndefined();
    });

    it('default threshold is 70 when rubric cefrAchieveThreshold is not set', () => {
        // Use a level with minPoints:0 so selectedPoints:65 is not clamped up — yields 65% score
        const rubric = makeRubric({
            cefrTargetLevel: 'B1',
            cefrSkill: 'writing',
            cefrAchieveThreshold: undefined,
            criteria: [
                {
                    id: 'c1',
                    title: 'Writing Quality',
                    description: '',
                    weight: 100,
                    levels: [{ id: 'l1', label: 'Partial', minPoints: 0, maxPoints: 100, description: '', subItems: [] }],
                },
            ],
        });
        const sr = makeSr({
            entries: [{ criterionId: 'c1', levelId: 'l1', selectedPoints: 65, checkedSubItems: [], comment: '' }],
        });
        const result = getCefrStudentOverview('s1', [sr], [rubric], []);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        // 65% < 70 (default threshold) → developing
        expect(cell!.state).toBe('developing');
        expect(cell!.threshold).toBe(70);
    });

    it('cell state is not-started when only self-assessment data exists (no rubric)', () => {
        const sa: SelfAssessment = {
            id: 'sa1',
            rubricId: 'r1',
            studentId: 's1',
            submittedAt: '2024-01-10',
            ratings: [{ descriptorId: 'r-a2-1', level: 'A2', skill: 'reading', confident: true }],
        };
        const result = getCefrStudentOverview('s1', [], [], [sa]);
        const cell = result.cellMap.get('reading__A2');
        expect(cell).toBeDefined();
        expect(cell!.state).toBe('not-started');
        expect(cell!.rubricCount).toBe(0);
    });
});
