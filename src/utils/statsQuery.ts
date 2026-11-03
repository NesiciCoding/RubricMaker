import type {
    Class,
    GradeScale,
    Rubric,
    StatsQuery,
    StatsQueryGroupBy,
    StatsQueryMetric,
    Student,
    StudentRubric,
    StudentTest,
    Test,
} from '../types';
import { calcGradeSummary } from './gradeCalc';
import { scaleForRubric, scoredTestResults, type AssessmentKind } from './assessmentTimeline';

export const DEFAULT_PASS_THRESHOLD = 55;

export const QUERY_GROUP_BYS: StatsQueryGroupBy[] = ['student', 'class', 'assessment', 'subject', 'month', 'kind'];
export const QUERY_METRICS: StatsQueryMetric[] = [
    'avg',
    'median',
    'min',
    'max',
    'count',
    'passRate',
    'stdDev',
    'change',
];

/** One scored result — a rubric grade or a graded test — flattened so it can be filtered and grouped. */
export interface AssessmentRecord {
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
    kind: AssessmentKind;
    /** `rubric:<id>` or `test:<id>` */
    assessmentKey: string;
    assessmentName: string;
    subject: string;
    /** ISO timestamp */
    date: string;
    /** Percentage, 0–100 */
    score: number;
}

export interface RecordSources {
    students: Student[];
    classes: Class[];
    studentRubrics: StudentRubric[];
    rubrics: Rubric[];
    gradeScales: GradeScale[];
    studentTests: StudentTest[];
    tests: Test[];
    excludeNotHandedIn?: boolean;
}

export function collectAssessmentRecords({
    students,
    classes,
    studentRubrics,
    rubrics,
    gradeScales,
    studentTests,
    tests,
    excludeNotHandedIn,
}: RecordSources): AssessmentRecord[] {
    const studentById = new Map(students.map((s) => [s.id, s]));
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));
    const rubricById = new Map(rubrics.map((r) => [r.id, r]));
    const records: AssessmentRecord[] = [];

    const base = (studentId: string) => {
        const student = studentById.get(studentId);
        if (!student) return null;
        return {
            studentId,
            studentName: student.name,
            classId: student.classId,
            className: classNameById.get(student.classId) ?? '',
        };
    };

    for (const sr of studentRubrics) {
        if (excludeNotHandedIn && sr.notHandedIn) continue;
        const who = base(sr.studentId);
        const live = rubricById.get(sr.rubricId);
        const rubric = sr.rubricSnapshot ?? live;
        if (!who || !rubric) continue;
        const summary = calcGradeSummary(sr, rubric.criteria, scaleForRubric(rubric, gradeScales), rubric);
        records.push({
            ...who,
            kind: 'rubric',
            assessmentKey: `rubric:${sr.rubricId}`,
            assessmentName: live?.name ?? rubric.name,
            subject: live?.subject ?? rubric.subject ?? '',
            date: sr.gradedAt ?? rubric.createdAt,
            score: summary.modifiedPercentage,
        });
    }

    for (const result of scoredTestResults(studentTests, tests)) {
        const who = base(result.studentTest.studentId);
        if (!who) continue;
        records.push({
            ...who,
            kind: 'test',
            assessmentKey: `test:${result.test.id}`,
            assessmentName: result.test.name,
            subject: '',
            date: result.date,
            score: result.percentage,
        });
    }

    return records;
}

export function filterRecords(records: AssessmentRecord[], query: StatsQuery): AssessmentRecord[] {
    const classIds = new Set(query.classIds);
    const assessmentKeys = new Set(query.assessmentKeys);
    return records.filter((r) => {
        if (query.source !== 'all' && r.kind !== query.source) return false;
        if (classIds.size > 0 && !classIds.has(r.classId)) return false;
        if (assessmentKeys.size > 0 && !assessmentKeys.has(r.assessmentKey)) return false;
        if (query.subject && r.subject !== query.subject) return false;
        const day = r.date.slice(0, 10);
        if (query.dateFrom && day < query.dateFrom) return false;
        if (query.dateTo && day > query.dateTo) return false;
        if (query.minScore !== undefined && r.score < query.minScore) return false;
        if (query.maxScore !== undefined && r.score > query.maxScore) return false;
        return true;
    });
}

