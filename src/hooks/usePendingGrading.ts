import { useMemo } from 'react';
import { useAssessment, useEssays, useGrading, useSettings, useStudents } from '../context/AppContext';
import { findPendingGrading, type PendingGradingGroup } from '../utils/pendingGrading';

export function usePendingGrading(): { pendingGroups: PendingGradingGroup[]; threshold: number } {
    // Defaulted: NotificationBell renders on nearly every page, so older test doubles may not stub these.
    const { students = [] } = useStudents();
    const { studentRubrics = [] } = useGrading();
    const { tests = [], studentTests = [] } = useAssessment();
    const { essayAssignments = [], essaySubmissions = [] } = useEssays();
    const { settings } = useSettings();
    const threshold = settings?.overdueReminderThreshold ?? 7;

    const pendingGroups = useMemo(
        () =>
            findPendingGrading({
                students,
                tests,
                studentTests,
                essayAssignments,
                essaySubmissions,
                studentRubrics,
                thresholdDays: threshold,
            }),
        [students, tests, studentTests, essayAssignments, essaySubmissions, studentRubrics, threshold]
    );

    return { pendingGroups, threshold };
}
