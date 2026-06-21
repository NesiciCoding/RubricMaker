import { describe, it, expect } from 'vitest';
import { getClassStandardsCoverage } from './standardsCoverageAggregator';
import type { Class, Rubric, Student, StudentRubric } from '../types';

function makeRubric(id: string, criteria: Rubric['criteria']): Rubric {
    return {
        id,
        name: id,
        subject: '',
        description: '',
        gradeScaleId: '1',
        format: {} as any,
        attachmentIds: [],
        createdAt: '',
        updatedAt: '',
        totalMaxPoints: 10,
        scoringMode: 'total-points',
        criteria,
    };
}

const students: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];
const classes: Class[] = [{ id: 'c1', name: 'Class A' }];

describe('getClassStandardsCoverage', () => {
    it('marks a linked-but-never-graded standard as a gap', () => {
        const rubrics = [
            makeRubric('r1', [
                {
                    id: 'crit1',
                    title: 'Crit',
                    description: '',
                    weight: 100,
                    linkedStandards: [
                        { guid: 'std1', description: 'Standard 1', standardSetTitle: 'CCSS', jurisdictionTitle: 'US' },
                    ],
                    levels: [{ id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] }],
                },
            ]),
        ];
        const result = getClassStandardsCoverage('c1', classes, students, [], rubrics);
        expect(result.covered).toHaveLength(0);
        expect(result.gap).toHaveLength(1);
        expect(result.gap[0].guid).toBe('std1');
        expect(result.gap[0].assessed).toBe(false);
    });

    it('marks a graded standard as covered with the right rubric count', () => {
        const rubrics = [
            makeRubric('r1', [
                {
                    id: 'crit1',
                    title: 'Crit',
                    description: '',
                    weight: 100,
                    linkedStandards: [
                        { guid: 'std1', description: 'Standard 1', standardSetTitle: 'CCSS', jurisdictionTitle: 'US' },
                    ],
                    levels: [{ id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] }],
                },
            ]),
        ];
        const studentRubrics: StudentRubric[] = [
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                overallComment: '',
                gradedAt: '2023-01-01',
                isPeerReview: false,
                entries: [{ criterionId: 'crit1', levelId: 'l1', selectedPoints: 9, checkedSubItems: [], comment: '' }],
            },
        ];
        const result = getClassStandardsCoverage('c1', classes, students, studentRubrics, rubrics);
        expect(result.gap).toHaveLength(0);
        expect(result.covered).toHaveLength(1);
        expect(result.covered[0].guid).toBe('std1');
        expect(result.covered[0].rubricCount).toBe(1);
        expect(result.covered[0].averagePercentage).toBe(90);
    });

    it('only considers rubrics linked to the class when rubricIds is set', () => {
        const linkedRubric = makeRubric('r1', [
            {
                id: 'crit1',
                title: 'Crit',
                description: '',
                weight: 100,
                linkedStandards: [{ guid: 'std1', description: 'In scope', standardSetTitle: '', jurisdictionTitle: '' }],
                levels: [{ id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] }],
            },
        ]);
        const unlinkedRubric = makeRubric('r2', [
            {
                id: 'crit2',
                title: 'Crit',
                description: '',
                weight: 100,
                linkedStandards: [
                    { guid: 'std2', description: 'Out of scope', standardSetTitle: '', jurisdictionTitle: '' },
                ],
                levels: [{ id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] }],
            },
        ]);
        const classesWithLink: Class[] = [{ id: 'c1', name: 'Class A', rubricIds: ['r1'] }];
        const result = getClassStandardsCoverage(
            'c1',
            classesWithLink,
            students,
            [],
            [linkedRubric, unlinkedRubric]
        );
        expect(result.gap.map((g) => g.guid)).toEqual(['std1']);
    });

    it('finds standards linked at the sub-item level', () => {
        const rubrics = [
            makeRubric('r1', [
                {
                    id: 'crit1',
                    title: 'Crit',
                    description: '',
                    weight: 100,
                    levels: [
                        {
                            id: 'l1',
                            label: 'Good',
                            minPoints: 0,
                            maxPoints: 10,
                            description: '',
                            subItems: [
                                {
                                    id: 'si1',
                                    label: 'Sub',
                                    maxPoints: 5,
                                    linkedStandards: [
                                        { guid: 'std3', description: 'Sub standard', standardSetTitle: '', jurisdictionTitle: '' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ]),
        ];
        const result = getClassStandardsCoverage('c1', classes, students, [], rubrics);
        expect(result.gap.map((g) => g.guid)).toEqual(['std3']);
    });
});
