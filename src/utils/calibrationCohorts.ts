/**
 * Shared per-cohort calibration used by the student profile, the CEFR overview and Settings →
 * Mastery targets.
 *
 * A *cohort* is one (school year, VO track) cell — the same key mastery targets and the CEFR
 * curriculum table are written against. Grouping students that way (rather than per class) keeps a
 * small class from calibrating on its own handful of rows, and keeps the settings screen and the
 * student pages reading the exact same numbers.
 */
import type {
    Class,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    Rubric,
    SchoolYear,
    SelfAssessment,
    Student,
    StudentRubric,
    StudentTest,
    Test,
    VoTrack,
} from '../types';
import { SCHOOL_YEARS } from '../data/schoolYears';
import { VO_TRACKS } from '../data/voTracks';
import { CEFR_SKILLS } from '../data/cefrDescriptors';
import { getStudentMasteryProfile } from './masteryProfileAggregator';
import { getCefrStudentOverview } from './cefrStudentAggregator';
import { achievedLevelForSkill } from './masteryTargetAnalysis';
import { calibrateGrammarWeights } from './grammarWeightCalibration';
import type { GrammarWeightCalibration } from './grammarWeightCalibration';
import { calibrateCefrExpectations } from './cefrExpectationCalibration';
import type { CefrExpectationCalibration, CefrSkillObservation } from './cefrExpectationCalibration';

export interface CalibrationCohortOptions {
    /** Bound on students read per cohort; the slice is id-sorted so it is stable. */
    limitPerCohort?: number;
    /** Restrict the build to one (year, track) cell — a student page only needs its own. */
    only?: { year?: SchoolYear; voTrack?: VoTrack };
}

export interface CalibrationCohortInput {
    students: Student[];
    classes: Class[];
    tests: Test[];
    studentTests: StudentTest[];
    rubrics: Rubric[];
    studentRubrics: StudentRubric[];
    flashcardDecks: FlashcardDeck[];
    flashcardAssignments: FlashcardAssignment[];
    flashcardReviews: FlashcardReview[];
    selfAssessments: SelfAssessment[];
    cefrAchieveThreshold?: number;
}

/** The subset the CEFR expectations need — no flashcard evidence is involved. */
export interface CefrExpectationInput {
    students: Student[];
    classes: Class[];
    tests: Test[];
    studentTests: StudentTest[];
    rubrics: Rubric[];
    studentRubrics: StudentRubric[];
    selfAssessments: SelfAssessment[];
    cefrAchieveThreshold?: number;
}

export interface CalibrationCohort {
    /** `${year}|${track}` — stable across renders and usable as a React key. */
    key: string;
    year: SchoolYear;
    voTrack?: VoTrack;
    classNames: string[];
    studentCount: number;
    grammar: GrammarWeightCalibration;
    cefr: CefrExpectationCalibration[];
}

export interface CefrCohortExpectations {
    key: string;
    year: SchoolYear;
    voTrack?: VoTrack;
    classNames: string[];
    studentCount: number;
    cefr: CefrExpectationCalibration[];
}

const DEFAULT_LIMIT_PER_COHORT = 200;

interface CohortGroup {
    key: string;
    year: SchoolYear;
    voTrack?: VoTrack;
    classNames: Set<string>;
    students: Student[];
}

