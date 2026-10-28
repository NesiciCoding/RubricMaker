import type { GradeScale, Rubric, RubricBand, RubricTier, StudentRubric } from '../types';
import { calcGradeSummary } from './gradeCalc';
import { stripHtmlTags } from './exportDataPrep';
import { isTicked } from './subItems';
import { DEFAULT_BAND_COLOR, gradeTier, inTier, tierLabel } from './tieredRubric';

/** Soft panel tones of the paper sheet; band colours come from the rubric. */
export const SHEET_PANEL = '#F0EDD3';
export const SHEET_PANEL_ALT = '#F9F4F2';

/** ☑ met, ☒ not met, ☐ not judged. */
export function requirementMark(met: boolean | undefined): string {
    return met === true ? '☑' : met === false ? '☒' : '☐';
}

export interface SheetStatement {
    label: string;
    /** Set on a graded sheet only: whether the teacher ticked it. */
    ticked?: boolean;
}

export interface SheetBand {
    id: string;
    code: string;
    label: string;
    color: string;
    /** The band the teacher chose for this criterion (graded sheets only). */
    chosen: boolean;
    statements: SheetStatement[];
}

export interface SheetCriterion {
    id: string;
    title: string;
    description: string;
    /** The teacher's comment as plain text. */
    comment?: string;
    /** One entry per column in `TieredSheet.tiers`, in that order. */
    columns: SheetBand[][];
}

export interface TieredSheet {
    title: string;
    subject?: string;
    requirements: { id: string; text: string; met?: boolean }[];
    /** The tier columns printed: the grade's tier, or every tier for a blank sheet. */
    tiers: { id: string; label: string }[];
    /** Every tier's label, for the "Tier" field of a blank sheet. */
    allTierLabels: string[];
    bands: Pick<RubricBand, 'id' | 'code' | 'label'>[];
    criteria: SheetCriterion[];
    graded?: {
        studentName: string;
        tierLabel?: string;
        /** Withheld until every criterion is scored, unless a requirement or the teacher set it. */
        verdict?: { code: string; label: string; color: string };
        overallComment?: string;
    };
}

/**
 * A tiered rubric laid out like its paper sheet: requirements, then per criterion a column per tier
 * with the bands stacked and their statements as checkboxes. With a grade, only the grade's tier is
 * printed and the ticks, chosen bands, requirement results and verdict are filled in.
 */
export function buildTieredSheet(
    rubric: Pick<Rubric, 'name' | 'subject' | 'criteria' | 'tiered'> &
        Partial<Pick<Rubric, 'format' | 'scoringMode' | 'totalMaxPoints'>>,
    graded?: { sr: StudentRubric; studentName: string; scale: GradeScale | null; tier?: RubricTier }
): TieredSheet | null {
    const config = rubric.tiered;
    if (!config) return null;
    const sr = graded?.sr;
    const tier = graded ? (graded.tier ?? gradeTier(config, graded.sr)) : undefined;
    const tiers = tier ? [tier] : config.tiers;
    const bands = rubric.format?.levelOrder === 'best-first' ? [...config.bands].reverse() : config.bands;

    const criteria: SheetCriterion[] = rubric.criteria.map((c) => {
        const entry = sr?.entries.find((e) => e.criterionId === c.id);
        return {
            id: c.id,
            title: c.title,
            description: c.description,
            comment: (entry?.comment && stripHtmlTags(entry.comment).trim()) || undefined,
            columns: tiers.map((t) =>
                bands.flatMap((band) => {
                    const level = c.levels.find((l) => l.bandId === band.id);
                    if (!level) return [];
                    return [
                        {
                            id: band.id,
                            code: band.code,
                            label: band.label,
                            color: band.color ?? DEFAULT_BAND_COLOR,
                            chosen: !!entry && entry.levelId === level.id,
                            statements: (level.subItems ?? []).filter(inTier(t.id)).map((si) => ({
                                label: si.label,
                                ...(entry && { ticked: isTicked(entry, si.id) }),
                            })),
                        },
                    ];
                })
            ),
        };
    });

    let gradedPart: TieredSheet['graded'];
    if (graded && sr) {
        const summary = calcGradeSummary(sr, rubric.criteria, graded.scale, rubric);
        const complete = summary.totalCriteria > 0 && summary.gradedCount === summary.totalCriteria;
        const verdict =
            summary.verdict && (complete || summary.verdict.reason !== 'score') ? summary.verdict : undefined;
        gradedPart = {
            studentName: graded.studentName,
            tierLabel: tier ? tierLabel(tier) : undefined,
            verdict: verdict && {
                code: verdict.band.code,
                label: verdict.band.label,
                color: verdict.band.color ?? DEFAULT_BAND_COLOR,
            },
            overallComment: (sr.overallComment && stripHtmlTags(sr.overallComment).trim()) || undefined,
        };
    }

    return {
        title: rubric.name,
        subject: rubric.subject || undefined,
        requirements: (config.requirements ?? []).map((r) => ({
            id: r.id,
            text: r.text,
            ...(sr?.requirementsMet?.[r.id] !== undefined && { met: sr.requirementsMet[r.id] }),
        })),
        tiers: tiers.map((t) => ({ id: t.id, label: tierLabel(t) })),
        allTierLabels: config.tiers.map(tierLabel),
        bands: bands.map(({ id, code, label }) => ({ id, code, label })),
        criteria,
        graded: gradedPart,
    };
}
