import { describe, it, expect } from 'vitest';
import {
    calcEntryPoints,
    calcRawScore,
    calcMaxRawScore,
    calcWeightedScore,
    calcPercentage,
    applyModifier,
    calcLetterGrade,
    calcGradeColor,
    calcGradeSummary,
    calcClassStats
} from './gradeCalc';
import type { RubricCriterion, ScoreEntry, GradeScale, StudentRubric, Rubric } from '../types';

describe('gradeCalc utilities', () => {

    const mockCriteria: RubricCriterion[] = [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 50,
            levels: [
                { id: 'l1a', label: 'Excellent', minPoints: 4, maxPoints: 5, description: '', subItems: [] },
                { id: 'l1b', label: 'Good', minPoints: 2, maxPoints: 3, description: '', subItems: [] }
            ]
        },
        {
            id: 'c2',
            title: 'Criterion 2',
            description: '',
            weight: 50,
            levels: [
                {
                    id: 'l2a', label: 'Level A', minPoints: 8, maxPoints: 10, description: '', subItems: [
                        { id: 's1', label: 'Sub 1', points: 1 },
                        { id: 's2', label: 'Sub 2', points: 1 }
                    ]
                },
                { id: 'l2b', label: 'Level B', minPoints: 0, maxPoints: 7, description: '', subItems: [] }
            ]
        }
    ];

    describe('calcEntryPoints', () => {
        it('returns override points if specified', () => {
            const entry: ScoreEntry = { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', overridePoints: 10 };
            expect(calcEntryPoints(entry, mockCriteria[0])).toBe(10);
        });

        it('returns 0 if no level is selected', () => {
            const entry: ScoreEntry = { criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' };
            expect(calcEntryPoints(entry, mockCriteria[0])).toBe(0);
        });

        it('returns selected range points bounded by level min/max when no sub-items exist', () => {
            // No selectedPoints -> defaults to minPoints
            const entry1: ScoreEntry = { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '' };
            expect(calcEntryPoints(entry1, mockCriteria[0])).toBe(4);

            const entry2: ScoreEntry = { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 4.5 };
            expect(calcEntryPoints(entry2, mockCriteria[0])).toBe(4.5);

            // Bounds check
            const entry3: ScoreEntry = { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 10 };
            expect(calcEntryPoints(entry3, mockCriteria[0])).toBe(5); // Capped at max
        });

        it('calculates points with sub-items', () => {
            const entry: ScoreEntry = { criterionId: 'c2', levelId: 'l2a', checkedSubItems: ['s1'], comment: '', selectedPoints: 8 };
            expect(calcEntryPoints(entry, mockCriteria[1])).toBe(9); // 8 (min/selected) + 1 (subitem)
        });

        it('caps sub-item points to level maxPoints', () => {
            const entry: ScoreEntry = { criterionId: 'c2', levelId: 'l2a', checkedSubItems: ['s1', 's2'], comment: '', selectedPoints: 9 };
            // 9 + 2 = 11, should cap at 10
            expect(calcEntryPoints(entry, mockCriteria[1])).toBe(10);
        });
    });

    describe('calcRawScore', () => {
        it('calculates total raw score for multiple entries', () => {
            const entries: ScoreEntry[] = [
                { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 5 },
                { criterionId: 'c2', levelId: 'l2b', checkedSubItems: [], comment: '', selectedPoints: 7 }
            ];
            expect(calcRawScore(entries, mockCriteria)).toBe(12);
        });
    });

    describe('calcMaxRawScore', () => {
        it('calculates maximum possible raw score across criteria', () => {
            expect(calcMaxRawScore(mockCriteria)).toBe(15); // c1 max: 5, c2 max: 10
        });
    });

    describe('calcPercentage', () => {
        it('calculates correct percentage of raw score over max raw score', () => {
            const entries: ScoreEntry[] = [
                { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 5 },
                { criterionId: 'c2', levelId: 'l2b', checkedSubItems: [], comment: '', selectedPoints: 7 }
            ];
            // sum = 12, max = 15 => (12/15) * 100 = 80
            expect(calcPercentage(entries, mockCriteria)).toBe(80);
        });

        it('returns 0 if max raw score is 0', () => {
            const zeroCriteria: RubricCriterion[] = [
                { ...mockCriteria[0], levels: [{ id: 'l1', label: '1', minPoints: 0, maxPoints: 0, description: '', subItems: [] }] }
            ];
            expect(calcPercentage([], zeroCriteria)).toBe(0);
        });
    });

    describe('calcWeightedScore', () => {
        it('calculates weighted score percentage correctly', () => {
            const criteria: RubricCriterion[] = [
                { ...mockCriteria[0], weight: 70 }, // max points: 5
                { ...mockCriteria[1], weight: 30 }  // max points: 10
            ];
            const entries: ScoreEntry[] = [
                { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 4 }, // 4/5 * 70 = 56
                { criterionId: 'c2', levelId: 'l2b', checkedSubItems: [], comment: '', selectedPoints: 5 }  // 5/10 * 30 = 15
            ];
            // Total weighted sum = 71
            expect(calcWeightedScore(entries, criteria)).toBe(71);
        });

        it('falls back to standard percentage if total weight is 0', () => {
            const criteriaZeroWeight: RubricCriterion[] = mockCriteria.map(c => ({ ...c, weight: 0 }));
            const entries: ScoreEntry[] = [
                { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 5 },
                { criterionId: 'c2', levelId: 'l2b', checkedSubItems: [], comment: '', selectedPoints: 4 }
            ];
            // Raw: 9, Max raw: 15. Percentage: 60%
            expect(calcWeightedScore(entries, criteriaZeroWeight)).toBe(60);
        });
    });

    describe('applyModifier', () => {
        it('applies percentage modifiers', () => {
            expect(applyModifier(80, { type: 'percentage', value: 5, reason: '' })).toBe(85);
            expect(applyModifier(80, { type: 'percentage', value: -10, reason: '' })).toBe(70);
        });

        it('applies points modifiers as direct percentage modification (based on logic)', () => {
            // Note: Currently in gradeCalc.ts, 'points' modifier acts exactly like 'percentage'
            expect(applyModifier(80, { type: 'points', value: 5, reason: '' })).toBe(85);
        });

        it('applies level modifiers (value * 10)', () => {
            expect(applyModifier(80, { type: 'level', value: -1, reason: '' })).toBe(70); // 80 + (-1 * 10)
        });

        it('bounds modifiers securely between 0 and 100', () => {
            expect(applyModifier(95, { type: 'percentage', value: 20, reason: '' })).toBe(100);
            expect(applyModifier(5, { type: 'percentage', value: -20, reason: '' })).toBe(0);
        });

        it('returns unchanged score if modifier is undefined', () => {
            expect(applyModifier(80)).toBe(80);
        });
    });

    describe('Letter and Color Calculations', () => {
        const mockScale: GradeScale = {
            id: 'scale1',
            name: 'Standard',
            type: 'letter',
            ranges: [
                { min: 90, max: 100, label: 'A', color: '#A' },
                { min: 80, max: 89, label: 'B', color: '#B' },
                { min: 0, max: 79, label: 'F', color: '#F' }
            ]
        };

        it('calculates correct letter grade based on percentage', () => {
            expect(calcLetterGrade(95, mockScale)).toBe('A');
            expect(calcLetterGrade(85, mockScale)).toBe('B');
            expect(calcLetterGrade(50, mockScale)).toBe('F');
            expect(calcLetterGrade(-10, mockScale)).toBe('—'); // Out of bounds
        });

        it('calculates correct grade color based on percentage', () => {
            expect(calcGradeColor(95, mockScale)).toBe('#A');
            expect(calcGradeColor(85, mockScale)).toBe('#B');
            expect(calcGradeColor(50, mockScale)).toBe('#F');
            expect(calcGradeColor(105, mockScale)).toBe('#6b7280'); // Out of bounds default
        });
    });

    describe('calcGradeSummary', () => {
        const mockScale: GradeScale = {
            id: 's1', type: 'letter', name: 'Scale',
            ranges: [{ min: 0, max: 100, label: 'P', color: '#000' }]
        };

        it('returns summary for standard weighted mode', () => {
            const studentRubric: StudentRubric = {
                id: 'sr1', rubricId: 'r1', studentId: 'stu1', isPeerReview: false, overallComment: '',
                entries: [
                    { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 4 }, // 4/5 * 50 = 40
                    { criterionId: 'c2', levelId: 'l2b', checkedSubItems: [], comment: '', selectedPoints: 5 }  // 5/10 * 50 = 25
                ]
            };
            const summary = calcGradeSummary(studentRubric, mockCriteria, mockScale);

            expect(summary.rawScore).toBe(9);
            expect(summary.maxRawScore).toBe(15);
            expect(summary.percentage).toBe(65); // 40 + 25
            expect(summary.modifiedPercentage).toBe(65);
            expect(summary.gradedCount).toBe(2);
            expect(summary.totalCriteria).toBe(2);
        });

        it('handles total-points scoring mode', () => {
            const studentRubric: StudentRubric = {
                id: 'sr1', rubricId: 'r1', studentId: 'stu1', isPeerReview: false, overallComment: '',
                entries: [
                    { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 5 },
                    { criterionId: 'c2', levelId: 'l2a', checkedSubItems: [], comment: '', selectedPoints: 10 }
                ]
            };
            // Raw score: 15. Total points configured: 20
            const rubric: Pick<Rubric, 'scoringMode' | 'totalMaxPoints'> = { scoringMode: 'total-points', totalMaxPoints: 20 };
            const summary = calcGradeSummary(studentRubric, mockCriteria, mockScale, rubric);

            expect(summary.rawScore).toBe(15);
            expect(summary.configuredMaxPoints).toBe(20);
            expect(summary.percentage).toBe(75); // (15 / 20) * 100
        });

        it('applies modifiers to modifiedPercentage', () => {
            const studentRubric: StudentRubric = {
                id: 'sr1', rubricId: 'r1', studentId: 'stu1', isPeerReview: false, overallComment: '',
                globalModifier: { type: 'percentage', value: 10, reason: '' },
                entries: [
                    { criterionId: 'c1', levelId: 'l1a', checkedSubItems: [], comment: '', selectedPoints: 4 }, // 40
                    { criterionId: 'c2', levelId: 'l2b', checkedSubItems: [], comment: '', selectedPoints: 5 }  // 25
                ] // total 65%
            };
            const summary = calcGradeSummary(studentRubric, mockCriteria, mockScale);
            expect(summary.percentage).toBe(65);
            expect(summary.modifiedPercentage).toBe(75); // 65 + 10
        });
    });

    describe('calcClassStats', () => {
        const mockScale: GradeScale = {
            id: 's1', type: 'letter', name: 'Scale',
            ranges: [
                { min: 80, max: 100, label: 'High', color: '#1' },
                { min: 0, max: 79, label: 'Low', color: '#2' }
            ]
        };

        it('calculates class statistics', () => {
            const summaries: any[] = [
                { modifiedPercentage: 80 },
                { modifiedPercentage: 90 },
                { modifiedPercentage: 70 },
                { modifiedPercentage: 100 }
            ];

            const stats = calcClassStats(summaries, mockScale);

            expect(stats.average).toBe(340 / 4); // 85
            expect(stats.highest).toBe(100);
            expect(stats.lowest).toBe(70);
            // median of 70, 80, 90, 100 is (80 + 90) / 2 = 85
            expect(stats.median).toBe(85);

            expect(stats.distribution).toEqual([
                { label: 'High', color: '#1', count: 3 },
                { label: 'Low', color: '#2', count: 1 }
            ]);
        });

        it('handles empty summaries', () => {
            const stats = calcClassStats([], mockScale);
            expect(stats.average).toBe(0);
            expect(stats.median).toBe(0);
            expect(stats.highest).toBe(0);
            expect(stats.lowest).toBe(0);
            expect(stats.distribution).toEqual([]);
        });
    });
});
