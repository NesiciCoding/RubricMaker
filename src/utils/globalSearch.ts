import type {
    Class,
    EssayAssignment,
    FlashcardDeck,
    NewsFlash,
    Rubric,
    SchoolYear,
    Student,
    Test,
    VoTrack,
} from '../types';
import { SCHOOL_YEAR_LABELS, formatClassYears, getClassYears, getEffectiveSchoolYear } from '../data/schoolYears';
import { VO_TRACK_LABELS, getClassVoTracks, getEffectiveVoTrack } from '../data/voTracks';
import { htmlToPlainText } from '../hooks/useTTS';

// Keyed by object reference (not content string) so a stale cache never outlives its
// flash — edits always produce a new NewsFlash object in this codebase's immutable
// update pattern, and unreferenced entries are garbage-collected automatically.
const newsFlashPlainTextCache = new WeakMap<NewsFlash, string>();
function getNewsFlashPlainText(f: NewsFlash): string | undefined {
    if (!f.content) return undefined;
    let cached = newsFlashPlainTextCache.get(f);
    if (cached === undefined) {
        cached = htmlToPlainText(f.content);
        newsFlashPlainTextCache.set(f, cached);
    }
    return cached;
}

export type SearchResultType =
    'rubric' | 'test' | 'student' | 'class' | 'essay' | 'grade' | 'flashcardDeck' | 'newsFlash';