function byId<T extends { id: string }>(a: T, b: T): number {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function cohortKey(year: SchoolYear, voTrack: VoTrack | undefined): string {
    return `${year}|${voTrack ?? ''}`;
}

function sortCohorts<T extends { year: SchoolYear; voTrack?: VoTrack }>(cohorts: T[]): T[] {
    return cohorts.sort((a, b) => {
        const yearDiff = SCHOOL_YEARS.indexOf(a.year) - SCHOOL_YEARS.indexOf(b.year);
        if (yearDiff !== 0) return yearDiff;
        return (a.voTrack ? VO_TRACKS.indexOf(a.voTrack) : -1) - (b.voTrack ? VO_TRACKS.indexOf(b.voTrack) : -1);
    });
}

/** Id-sorted groups keyed by (year, track); students whose class carries no year are skipped. */
function groupByCohort(students: Student[], classes: Class[], options: CalibrationCohortOptions = {}): CohortGroup[] {
    const classById = new Map(classes.map((c) => [c.id, c]));
    const groups = new Map<string, CohortGroup>();

    for (const student of [...students].sort(byId)) {
        const cls = student.classId ? classById.get(student.classId) : undefined;
        const year = cls?.year;
        if (!year) continue;
        const voTrack = cls?.voTrack;
        if (
            options.only &&
            (options.only.year !== year || (options.only.voTrack ?? undefined) !== (voTrack ?? undefined))
        ) {
            continue;
        }
        const key = cohortKey(year, voTrack);
        const group = groups.get(key) ?? { key, year, voTrack, classNames: new Set<string>(), students: [] };
        group.classNames.add(cls.name);
        group.students.push(student);
        groups.set(key, group);
    }

    return sortCohorts([...groups.values()]);
}

function collectCefrObservations(
    students: Student[],
    group: Pick<CohortGroup, 'year' | 'voTrack'>,
    input: CefrExpectationInput
): CefrSkillObservation[] {
    const observations: CefrSkillObservation[] = [];
    for (const s of students) {
        const overview = getCefrStudentOverview(
            s.id,
            input.studentRubrics,
            input.rubrics,
            input.selfAssessments,
            undefined,
            group.year,
            group.voTrack,
            input.tests,
            input.studentTests,
            input.cefrAchieveThreshold ?? 70
        );
        for (const skill of CEFR_SKILLS) {
            // Same level the per-skill target table compares, so calibration and comparison agree.
            const level = achievedLevelForSkill(overview.cells, skill);
            if (level) observations.push({ studentId: s.id, skill, level });
        }
    }
    return observations;
}

/**
 * Per-cohort CEFR expectation calibration only — the cheap build for pages that already have the
 * student's CEFR overview and do not need the grammar blend.
 */
export function buildCefrExpectations(
    input: CefrExpectationInput,
    options: CalibrationCohortOptions = {}
): CefrCohortExpectations[] {
    const limit = options.limitPerCohort ?? DEFAULT_LIMIT_PER_COHORT;
    return groupByCohort(input.students, input.classes, options).map((group) => {
        const students = group.students.slice(0, limit);
        return {
            key: group.key,
            year: group.year,
            voTrack: group.voTrack,
            classNames: [...group.classNames].sort(),
            studentCount: group.students.length,
            cefr: calibrateCefrExpectations(collectCefrObservations(students, group, input), group.year, group.voTrack),
        };
    });
}

/**
 * Builds the grammar blend calibration and the per-skill CEFR expectation calibration for every
 * (year, track) cell that has students. Everything that depends on collection order is sorted first,
 * so the output is a pure function of the store contents.
 */
export function buildCalibrationCohorts(
    input: CalibrationCohortInput,
    options: CalibrationCohortOptions = {}
): CalibrationCohort[] {
    const limit = options.limitPerCohort ?? DEFAULT_LIMIT_PER_COHORT;
    return groupByCohort(input.students, input.classes, options).map((group) => {
        const students = group.students.slice(0, limit);
        const grammarRows = students.flatMap((s) =>
            getStudentMasteryProfile(s.id, {
                tests: input.tests,
                studentTests: input.studentTests,
                rubrics: input.rubrics,
                studentRubrics: input.studentRubrics,
                flashcardDecks: input.flashcardDecks,
                flashcardAssignments: input.flashcardAssignments,
                flashcardReviews: input.flashcardReviews,
            })
        );
        return {
            key: group.key,
            year: group.year,
            voTrack: group.voTrack,
            classNames: [...group.classNames].sort(),
            studentCount: group.students.length,
            grammar: calibrateGrammarWeights(grammarRows),
            cefr: calibrateCefrExpectations(collectCefrObservations(students, group, input), group.year, group.voTrack),
        };
    });
}

/** The cohort a student belongs to, when their class carries a school year. */
export function cohortForStudent<T extends { key: string }>(
    cohorts: T[],
    student: Student | undefined,
    classes: Class[]
): T | undefined {
    if (!student) return undefined;
    const cls = classes.find((c) => c.id === student.classId);
    if (!cls?.year) return undefined;
    const key = cohortKey(cls.year, cls.voTrack);
    return cohorts.find((c) => c.key === key);
}

/** CEFR expectations for a student's own cohort from a `buildCefrExpectations` result. */
export function cefrExpectationsForStudent(
    cohorts: CefrCohortExpectations[],
    student: Student | undefined,
    classes: Class[]
): CefrExpectationCalibration[] | undefined {
    return cohortForStudent(cohorts, student, classes)?.cefr;
}
