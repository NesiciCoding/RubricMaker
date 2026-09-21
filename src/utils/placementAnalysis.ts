import type { Test, StudentTest, CefrLevel } from '../types';
import { estimatePlacement } from './placementResult';
import { autoScoreResponse } from './testCalc';
import { sectionQuestions } from './placementRouting';
import { CEFR_LEVELS } from '../data/cefrDescriptors';

// Placement-test analytics — the class-level equivalents of the point-based ClassAverageAdjuster /
// ItemAnalysisPanel / summary export, which don't apply to a placement run (no fixed max points, and
// the result is a provisional CEFR level, not a score). Sources: each submission's server-authoritative
// trace — `levelPath` (+ `askedQuestionSnapshots`) for staircase/generator runs, `sectionPath` + answers
// for MST runs.

/** Most recent submitted/graded attempt per student, so a retake doesn't double-count. */
function latestPerStudent(studentTests: StudentTest[]): StudentTest[] {
    const byStudent = new Map<string, StudentTest>();
    for (const st of studentTests) {
        if (st.status !== 'submitted' && st.status !== 'graded') continue;
        const prev = byStudent.get(st.studentId);
        const at = st.submittedAt ?? st.startedAt;
        const prevAt = prev ? (prev.submittedAt ?? prev.startedAt) : '';
        if (!prev || at > prevAt) byStudent.set(st.studentId, st);
    }
    return [...byStudent.values()];
}

export interface PlacementLevelBucket {
    level: CefrLevel;
    count: number;
    studentNames: string[];
}

export interface PlacementLevelDistribution {
    buckets: PlacementLevelBucket[];
    assessed: number;
    /** Submitted runs that produced no estimate (e.g. an unconfigured section path). */
    unplaced: number;
}

export function placementLevelDistribution(
    test: Test,
    studentTests: StudentTest[],
    studentNameById: Map<string, string>
): PlacementLevelDistribution {
    const byLevel = new Map<CefrLevel, string[]>();
    let assessed = 0;
    let unplaced = 0;
    for (const st of latestPerStudent(studentTests)) {
        const estimate = estimatePlacement(test, st);
        if (!estimate) {
            unplaced += 1;
            continue;
        }
        assessed += 1;
        const name = studentNameById.get(st.studentId) ?? st.studentId;
        const list = byLevel.get(estimate.level) ?? [];
        list.push(name);
        byLevel.set(estimate.level, list);
    }
    const buckets = CEFR_LEVELS.map((level) => ({
        level,
        count: byLevel.get(level)?.length ?? 0,
        studentNames: (byLevel.get(level) ?? []).sort((a, b) => a.localeCompare(b)),
    }));
    return { buckets, assessed, unplaced };
}

export interface PlacementItemStat {
    questionId: string;
    prompt: string;
    level?: CefrLevel;
    asked: number;
    correct: number;
    /** Proportion correct, 0–100 (a p-value / difficulty index). */
    pct: number;
}

export function placementItemAnalysis(test: Test, studentTests: StudentTest[]): PlacementItemStat[] {
    const stat = new Map<string, { prompt: string; level?: CefrLevel; asked: number; correct: number }>();
    const testQById = new Map((test.questions ?? []).map((q) => [q.id, q]));

    const bump = (id: string, prompt: string, correct: boolean, level?: CefrLevel) => {
        const s = stat.get(id) ?? { prompt, level, asked: 0, correct: 0 };
        s.asked += 1;
        if (correct) s.correct += 1;
        if (!s.prompt && prompt) s.prompt = prompt;
        if (!s.level && level) s.level = level;
        stat.set(id, s);
    };

    for (const st of latestPerStudent(studentTests)) {
        if (st.levelPath?.length) {
            const snapById = new Map((st.askedQuestionSnapshots ?? []).map((q) => [q.id, q]));
            for (const step of st.levelPath) {
                const q = snapById.get(step.questionId) ?? testQById.get(step.questionId);
                bump(step.questionId, q?.prompt ?? step.questionId, step.correct, step.level);
            }
        } else if (st.sectionPath?.length) {
            const responseById = new Map(st.answers.map((a) => [a.questionId, a.response]));
            for (const sectionId of st.sectionPath) {
                const section = (test.sections ?? []).find((s) => s.id === sectionId);
                for (const q of sectionQuestions(test, sectionId)) {
                    const response = responseById.get(q.id) ?? '';
                    bump(q.id, q.prompt, autoScoreResponse(q, response) >= q.points, section?.cefrLevel);
                }
            }
        }
    }

    return [...stat.entries()]
        .map(([questionId, s]) => ({
            questionId,
            prompt: s.prompt,
            level: s.level,
            asked: s.asked,
            correct: s.correct,
            pct: s.asked > 0 ? (s.correct / s.asked) * 100 : 0,
        }))
        .sort((a, b) => a.pct - b.pct);
}

export interface PlacementSummaryRow {
    studentName: string;
    level: CefrLevel;
    questionsAsked: number;
    assessedAt: string;
}

export function placementSummaryRows(
    test: Test,
    studentTests: StudentTest[],
    studentNameById: Map<string, string>
): PlacementSummaryRow[] {
    const rows: PlacementSummaryRow[] = [];
    for (const st of latestPerStudent(studentTests)) {
        const estimate = estimatePlacement(test, st);
        if (!estimate) continue;
        rows.push({
            studentName: studentNameById.get(st.studentId) ?? st.studentId,
            level: estimate.level,
            questionsAsked: estimate.path.length,
            assessedAt: st.submittedAt ?? st.startedAt,
        });
    }
    return rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

function csvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function placementSummaryCsv(rows: PlacementSummaryRow[], header: string[]): string {
    const body = rows.map((r) =>
        [r.studentName, r.level, String(r.questionsAsked), r.assessedAt].map(csvCell).join(',')
    );
    return [header.map(csvCell).join(','), ...body].join('\n');
}
