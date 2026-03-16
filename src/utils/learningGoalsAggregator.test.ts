import { describe, it, expect } from 'vitest';
import { getStudentGoalScores, getClassGoalScores } from './learningGoalsAggregator';
import type { Rubric, StudentRubric } from '../types';

describe('learningGoalsAggregator', () => {
    it('aggregates scores accurately for criterion-level standards', () => {
        const rubrics: Rubric[] = [
            {
                id: 'r1', name: 'Test Rubric', subject: 'Math', description: '', gradeScaleId: '1',
                format: {} as any, attachmentIds: [], createdAt: '', updatedAt: '', totalMaxPoints: 10, scoringMode: 'total-points',
                criteria: [
                    {
                        id: 'c1', title: 'Crit 1', description: '', weight: 100,
                        linkedStandards: [{ guid: 'std1', description: 'desc', standardSetTitle: '', jurisdictionTitle: '' }],
                        levels: [
                            { id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] },
                            { id: 'l2', label: 'Bad', minPoints: 0, maxPoints: 5, description: '', subItems: [] }
                        ]
                    }
                ]
            }
        ];

        const studentRubrics: StudentRubric[] = [
            {
                id: 'sr1', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-01', isPeerReview: false,
                entries: [
                    { criterionId: 'c1', levelId: 'l1', selectedPoints: 9, checkedSubItems: [], comment: '' }
                ]
            },
            {
                id: 'sr2', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-02', isPeerReview: false,
                entries: [
                    { criterionId: 'c1', levelId: 'l2', selectedPoints: 4, checkedSubItems: [], comment: '' }
                ]
            }
        ];

        const results = getStudentGoalScores('s1', studentRubrics, rubrics);
        expect(results).toHaveLength(1);
        expect(results[0].guid).toBe('std1');
        expect(results[0].history).toHaveLength(2);

        // First submission
        expect(results[0].history[0].earnedPoints).toBe(9);
        expect(results[0].history[0].maxPoints).toBe(10);
        expect(results[0].history[0].percentage).toBe(90);

        // Second submission
        expect(results[0].history[1].earnedPoints).toBe(4);
        expect(results[0].history[1].maxPoints).toBe(10);
        expect(results[0].history[1].percentage).toBe(40);

        // Averages
        expect(results[0].totalEarned).toBe(13);
        expect(results[0].totalMax).toBe(20);
        expect(results[0].averagePercentage).toBe(65);
    });

    it('handles sub-item standards accurately', () => {
        const rubrics: Rubric[] = [
            {
                id: 'r1', name: 'Test Rubric 2', subject: 'Math', description: '', gradeScaleId: '1',
                format: {} as any, attachmentIds: [], createdAt: '', updatedAt: '', totalMaxPoints: 10, scoringMode: 'total-points',
                criteria: [
                    {
                        id: 'c1', title: 'Crit 1', description: '', weight: 100,
                        levels: [
                            {
                                id: 'l1', label: 'Good', minPoints: 0, maxPoints: 10, description: '',
                                subItems: [
                                    { id: 'si1', label: 'Sub 1', points: 3, linkedStandards: [{ guid: 'std1', description: 'x', standardSetTitle: '', jurisdictionTitle: '' }] },
                                    { id: 'si2', label: 'Sub 2', points: 7, linkedStandards: [{ guid: 'std2', description: 'y', standardSetTitle: '', jurisdictionTitle: '' }] },
                                    { id: 'si3', label: 'Sub 3', points: 5 } // No specific standard, shouldn't map anywhere since criterion has no standard
                                ]
                            }
                        ]
                    }
                ]
            }
        ];

        const studentRubrics: StudentRubric[] = [
            {
                id: 'sr1', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-01', isPeerReview: false,
                entries: [
                    { criterionId: 'c1', levelId: 'l1', checkedSubItems: ['si1', 'si3'], comment: '' }
                ]
            }
        ];

        const results = getStudentGoalScores('s1', studentRubrics, rubrics);
        expect(results).toHaveLength(2);

        const std1 = results.find(r => r.guid === 'std1')!;
        expect(std1.totalEarned).toBe(3); // Checked
        expect(std1.totalMax).toBe(3);

        const std2 = results.find(r => r.guid === 'std2')!;
        expect(std2.totalEarned).toBe(0); // Not checked
        expect(std2.totalMax).toBe(7);
    });

    it('handles point overrides', () => {
        const rubrics: any[] = [
            {
                id: 'r1', name: 'Rubric', subject: 'Math', description: '', gradeScaleId: '1',
                criteria: [
                    {
                        id: 'c1', title: 'Crit 1', description: '', weight: 100,
                        linkedStandards: [{ guid: 'std1', description: 'desc' }],
                        levels: [
                            { id: 'l1', label: 'L1', minPoints: 0, maxPoints: 10, description: '', subItems: [] }
                        ]
                    }
                ]
            }
        ];

        const studentRubrics: any[] = [
            {
                id: 'sr1', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-01', isPeerReview: false,
                entries: [
                    { criterionId: 'c1', levelId: 'l1', overridePoints: 7, checkedSubItems: [], comment: '' }
                ]
            }
        ];

        const results = getStudentGoalScores('s1', studentRubrics, rubrics);
        expect(results[0].history[0].earnedPoints).toBe(7);
        expect(results[0].history[0].maxPoints).toBe(10);
    });

    it('handles granular sub-item scores', () => {
        const rubrics: any[] = [
            {
                id: 'r1', name: 'Rubric', subject: 'Math', description: '', gradeScaleId: '1',
                criteria: [
                    {
                        id: 'c1', title: 'Crit 1', description: '', weight: 100,
                        levels: [
                            {
                                id: 'l1', label: 'L1', minPoints: 0, maxPoints: 10, description: '',
                                subItems: [{ id: 'si1', label: 'Sub 1', points: 5, linkedStandards: [{ guid: 'std1', description: 'x' }] }]
                            }
                        ]
                    }
                ]
            }
        ];

        const studentRubrics: any[] = [
            {
                id: 'sr1', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-01', isPeerReview: false,
                entries: [
                    { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], subItemScores: { 'si1': 4 }, comment: '' }
                ]
            }
        ];

        const results = getStudentGoalScores('s1', studentRubrics, rubrics);
        expect(results[0].totalEarned).toBe(4);
        expect(results[0].totalMax).toBe(5);
    });

    it('handles sub-item inheriting criterion standards', () => {
        const rubrics: any[] = [
            {
                id: 'r1', name: 'Rubric', subject: 'Math', description: '', gradeScaleId: '1',
                criteria: [
                    {
                        id: 'c1', title: 'Crit 1', description: '', weight: 100,
                        linkedStandard: { guid: 'std1', description: 'desc' },
                        levels: [
                            {
                                id: 'l1', label: 'L1', minPoints: 0, maxPoints: 10, description: '',
                                subItems: [{ id: 'si1', label: 'Sub 1', points: 5 }] // Inherit from c1
                            }
                        ]
                    }
                ]
            }
        ];

        const studentRubrics: any[] = [
            {
                id: 'sr1', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-01', isPeerReview: false,
                entries: [
                    { criterionId: 'c1', levelId: 'l1', checkedSubItems: ['si1'], comment: '' }
                ]
            }
        ];

        const results = getStudentGoalScores('s1', studentRubrics, rubrics);
        expect(results[0].guid).toBe('std1');
        expect(results[0].totalEarned).toBe(5);
    });

    it('aggregates scores for an entire class', () => {
        const rubrics: any[] = [
            {
                id: 'r1', name: 'Rubric', subject: 'Math', description: '', gradeScaleId: '1',
                criteria: [
                    {
                        id: 'c1', title: 'Crit 1', description: '', weight: 100,
                        linkedStandard: { guid: 'std1', description: 'desc' },
                        levels: [{ id: 'l1', label: 'L1', minPoints: 10, maxPoints: 10, description: '' }]
                    }
                ]
            }
        ];

        const students = [
            { id: 's1', classId: 'cls1' },
            { id: 's2', classId: 'cls1' }
        ];

        const studentRubrics: any[] = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', overallComment: '', gradedAt: '2023-01-01', isPeerReview: false, entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }] },
            { id: 'sr2', rubricId: 'r1', studentId: 's2', overallComment: '', gradedAt: '2023-01-02', isPeerReview: false, entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }] }
        ];

        const results = getClassGoalScores('cls1', students, studentRubrics, rubrics);
        expect(results).toHaveLength(1);
        expect(results[0].totalEarned).toBe(20);
        expect(results[0].totalMax).toBe(20);
        expect(results[0].history).toHaveLength(2);
    });
});
