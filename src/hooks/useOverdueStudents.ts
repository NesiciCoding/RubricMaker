import { useMemo } from 'react';
import { useGrading, useSettings, useStudents } from '../context/AppContext';

export interface OverdueStudent {
    studentId: string;
    studentName: string;
    daysSince: number;
    lastGradedAt: string;
}

export function useOverdueStudents(): {
    overdueStudents: OverdueStudent[];
    threshold: number;
} {
    const { students } = useStudents();
    const { studentRubrics } = useGrading();

    const { settings } = useSettings();

    const threshold = settings.overdueReminderThreshold ?? 7;

    const overdueStudents = useMemo(() => {
        const lastGraded = new Map<string, string>(); // studentId → most recent gradedAt
        for (const sr of studentRubrics) {
            if (!sr.gradedAt) continue;
            const current = lastGraded.get(sr.studentId);
            if (!current || sr.gradedAt > current) {
                lastGraded.set(sr.studentId, sr.gradedAt);
            }
        }

        const result: OverdueStudent[] = [];
        for (const [studentId, gradedAt] of lastGraded) {
            const daysSince = Math.floor((Date.now() - new Date(gradedAt).getTime()) / 86_400_000);
            if (daysSince >= threshold) {
                const student = students.find((s) => s.id === studentId);
                if (student) {
                    result.push({ studentId, studentName: student.name, daysSince, lastGradedAt: gradedAt });
                }
            }
        }

        return result.sort((a, b) => b.daysSince - a.daysSince);
    }, [studentRubrics, students, threshold]);

    return { overdueStudents, threshold };
}
