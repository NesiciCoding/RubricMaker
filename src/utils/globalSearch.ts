import type { Class, EssayAssignment, Rubric, Student, Test } from '../types';

export type SearchResultType = 'rubric' | 'test' | 'student' | 'class' | 'essay';

export interface SearchResult {
    type: SearchResultType;
    id: string;
    label: string;
    sublabel?: string;
    route: string;
}

export interface SearchableData {
    rubrics: Rubric[];
    tests: Test[];
    students: Student[];
    classes: Class[];
    essayAssignments: EssayAssignment[];
}

const TYPE_ALIASES: Record<string, SearchResultType> = {
    rubric: 'rubric',
    rubrics: 'rubric',
    test: 'test',
    tests: 'test',
    student: 'student',
    students: 'student',
    class: 'class',
    classes: 'class',
    essay: 'essay',
    essays: 'essay',
};

function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/** Splits a query into `key:value` tokens and a free-text remainder. */
function parseQuery(query: string): { typeFilter?: SearchResultType; classFilter?: string; text: string } {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const textParts: string[] = [];
    let typeFilter: SearchResultType | undefined;
    let classFilter: string | undefined;

    for (const token of tokens) {
        const match = token.match(/^(\w+):(.+)$/);
        if (match) {
            const [, key, value] = match;
            if (key.toLowerCase() === 'type' && TYPE_ALIASES[value.toLowerCase()]) {
                typeFilter = TYPE_ALIASES[value.toLowerCase()];
                continue;
            }
            if (key.toLowerCase() === 'class') {
                classFilter = value;
                continue;
            }
        }
        textParts.push(token);
    }

    return { typeFilter, classFilter, text: normalize(textParts.join(' ')) };
}

export function searchAll(query: string, data: SearchableData): SearchResult[] {
    const { typeFilter, classFilter, text } = parseQuery(query);
    if (!text && !classFilter && !typeFilter) return [];

    const classById = new Map(data.classes.map((c) => [c.id, c]));
    const normalizedClassFilter = classFilter ? normalize(classFilter) : undefined;

    const matchesText = (...fields: (string | undefined)[]) =>
        !text || fields.some((f) => f && normalize(f).includes(text));

    const matchesClass = (classId: string | undefined) => {
        if (!normalizedClassFilter) return true;
        const className = classId ? classById.get(classId)?.name : undefined;
        return !!className && normalize(className).includes(normalizedClassFilter);
    };

    const results: SearchResult[] = [];

    if (!typeFilter || typeFilter === 'rubric') {
        for (const r of data.rubrics) {
            if (matchesText(r.name, r.subject)) {
                results.push({ type: 'rubric', id: r.id, label: r.name, sublabel: r.subject, route: `/rubrics/${r.id}` });
            }
        }
    }

    if (!typeFilter || typeFilter === 'test') {
        for (const t of data.tests) {
            if (matchesText(t.name, t.description)) {
                results.push({ type: 'test', id: t.id, label: t.name, sublabel: t.description, route: `/tests/${t.id}` });
            }
        }
    }

    if (!typeFilter || typeFilter === 'student') {
        for (const s of data.students) {
            if (s.anonymizedAt) continue;
            if (matchesText(s.name, s.studentNumber) && matchesClass(s.classId)) {
                results.push({
                    type: 'student',
                    id: s.id,
                    label: s.name,
                    sublabel: classById.get(s.classId)?.name,
                    route: `/students/${s.id}`,
                });
            }
        }
    }

    if (!typeFilter || typeFilter === 'class') {
        for (const c of data.classes) {
            if (matchesText(c.name) && matchesClass(c.id)) {
                results.push({ type: 'class', id: c.id, label: c.name, sublabel: c.subject, route: '/students' });
            }
        }
    }

    if (!typeFilter || typeFilter === 'essay') {
        const seenGroups = new Set<string>();
        for (const a of data.essayAssignments) {
            if (seenGroups.has(a.teacherKey)) continue;
            if (matchesText(a.title, a.prompt)) {
                seenGroups.add(a.teacherKey);
                results.push({ type: 'essay', id: a.teacherKey, label: a.title, route: `/essays/${a.teacherKey}` });
            }
        }
    }

    return results;
}
