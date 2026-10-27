/**
 * Deterministic calibration of the CEFR expectation table.
 *
 * `CEFR_TRACK_YEAR_TARGETS` is the standard: the curriculum's expected range per (year, track),
 * and what every per-skill comparison uses until a cohort has been measured broadly enough to
 * show the cell is systematically off. This module never ratchets freely — a cohort may move the
 * expectation by **one sub-level at most**, and only when a clear majority of its assessed
 * students sit on the same side of the curriculum band. The standard range stays attached to the
 * result so the UI can always show what the expectation was shifted from.
 *
 * Determinism is a hard requirement: observations are sorted numerically, the median is the lower
 * median, and every threshold is a constant — the same store always yields the same expectation.
 */
import type { CefrLevel, CefrSkill, CefrSubLevel, CefrSubLevelRange, SchoolYear, VoTrack } from '../types';
import { CEFR_SKILLS } from '../data/cefrDescriptors';
import { getCefrTargetRange } from '../data/cefrTrackYearTargets';
import { CEFR_SUBLEVEL_ORDER, cefrLevelOrdinal, cefrSubLevelOrdinal } from './cefrOrdinal';

/** Students with an achieved level for the skill before the cohort may move its expectation. */
export const MIN_CEFR_CALIBRATION_STUDENTS = 10;

/** Share of assessed students that must sit on the same side of the curriculum band. */
export const CEFR_CALIBRATION_AGREEMENT = 0.6;

/** A cohort may only nudge the expectation by one sub-level — up or down. */
export const CEFR_CALIBRATION_MAX_SHIFT = 1;

export interface CefrSkillObservation {
    studentId: string;
    skill: CefrSkill;
    /** Achieved coarse level for that skill; students without evidence are simply omitted. */
    level: CefrLevel;
}

export type CefrCalibrationReason = 'no-curriculum-range' | 'insufficient-students' | 'cohort-on-band';

export interface CefrExpectationCalibration {
    skill: CefrSkill;
    /** The curriculum's range for this (year, track) — absent when that cell has no benchmark. */
    standardRange?: CefrSubLevelRange;
    /** Range to compare against: the standard, or one sub-level above/below it once calibrated. */
    expectedRange?: CefrSubLevelRange;
    source: 'curriculum' | 'calibrated';
    /** Students with an achieved level for this skill. */
    studentCount: number;
    /** 0..1 share of those students on the side of the band that drove the shift. */
    agreement: number;
    /** Sub-levels the expectation moved; 0 when the standard applies. */
    shift: number;
    reason?: CefrCalibrationReason;
}

function shiftSubLevel(level: CefrSubLevel, steps: number): CefrSubLevel {
    const next = Math.min(CEFR_SUBLEVEL_ORDER.length - 1, Math.max(0, cefrSubLevelOrdinal(level) + steps));
    return CEFR_SUBLEVEL_ORDER[next];
}

/**
 * Compares a cohort's achieved levels per skill against the curriculum band for its (year, track).
 *
 * The lower median of the cohort decides the direction (a single strong or weak student cannot move
 * it), a supermajority decides whether it moves at all, and the move is capped at one sub-level so
 * expectations drift with the programme rather than chasing the current class. Both endpoints shift
 * together, keeping the band's width.
 */
export function calibrateCefrExpectations(
    observations: CefrSkillObservation[],
    year: SchoolYear | undefined,
    voTrack: VoTrack | undefined,
    skills: CefrSkill[] = CEFR_SKILLS
): CefrExpectationCalibration[] {
    const standard = year ? getCefrTargetRange(year, voTrack) : undefined;

    return skills.map((skill) => {
        const ordinals = observations
            .filter((o) => o.skill === skill)
            .map((o) => cefrLevelOrdinal(o.level))
            .sort((a, b) => a - b);
        const studentCount = ordinals.length;

        if (!standard) {
            return { skill, source: 'curriculum', studentCount, agreement: 0, shift: 0, reason: 'no-curriculum-range' };
        }
        if (studentCount < MIN_CEFR_CALIBRATION_STUDENTS) {
            return {
                skill,
                standardRange: standard,
                expectedRange: standard,
                source: 'curriculum',
                studentCount,
                agreement: 0,
                shift: 0,
                reason: 'insufficient-students',
            };
        }

        const minOrdinal = cefrSubLevelOrdinal(standard.min);
        const maxOrdinal = cefrSubLevelOrdinal(standard.max);
        const median = ordinals[Math.floor((studentCount - 1) / 2)];
        const direction = median < minOrdinal ? -1 : median > maxOrdinal ? 1 : 0;
        const agreeing =
            direction === -1
                ? ordinals.filter((o) => o < minOrdinal).length
                : direction === 1
                  ? ordinals.filter((o) => o > maxOrdinal).length
                  : 0;
        const agreement = studentCount > 0 ? agreeing / studentCount : 0;

        if (direction === 0 || agreement < CEFR_CALIBRATION_AGREEMENT) {
            return {
                skill,
                standardRange: standard,
                expectedRange: standard,
                source: 'curriculum',
                studentCount,
                agreement,
                shift: 0,
                reason: 'cohort-on-band',
            };
        }

        const expectedRange: CefrSubLevelRange = {
            min: shiftSubLevel(standard.min, direction * CEFR_CALIBRATION_MAX_SHIFT),
            max: shiftSubLevel(standard.max, direction * CEFR_CALIBRATION_MAX_SHIFT),
        };
        return {
            skill,
            standardRange: standard,
            expectedRange,
            source: 'calibrated',
            studentCount,
            agreement,
            shift: direction * CEFR_CALIBRATION_MAX_SHIFT,
        };
    });
}

/** Shorthand for the range a skill should be compared against; undefined when no benchmark exists. */
export function calibratedExpectationRange(
    calibrations: CefrExpectationCalibration[] | undefined,
    skill: CefrSkill
): CefrSubLevelRange | undefined {
    return calibrations?.find((c) => c.skill === skill)?.expectedRange;
}