export interface SearchResult {
    type: SearchResultType;
    id: string;
    label: string;
    sublabel?: string;
    route: string;
    /** Only set for type: 'test' results — lets the UI badge practice/placement vs. assessment tests. */
    testMode?: Test['mode'];
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
        // The regex always captures quoted or bare, so the trailing '' is unreachable — kept for safety.
        /* v8 ignore next 1 */
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

export interface IndexedRubric {
    item: Rubric;
    normName: string;
    normSubject: string;
    normCefr: string;
}

interface IndexedTest {
    item: Test;
    normName: string;
    normDesc: string;
}

interface IndexedStudent {
    item: Student;
    normName: string;
    normNumber: string;
    normYearLabel: string;
    normTrackLabel: string;
}

interface IndexedClass {
    item: Class;
    normName: string;
    normYears: string;
    normTracks: string;
}

interface IndexedEssay {
    item: EssayAssignment;
    normTitle: string;
    normPrompt: string;
}

interface IndexedDeck {
    item: FlashcardDeck;
    normName: string;
    normDesc: string;
}

interface IndexedNews {
    item: NewsFlash;
    normTitle: string;
    normSummary: string;
    normPlain: string;
    normTags: string[];
}

export interface SearchIndex {
    rubrics: IndexedRubric[];
    tests: IndexedTest[];
    students: IndexedStudent[];
    classes: IndexedClass[];
    essays: IndexedEssay[];
    decks: IndexedDeck[];
    news: IndexedNews[];
    classById: Map<string, Class>;
    classNormNames: Map<string, string>;
}

const norm = (s: string | undefined): string => (s ? normalize(s) : '');

/**
 * Builds a normalized token index once per data-collection change.
 * Memoize the result separately from the query string (see GlobalSearch) so
 * per-keystroke searches query pre-normalized strings instead of calling
 * `normalize()` on every field of every collection on every keystroke.
 */
export function buildSearchIndex(data: SearchableData): SearchIndex {
    const classById = new Map(data.classes.map((c) => [c.id, c]));
    const classNormNames = new Map(data.classes.map((c) => [c.id, normalize(c.name)]));

    return {
        classById,
        classNormNames,
        rubrics: data.rubrics.map((r) => ({
            item: r,
            normName: norm(r.name),
            normSubject: norm(r.subject),
            normCefr: norm(r.cefrTargetLevel),
        })),
        tests: data.tests.map((t) => ({
            item: t,
            normName: norm(t.name),
            normDesc: norm(t.description),
        })),
        students: data.students.map((s) => {
            const cls = classById.get(s.classId);
            const effectiveTrack = getEffectiveVoTrack(s, cls);
            const effectiveYear = getEffectiveSchoolYear(s, cls);
            return {
                item: s,
                normName: norm(s.name),
                normNumber: norm(s.studentNumber),
                normYearLabel: effectiveYear ? norm(SCHOOL_YEAR_LABELS[effectiveYear]) : '',
                normTrackLabel: effectiveTrack ? norm(VO_TRACK_LABELS[effectiveTrack]) : '',
            };
        }),
        classes: data.classes.map((c) => ({
            item: c,
            normName: norm(c.name),
            normYears: norm(formatClassYears(c)),
            normTracks: norm(
                getClassVoTracks(c)
                    .map((tr) => VO_TRACK_LABELS[tr])
                    .join(' ')
            ),
        })),
        essays: data.essayAssignments.map((a) => ({
            item: a,
            normTitle: norm(a.title),
            normPrompt: norm(a.prompt),
        })),
        decks: data.flashcardDecks.map((d) => ({
            item: d,
            normName: norm(d.name),
            normDesc: norm(d.description),
        })),
        news: data.newsFlashes.map((f) => ({
            item: f,
            normTitle: norm(f.title),
            normSummary: norm(f.summary),
            normPlain: norm(getNewsFlashPlainText(f)),
            normTags: (f.tags ?? []).map((t) => normalize(t)),
        })),
    };
}

/**
 * Searches the teacher's corpus for a query string with optional `type:`/`class:`/
 * `year:`/`track:`/`mode:`/`area:` filters (see `parseQuery`).
 *
 * Pass a `cachedIndex` from `buildSearchIndex(data)` to query pre-normalized
 * strings instead of re-normalizing every field on every call — memoize the
 * index separately from the query string and rebuild it only when the
 * collections change. Without an index one is built inline for the call.
 */
export function searchAll(query: string, data: SearchableData, cachedIndex?: SearchIndex): SearchResult[] {
    const { typeFilter, classFilter, yearFilter, trackFilter, modeFilter, areaFilter, text } = parseQuery(query);
    if (!text && !classFilter && !typeFilter && !yearFilter && !trackFilter && !modeFilter && !areaFilter) return [];

    const idx = cachedIndex ?? buildSearchIndex(data);
    const classById = idx.classById;
    const normalizedClassFilter = classFilter ? normalize(classFilter) : undefined;
    const normalizedYearFilter = yearFilter ? normalize(yearFilter) : undefined;
    const normalizedTrackFilter = trackFilter ? normalize(trackFilter) : undefined;

    const matchesText = (...fields: string[]) => !text || fields.some((f) => f.includes(text));

    const matchesClass = (classId: string | undefined) => {
        if (!normalizedClassFilter) return true;
        const normName = classId ? idx.classNormNames.get(classId) : undefined;
        return !!normName && normName.includes(normalizedClassFilter);
    };

    const matchesYear = (classId: string | undefined, studentYear?: SchoolYear) => {
        if (!normalizedYearFilter) return true;
        // A mixed-year class matches on any of its years; a tagged student on their own year.
        const years = studentYear ? [studentYear] : getClassYears(classId ? classById.get(classId) : undefined);
        return years.some((y) => normalize(y).includes(normalizedYearFilter));
    };

    const matchesTrack = (classId: string | undefined, studentVoTrack?: VoTrack) => {
        if (!normalizedTrackFilter) return true;
        const tracks = studentVoTrack
            ? [studentVoTrack]
            : getClassVoTracks(classId ? classById.get(classId) : undefined);
        return tracks.some((tr) => normalize(tr).includes(normalizedTrackFilter));
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
        // Index already holds one normalized name per rubric/student — reuse it
        // instead of re-normalizing the full corpus on every keystroke.
        for (const { item: s, normName } of idx.students) {
            if (s.anonymizedAt) continue;
            if (normName.length < 3 || !text.includes(normName)) continue;
            for (const { item: r, normName: normRubric } of idx.rubrics) {
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
        for (const { item: r, normName, normSubject, normCefr } of idx.rubrics) {
            if (matchesText(normName, normSubject, normCefr)) {
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
        for (const { item: t, normName, normDesc } of idx.tests) {
            const effectiveMode = t.mode ?? 'assessment';
            if (modeFilter && modeFilter !== effectiveMode) continue;
            if (areaFilter && t.contentArea !== areaFilter) continue;
            if (matchesText(normName, normDesc)) {
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
        for (const { item: s, normName, normNumber, normYearLabel, normTrackLabel } of idx.students) {
            if (s.anonymizedAt) continue;
            const cls = classById.get(s.classId);
            if (
                matchesText(normName, normNumber, normYearLabel, normTrackLabel) &&
                matchesClass(s.classId) &&
                matchesYear(s.classId, s.schoolYear) &&
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
        for (const { item: c, normName, normYears, normTracks } of idx.classes) {
            if (
                matchesText(normName, normYears, normTracks) &&
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
        for (const { item: a, normTitle, normPrompt } of idx.essays) {
            if (seenGroups.has(a.teacherKey)) continue;
            if (matchesText(normTitle, normPrompt)) {
                seenGroups.add(a.teacherKey);
                addResult({ type: 'essay', id: a.teacherKey, label: a.title, route: `/essays/${a.teacherKey}` });
            }
        }
    }

    if (!modeFilter && !areaFilter && (!typeFilter || typeFilter === 'flashcardDeck')) {
        for (const { item: d, normName, normDesc } of idx.decks) {
            if (matchesText(normName, normDesc)) {
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
        for (const { item: f, normTitle, normSummary, normPlain, normTags } of idx.news) {
            if (matchesText(normTitle, normSummary, normPlain, ...normTags)) {
                addResult({ type: 'newsFlash', id: f.id, label: f.title, sublabel: f.summary, route: '/news-flashes' });
            }
        }
    }

    return results;
}
