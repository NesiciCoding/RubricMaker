import type { Class, EssayAssignment, FlashcardDeck, NewsFlash, Rubric, Student, Test, VoTrack } from '../types';
import { SCHOOL_YEAR_LABELS } from '../data/schoolYears';
import { VO_TRACK_LABELS } from '../data/voTracks';
import { htmlToPlainText } from '../hooks/useTTS';

export type SearchResultType =
    | 'rubric'
    | 'test'
    | 'student'
    | 'class'
    | 'essay'
    | 'grade'
    | 'flashcardDeck'
    | 'newsFlash';

export interface SearchResult {
    type: SearchResultType;
    id: string;
    label: string;
    sublabel?: string;
    route: string;
    /** Only set for type: 'test' results — lets the UI badge practice vs. assessment tests. */
    testMode?: 'practice' | 'assessment';
}

export interface SearchableData {
    rubrics: Rubric[];
    tests: Test[];
    students: Student[];
    classes: Class[];
    essayAssignments: EssayAssignment[];
    flashcardDecks: FlashcardDeck[];
    newsFlashes: NewsFlash[];
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
    deck: 'flashcardDeck',
    decks: 'flashcardDeck',
    flashcard: 'flashcardDeck',
    flashcards: 'flashcardDeck',
    newsflash: 'newsFlash',
    newsflashes: 'newsFlash',
};

export function normalize(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Splits a query into `type:`/`class:`/`year:`/`track:`/`mode:`/`area:` filter tokens and a
 * free-text remainder. A filter value is either a single bare word (`class:5A`) or a
 * quoted phrase for multi-word values (`class:"English 1"`) — quoting avoids ambiguity
 * with any free text that follows. `year:`/`track:` take the raw enum value (`jaar-3`,
 * `havo`), not the display label. `mode:`/`area:` only narrow test/practice results
 * (`area:` matches `Test.contentArea`: listening/reading/grammar).
 */
function parseQuery(query: string): {
    typeFilter?: SearchResultType;
    classFilter?: string;
    yearFilter?: string;
    trackFilter?: string;
    modeFilter?: 'practice' | 'assessment';
    areaFilter?: 'listening' | 'reading' | 'grammar';
    text: string;
} {
    let typeFilter: SearchResultType | undefined;
    let classFilter: string | undefined;
    let yearFilter: string | undefined;
    let trackFilter: string | undefined;
    let modeFilter: 'practice' | 'assessment' | undefined;
    let areaFilter: 'listening' | 'reading' | 'grammar' | undefined;

    const filterRegex = /\b(type|class|year|track|mode|area):(?:"([^"]*)"|(\S+))/gi;
    const remaining = query.replace(filterRegex, (match, key: string, quoted?: string, bare?: string) => {
        const value = quoted ?? bare ?? '';
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'type') {
            const alias = TYPE_ALIASES[value.toLowerCase()];
            if (!alias) return match;
            typeFilter = alias;
        } else if (lowerKey === 'class') {
            classFilter = value;
        } else if (lowerKey === 'year') {
            yearFilter = value;
        } else if (lowerKey === 'track') {
            trackFilter = value;
        } else if (lowerKey === 'mode') {
            if (value.toLowerCase() !== 'practice' && value.toLowerCase() !== 'assessment') return match;
            modeFilter = value.toLowerCase() as 'practice' | 'assessment';
        } else {
            if (
                value.toLowerCase() !== 'listening' &&
                value.toLowerCase() !== 'reading' &&
                value.toLowerCase() !== 'grammar'
            )
                return match;
            areaFilter = value.toLowerCase() as 'listening' | 'reading' | 'grammar';
        }
        return ' ';
    });

    return {
        typeFilter,
        classFilter,
        yearFilter,
        trackFilter,
        modeFilter,
        areaFilter,
        text: normalize(remaining.trim()),
    };
}

