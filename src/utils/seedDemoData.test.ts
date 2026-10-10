import { describe, it, expect, beforeEach } from 'vitest';
import { seedDemoData } from './seedDemoData';
import { DEFAULT_MODERATION_THRESHOLD_PERCENT, getModerationQueue } from './coGradingModerationQueue';

describe('seedDemoData', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('populates classes, students, rubrics, and tests into localStorage', () => {
        seedDemoData();

        const classes = JSON.parse(localStorage.getItem('rm_classes') ?? '[]');
        const students = JSON.parse(localStorage.getItem('rm_students') ?? '[]');
        const rubrics = JSON.parse(localStorage.getItem('rm_rubrics') ?? '[]');
        const studentRubrics = JSON.parse(localStorage.getItem('rm_student_rubrics') ?? '[]');
        const tests = JSON.parse(localStorage.getItem('rm_tests') ?? '[]');
        const studentTests = JSON.parse(localStorage.getItem('rm_student_tests') ?? '[]');
        const essayAssignments = JSON.parse(localStorage.getItem('rm_essay_assignments') ?? '[]');

        expect(classes.length).toBeGreaterThan(0);
        expect(students.length).toBeGreaterThan(0);
        expect(rubrics.length).toBeGreaterThan(0);
        expect(studentRubrics.length).toBeGreaterThan(0);
        expect(tests.length).toBeGreaterThan(0);
        expect(studentTests.length).toBeGreaterThan(0);
        expect(essayAssignments.length).toBeGreaterThan(0);

        const classIds = new Set(classes.map((c: { id: string }) => c.id));
        expect(students.every((s: { classId: string }) => classIds.has(s.classId))).toBe(true);
    });

    it('is safe to call twice in a row — each call overwrites with a fresh, same-shaped dataset', () => {
        seedDemoData();
        const firstCount = JSON.parse(localStorage.getItem('rm_classes') ?? '[]').length;
        seedDemoData();
        const secondCount = JSON.parse(localStorage.getItem('rm_classes') ?? '[]').length;
        expect(secondCount).toBe(firstCount);
    });

    it('seeds a co-grading dispute that shows in the moderation queue at the default threshold', () => {
        seedDemoData();
        const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? '[]');
        const queue = getModerationQueue(
            read('rm_rubrics'),
            read('rm_student_rubrics'),
            read('rm_peer_reviews'),
            read('rm_students'),
            DEFAULT_MODERATION_THRESHOLD_PERCENT
        );
        expect(queue).toHaveLength(1);
    });
});
