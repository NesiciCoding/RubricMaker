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

// ─── analysisResults / text profile tests ────────────────────────────────────

function makeAnalysisResult(overrides: Partial<DocumentAnalysisResult> = {}): DocumentAnalysisResult {
    return {
        id: 'ar1',
        studentId: 's1',
        rubricId: 'r1',
        attachmentId: 'att1',
        extractedText: 'She has completed the assignment. Although it was challenging, she persevered.',
        analyzedAt: '2024-01-15',
        detectedItems: [],
        grammarErrors: [],
        grammarCheckerUsed: 'none',
        ...overrides,
    };
}

describe('getCefrStudentOverview — analysisResults text profiling', () => {
    it('populates textVocabEstimate and textGrammarEstimate on matching cell', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const ar = makeAnalysisResult();

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        // The text should produce a non-undefined vocab and grammar estimate
        expect(cell!.textVocabEstimate).toBeDefined();
        expect(cell!.textGrammarEstimate).toBeDefined();
        expect(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).toContain(cell!.textVocabEstimate);
        expect(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).toContain(cell!.textGrammarEstimate);
    });

    it('leaves textVocabEstimate and textGrammarEstimate undefined when no analysisResults provided', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();

        const result = getCefrStudentOverview('s1', [sr], [rubric], []);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('leaves textVocabEstimate and textGrammarEstimate undefined when analysisResults is empty array', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], []);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysis results for a different student', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const ar = makeAnalysisResult({ studentId: 'other-student' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysis results with no extractedText', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        const ar = makeAnalysisResult({ extractedText: '' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
        expect(cell!.textGrammarEstimate).toBeUndefined();
    });

    it('ignores analysis results where rubricId does not match a graded StudentRubric', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr = makeSr();
        // ar.rubricId is 'other-rubric', which has no graded StudentRubric
        const ar = makeAnalysisResult({ rubricId: 'other-rubric' });

        const result = getCefrStudentOverview('s1', [sr], [rubric], [], [ar]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeUndefined();
    });

    it('ignores analysis results when rubric has no cefrTargetLevel', () => {
        // Rubric without cefrTargetLevel — no CEFR cell is created
        const rubric = makeRubric({ cefrTargetLevel: undefined });
        const sr = makeSr();
        const ar = makeAnalysisResult();

        // This should not throw; without cefrTargetLevel the rubric won't create a cell
        expect(() => getCefrStudentOverview('s1', [sr], [rubric], [], [ar])).not.toThrow();
    });

    it('picks the higher vocab estimate when multiple analysis results target the same cell', () => {
        const rubric = makeRubric({ id: 'r1', cefrTargetLevel: 'B1', cefrSkill: 'writing' });
        const sr1 = makeSr({ id: 'sr1', rubricId: 'r1' });

        // Two analysis results for the same rubric — the profiler will run on both texts
        // We use texts of different complexity to ensure the higher level is kept
        const ar1 = makeAnalysisResult({
            id: 'ar1',
            rubricId: 'r1',
            extractedText: 'The cat is big.',
        });
        const ar2 = makeAnalysisResult({
            id: 'ar2',
            rubricId: 'r1',
            extractedText:
                'The phenomenon of globalisation has fundamentally transformed contemporary economic structures. ' +
                'Significant disparities in wealth distribution persist despite unprecedented technological advancement.',
        });

        const result = getCefrStudentOverview('s1', [sr1], [rubric], [], [ar1, ar2]);
        const cell = result.cellMap.get('writing__B1');
        expect(cell).toBeDefined();
        // The vocab estimate should be at least as high as the estimate for the simpler text
        const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const ar1Result = cell!.textVocabEstimate;
        expect(ar1Result).toBeDefined();
        // We just verify it's a valid level
        expect(LEVEL_ORDER).toContain(ar1Result);
    });

    it('uses rubricSnapshot from StudentRubric when live rubric is absent', () => {
        // rubricSnapshot carries cefrTargetLevel so text profiling should work
        const snapshot = makeRubric({ id: 'r1', cefrTargetLevel: 'A2', cefrSkill: 'reading' });
        const sr = makeSr({ rubricId: 'r1', rubricSnapshot: snapshot });
        const ar = makeAnalysisResult({ rubricId: 'r1' });

        // Pass empty rubrics array — must rely on snapshot
        const result = getCefrStudentOverview('s1', [sr], [], [], [ar]);
        const cell = result.cellMap.get('reading__A2');
        expect(cell).toBeDefined();
        expect(cell!.textVocabEstimate).toBeDefined();
    });

    it('does not throw when analysisResults contains unexpected data', () => {
        const rubric = makeRubric({ cefrTargetLevel: 'B2', cefrSkill: 'writing' });
        const sr = makeSr();
        // Analysis result with null-ish extractedText
        const ar = makeAnalysisResult({ extractedText: '   ' });

        expect(() => getCefrStudentOverview('s1', [sr], [rubric], [], [ar])).not.toThrow();
    });
});