export function searchAll(query: string, data: SearchableData): SearchResult[] {
    const { typeFilter, classFilter, yearFilter, trackFilter, modeFilter, areaFilter, text } = parseQuery(query);
    if (!text && !classFilter && !typeFilter && !yearFilter && !trackFilter && !modeFilter && !areaFilter) return [];

    const classById = new Map(data.classes.map((c) => [c.id, c]));
    const normalizedClassFilter = classFilter ? normalize(classFilter) : undefined;
    const normalizedYearFilter = yearFilter ? normalize(yearFilter) : undefined;
    const normalizedTrackFilter = trackFilter ? normalize(trackFilter) : undefined;

    const matchesText = (...fields: (string | undefined)[]) =>
        !text || fields.some((f) => f && normalize(f).includes(text));

    const matchesClass = (classId: string | undefined) => {
        if (!normalizedClassFilter) return true;
        const className = classId ? classById.get(classId)?.name : undefined;
        return !!className && normalize(className).includes(normalizedClassFilter);
    };

    const matchesYear = (classId: string | undefined) => {
        if (!normalizedYearFilter) return true;
        const year = classId ? classById.get(classId)?.year : undefined;
        return !!year && normalize(year).includes(normalizedYearFilter);
    };

    const matchesTrack = (classId: string | undefined, studentVoTrack?: VoTrack) => {
        if (!normalizedTrackFilter) return true;
        const effective = studentVoTrack ?? (classId ? classById.get(classId)?.voTrack : undefined);
        return !!effective && normalize(effective).includes(normalizedTrackFilter);
    };

    const results: SearchResult[] = [];
    const seen = new Set<string>();
    const addResult = (result: SearchResult) => {
        const key = `${result.type}-${result.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push(result);
    };

    // Compound student+rubric shortcut — resolved first so it's promoted to the top of the
    // results list. A long compound query (containing both full names) generally won't also
    // satisfy the individual student/rubric blocks' own matchesText check below (that check
    // requires the *field* to contain the *whole query*, the opposite direction from here), so
    // the matched student/rubric are added directly alongside the shortcut — "not suppressed"
    // means explicitly re-added, not merely left for the later blocks to (likely never) find.
    if (
        !modeFilter &&
        !areaFilter &&
        text &&
        (!typeFilter || typeFilter === 'grade' || typeFilter === 'student' || typeFilter === 'rubric')
    ) {
        for (const s of data.students) {
            if (s.anonymizedAt) continue;
            const normName = normalize(s.name);
            if (normName.length < 3 || !text.includes(normName)) continue;
            for (const r of data.rubrics) {
                const normRubric = normalize(r.name);
                if (normRubric.length < 3 || !text.includes(normRubric)) continue;
                addResult({
                    type: 'grade',
                    id: `${s.id}:${r.id}`,
                    label: `${s.name} — ${r.name}`,
                    sublabel: classById.get(s.classId)?.name,
                    route: `/rubrics/${r.id}/grade/${s.id}`,
                });
                addResult({
                    type: 'student',
                    id: s.id,
                    label: s.name,
                    sublabel: classById.get(s.classId)?.name,
                    route: `/students/${s.id}`,
                });
                addResult({ type: 'rubric', id: r.id, label: r.name, sublabel: r.subject, route: `/rubrics/${r.id}` });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'rubric')) {
        for (const r of data.rubrics) {
            if (matchesText(r.name, r.subject, r.cefrTargetLevel)) {
                addResult({
                    type: 'rubric',
                    id: r.id,
                    label: r.name,
                    sublabel: r.subject,
                    route: `/rubrics/${r.id}`,
                });
            }
        }
    }

    if (!typeFilter || typeFilter === 'test') {
        for (const t of data.tests) {
            const effectiveMode = t.mode ?? 'assessment';
            if (modeFilter && modeFilter !== effectiveMode) continue;
            if (areaFilter && t.contentArea !== areaFilter) continue;
            if (matchesText(t.name, t.description)) {
                addResult({
                    type: 'test',
                    id: t.id,
                    label: t.name,
                    sublabel: t.description,
                    route: `/tests/${t.id}`,
                    testMode: effectiveMode,
                });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'student')) {
        for (const s of data.students) {
            if (s.anonymizedAt) continue;
            const cls = classById.get(s.classId);
            const effectiveTrack = s.voTrack ?? cls?.voTrack;
            if (
                matchesText(
                    s.name,
                    s.studentNumber,
                    cls?.year ? SCHOOL_YEAR_LABELS[cls.year] : undefined,
                    effectiveTrack ? VO_TRACK_LABELS[effectiveTrack] : undefined
                ) &&
                matchesClass(s.classId) &&
                matchesYear(s.classId) &&
                matchesTrack(s.classId, s.voTrack)
            ) {
                addResult({
                    type: 'student',
                    id: s.id,
                    label: s.name,
                    sublabel: cls?.name,
                    route: `/students/${s.id}`,
                });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'class')) {
        for (const c of data.classes) {
            if (
                matchesText(
                    c.name,
                    c.year ? SCHOOL_YEAR_LABELS[c.year] : undefined,
                    c.voTrack ? VO_TRACK_LABELS[c.voTrack] : undefined
                ) &&
                matchesClass(c.id) &&
                matchesYear(c.id) &&
                matchesTrack(c.id)
            ) {
                addResult({ type: 'class', id: c.id, label: c.name, sublabel: c.subject, route: '/students' });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'essay')) {
        const seenGroups = new Set<string>();
        for (const a of data.essayAssignments) {
            if (seenGroups.has(a.teacherKey)) continue;
            if (matchesText(a.title, a.prompt)) {
                seenGroups.add(a.teacherKey);
                addResult({ type: 'essay', id: a.teacherKey, label: a.title, route: `/essays/${a.teacherKey}` });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'flashcardDeck')) {
        for (const d of data.flashcardDecks) {
            if (matchesText(d.name, d.description)) {
                addResult({
                    type: 'flashcardDeck',
                    id: d.id,
                    label: d.name,
                    sublabel: d.description,
                    route: `/flashcards/${d.id}`,
                });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'newsFlash')) {
        for (const f of data.newsFlashes) {
            const contentText = f.content ? htmlToPlainText(f.content) : undefined;
            if (matchesText(f.title, f.summary, contentText, ...f.tags)) {
                addResult({ type: 'newsFlash', id: f.id, label: f.title, sublabel: f.summary, route: '/news-flashes' });
            }
        }
    }

    return results;
}