function groupKey(r: AssessmentRecord, groupBy: StatsQueryGroupBy): { key: string; label: string } {
    switch (groupBy) {
        case 'student':
            return { key: r.studentId, label: r.studentName };
        case 'class':
            return { key: r.classId, label: r.className };
        case 'assessment':
            return { key: r.assessmentKey, label: r.assessmentName };
        case 'subject':
            return { key: r.subject, label: r.subject };
        case 'month':
            return { key: r.date.slice(0, 7), label: r.date.slice(0, 7) };
        case 'kind':
            return { key: r.kind, label: r.kind };
    }
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

export function computeMetric(
    records: AssessmentRecord[],
    metric: StatsQueryMetric,
    passThreshold = DEFAULT_PASS_THRESHOLD
): number | null {
    if (records.length === 0) return null;
    const scores = records.map((r) => r.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    switch (metric) {
        case 'avg':
            return round1(mean);
        case 'median': {
            const sorted = [...scores].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return round1(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);
        }
        case 'min':
            return round1(Math.min(...scores));
        case 'max':
            return round1(Math.max(...scores));
        case 'count':
            return records.length;
        case 'passRate':
            return round1((scores.filter((s) => s >= passThreshold).length / scores.length) * 100);
        case 'stdDev':
            return round1(Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length));
        case 'change': {
            if (records.length < 2) return null;
            const byDate = [...records].sort((a, b) => a.date.localeCompare(b.date));
            return round1(byDate[byDate.length - 1].score - byDate[0].score);
        }
    }
}

export interface QueryRow {
    key: string;
    label: string;
    /** Set when grouped by assessment, so the UI can mark tests */
    kind?: AssessmentKind;
    value: number;
    count: number;
}

export interface QueryResult {
    rows: QueryRow[];
    /** Results left after filtering, before grouping */
    matchedRecords: number;
}

export function runStatsQuery(records: AssessmentRecord[], query: StatsQuery): QueryResult {
    const filtered = filterRecords(records, query);
    const groups = new Map<string, { label: string; kind?: AssessmentKind; records: AssessmentRecord[] }>();
    for (const r of filtered) {
        const { key, label } = groupKey(r, query.groupBy);
        const group = groups.get(key) ?? {
            label,
            kind: query.groupBy === 'assessment' ? r.kind : undefined,
            records: [],
        };
        group.records.push(r);
        groups.set(key, group);
    }

    let rows: QueryRow[] = [];
    for (const [key, group] of groups) {
        if (query.minCount && group.records.length < query.minCount) continue;
        const value = computeMetric(group.records, query.metric, query.passThreshold);
        if (value === null) continue;
        if (query.condition) {
            const { op, value: bound } = query.condition;
            if (op === 'lt' ? !(value < bound) : !(value > bound)) continue;
        }
        rows.push({ key, label: group.label, kind: group.kind, value, count: group.records.length });
    }

    rows.sort((a, b) =>
        query.sort === 'label'
            ? a.label.localeCompare(b.label)
            : query.sort === 'value_asc'
              ? a.value - b.value || a.label.localeCompare(b.label)
              : b.value - a.value || a.label.localeCompare(b.label)
    );
    if (query.limit && query.limit > 0) rows = rows.slice(0, query.limit);
    return { rows, matchedRecords: filtered.length };
}

export const DEFAULT_STATS_QUERY: StatsQuery = {
    source: 'all',
    classIds: [],
    assessmentKeys: [],
    groupBy: 'student',
    metric: 'avg',
    sort: 'value_desc',
};

/** Ready-made questions a teacher can start from; each id has a `statistics.query.example_<id>` label. */
export const EXAMPLE_QUERIES: { id: string; query: StatsQuery }[] = [
    {
        id: 'at_risk',
        query: {
            ...DEFAULT_STATS_QUERY,
            metric: 'avg',
            condition: { op: 'lt', value: DEFAULT_PASS_THRESHOLD },
            sort: 'value_asc',
        },
    },
    {
        id: 'declining',
        query: { ...DEFAULT_STATS_QUERY, metric: 'change', condition: { op: 'lt', value: 0 }, sort: 'value_asc' },
    },
    {
        id: 'improving',
        query: { ...DEFAULT_STATS_QUERY, metric: 'change', condition: { op: 'gt', value: 0 }, sort: 'value_desc' },
    },
    { id: 'hardest', query: { ...DEFAULT_STATS_QUERY, groupBy: 'assessment', sort: 'value_asc', limit: 10 } },
    { id: 'monthly', query: { ...DEFAULT_STATS_QUERY, groupBy: 'month', sort: 'label' } },
    { id: 'pass_rate_class', query: { ...DEFAULT_STATS_QUERY, groupBy: 'class', metric: 'passRate' } },
    { id: 'rubric_vs_test', query: { ...DEFAULT_STATS_QUERY, groupBy: 'kind' } },
    {
        id: 'inconsistent',
        query: { ...DEFAULT_STATS_QUERY, metric: 'stdDev', minCount: 3, sort: 'value_desc', limit: 10 },
    },
];
