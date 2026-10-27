import { describe, expect, it } from 'vitest';
import type { Student } from '../types';
import { buildRubricHTML } from './pdfExport';
import {
    TOTAL_POINTS_PERCENT,
    WEIGHTED_PERCENT,
    makeTotalPointsGrade,
    makeTotalPointsRubric,
    totalPointsScale,
} from '../test-utils/totalPointsRubric';

describe('buildRubricHTML on a total-points rubric', () => {
    it('prints the same percentage and letter as GradeStudent', () => {
        const student = { id: 'tp-student', name: 'Alice', classId: 'k1' } as Student;
        const html = buildRubricHTML(makeTotalPointsGrade(), makeTotalPointsRubric(), student, totalPointsScale);

        expect(html).toContain(`${TOTAL_POINTS_PERCENT.toFixed(1)}%`);
        expect(html).toMatch(/line-height:1">B<\/div>/);
        expect(html).not.toContain(`${WEIGHTED_PERCENT.toFixed(1)}%`);
    });
});
