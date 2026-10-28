import { describe, it, expect } from 'vitest';
import {
    CEFR_CALIBRATION_AGREEMENT,
    MIN_CEFR_CALIBRATION_STUDENTS,
    calibrateCefrExpectations,
    calibratedExpectationRange,
} from './cefrExpectationCalibration';
import type { CefrSkillObservation } from './cefrExpectationCalibration';
import type { CefrLevel, CefrSkill } from '../types';
import { cefrSubLevelOrdinal } from './cefrOrdinal';

/** jaar-2 / havo expects B1-; jaar-3 / vwo expects B1–B2. */
const HAVO_2: [string, string] = ['jaar-2', 'havo'];

function observations(skill: CefrSkill, levels: CefrLevel[]): CefrSkillObservation[] {
    return levels.map((level, i) => ({ studentId: `s${i}`, skill, level }));
}

function repeat(level: CefrLevel, count: number): CefrLevel[] {
    return Array.from({ length: count }, () => level);
}

function calibrateWriting(levels: CefrLevel[], year: string = HAVO_2[0], track: string = HAVO_2[1]) {
    const rows = calibrateCefrExpectations(observations('writing', levels), year as never, track as never, ['writing']);
    return rows[0];
}

describe('calibrateCefrExpectations — curriculum first', () => {
    it('has no range to fall back on without a year', () => {
        const rows = calibrateCefrExpectations(observations('writing', repeat('B1', 20)), undefined, undefined);
        expect(rows).toHaveLength(5);
        expect(rows.every((r) => r.source === 'curriculum' && r.reason === 'no-curriculum-range')).toBe(true);
        expect(rows.every((r) => r.expectedRange === undefined)).toBe(true);
    });

    it(`keeps the curriculum band below ${MIN_CEFR_CALIBRATION_STUDENTS} assessed students`, () => {
        const row = calibrateWriting(repeat('A2', MIN_CEFR_CALIBRATION_STUDENTS - 1));
        expect(row.source).toBe('curriculum');
        expect(row.reason).toBe('insufficient-students');
        expect(row.studentCount).toBe(MIN_CEFR_CALIBRATION_STUDENTS - 1);
        expect(row.expectedRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
        expect(row.standardRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
    });

    it('ignores skills the cohort has no evidence for', () => {
        const rows = calibrateCefrExpectations(observations('writing', repeat('B1', 12)), 'jaar-2', 'havo');
        const reading = rows.find((r) => r.skill === 'reading')!;
        expect(reading.studentCount).toBe(0);
        expect(reading.source).toBe('curriculum');
        expect(reading.expectedRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
    });
});

describe('calibrateCefrExpectations — bounded shifts', () => {
    it('moves the expectation down one sub-level when the cohort sits below the band', () => {
        const row = calibrateWriting(repeat('A2', 12));
        expect(row.source).toBe('calibrated');
        expect(row.shift).toBe(-1);
        expect(row.agreement).toBe(1);
        expect(row.expectedRange).toEqual({ min: 'a2-plus', max: 'a2-plus' });
        expect(row.standardRange).toEqual({ min: 'b1-minus', max: 'b1-minus' });
    });

    it('moves the expectation up one sub-level when the cohort sits above the band', () => {
        const row = calibrateWriting(repeat('B2', 12));
        expect(row.source).toBe('calibrated');
        expect(row.shift).toBe(1);
        expect(row.expectedRange).toEqual({ min: 'b1', max: 'b1' });
    });

    it('never moves more than one sub-level, however far off the cohort is', () => {
        const row = calibrateWriting(repeat('C2', 40));
        expect(row.shift).toBe(1);
        expect(row.expectedRange).toEqual({ min: 'b1', max: 'b1' });
        expect(cefrSubLevelOrdinal(row.expectedRange!.min) - cefrSubLevelOrdinal(row.standardRange!.min)).toBe(1);
    });

    it('keeps the band width when it shifts a range', () => {
        const rows = calibrateCefrExpectations(observations('writing', repeat('C1', 12)), 'jaar-3', 'vwo', ['writing']);
        const row = rows[0];
        expect(row.standardRange).toEqual({ min: 'b1', max: 'b2' });
        expect(row.expectedRange).toEqual({ min: 'b1-plus', max: 'b2-plus' });
        const width = (r: { min: string; max: string }) =>
            cefrSubLevelOrdinal(r.max as never) - cefrSubLevelOrdinal(r.min as never);
        expect(width(row.expectedRange!)).toBe(width(row.standardRange!));
    });
});

describe('calibrateCefrExpectations — agreement gate', () => {
    it('stays on the band when the cohort is split evenly', () => {
        const row = calibrateWriting([...repeat('A2', 5), ...repeat('B2', 5)]);
        expect(row.source).toBe('curriculum');
        expect(row.reason).toBe('cohort-on-band');
        expect(row.shift).toBe(0);
        expect(row.agreement).toBeCloseTo(0.5, 5);
    });

    it(`shifts at exactly ${CEFR_CALIBRATION_AGREEMENT} agreement`, () => {
        const row = calibrateWriting([...repeat('A2', 6), ...repeat('B2', 4)]);
        expect(row.agreement).toBeCloseTo(CEFR_CALIBRATION_AGREEMENT, 5);
        expect(row.source).toBe('calibrated');
        expect(row.shift).toBe(-1);
    });

    it('stays on the band just below the agreement threshold', () => {
        const row = calibrateWriting([...repeat('A2', 5), ...repeat('B2', 4), ...repeat('B1', 1)]);
        // Median is still A2, but only 5/10 sit below the band.
        expect(row.agreement).toBeCloseTo(0.5, 5);
        expect(row.source).toBe('curriculum');
    });
});

describe('calibrateCefrExpectations — determinism and scoping', () => {
    it('does not depend on observation order', () => {
        const input = [...repeat('A2', 8), ...repeat('B1', 4)].map((level, i) => ({
            studentId: `s${i}`,
            skill: 'writing' as CefrSkill,
            level,
        }));
        const forward = calibrateCefrExpectations(input, 'jaar-2', 'havo');
        const reversed = calibrateCefrExpectations([...input].reverse(), 'jaar-2', 'havo');
        expect(reversed).toEqual(forward);
    });

    it('calibrates each skill independently', () => {
        const rows = calibrateCefrExpectations(
            [...observations('writing', repeat('A2', 12)), ...observations('reading', repeat('B2', 12))],
            'jaar-2',
            'havo'
        );
        const writing = rows.find((r) => r.skill === 'writing')!;
        const reading = rows.find((r) => r.skill === 'reading')!;
        expect(writing.shift).toBe(-1);
        expect(reading.shift).toBe(1);
        expect(rows.find((r) => r.skill === 'listening')!.source).toBe('curriculum');
    });

    it('reports only the requested skills', () => {
        const rows = calibrateCefrExpectations(observations('writing', repeat('A2', 12)), 'jaar-2', 'havo', [
            'writing',
            'reading',
        ]);
        expect(rows.map((r) => r.skill)).toEqual(['writing', 'reading']);
    });
});

describe('calibratedExpectationRange', () => {
    it('returns the calibrated range, else the standard, and nothing without a benchmark', () => {
        const rows = calibrateCefrExpectations(observations('writing', repeat('A2', 12)), 'jaar-2', 'havo');
        expect(calibratedExpectationRange(rows, 'writing')).toEqual({ min: 'a2-plus', max: 'a2-plus' });
        expect(calibratedExpectationRange(rows, 'reading')).toEqual({ min: 'b1-minus', max: 'b1-minus' });
        expect(calibratedExpectationRange(undefined, 'writing')).toBeUndefined();
    });
});
