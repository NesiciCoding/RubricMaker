import { describe, it, expect } from 'vitest';
import { getCefrStudentOverview } from './cefrStudentAggregator';
import type { Rubric, StudentRubric, SelfAssessment } from '../types';

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
                    levels: [
                        { id: 'l1', label: 'Good', minPoints: 80, maxPoints: 100, description: '', subItems: [] },
                    ],
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
