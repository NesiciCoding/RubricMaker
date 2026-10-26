import type {
    Class,
    Rubric,
    RubricBand,
    RubricCriterion,
    RubricLevel,
    RubricTier,
    SchoolYear,
    Student,
    StudentRubric,
    SubItem,
    TieredConfig,
    TieredRequirement,
    VoTrack,
} from '../types';
import { SCHOOL_YEARS, SCHOOL_YEAR_HAS_TRACK, SCHOOL_YEAR_LABELS } from '../data/schoolYears';
import { VO_TRACKS, VO_TRACK_LABELS, getEffectiveVoTrack } from '../data/voTracks';
import { nanoid } from './nanoid';

/** Pink → olive ramp from the source sheet (IO #FFD7DE, B #EBF9D8, E #CED29F), worst → best. */
const BAND_COLOR_RAMP = ['#FFD7DE', '#FCE8C8', '#EBF9D8', '#DDE8B8', '#CED29F'];
export const DEFAULT_BAND_COLOR = '#EBF9D8';

const PRESET_BANDS: Record<number, { code: string; label: string }[]> = {
    1: [{ code: 'B', label: 'Beheerst' }],
    2: [
        { code: 'IO', label: 'In ontwikkeling' },
        { code: 'B', label: 'Beheerst' },
    ],
    3: [
        { code: 'IO', label: 'In ontwikkeling' },
        { code: 'B', label: 'Beheerst' },
        { code: 'E', label: 'Expert' },
    ],
};

export function isTiered(rubric: Pick<Rubric, 'tiered'>): boolean {
    return !!rubric.tiered;
}

/**
 * Starting bands, worst → best. Points run 0…n−1 so the lowest band scores 0%; a single band is
 * worth 1 so the rubric still has a maximum. Four or more bands get numbered codes to rename.
 */
export function bandPreset(count: number): RubricBand[] {
    const n = Math.max(1, Math.floor(count));
    const names = PRESET_BANDS[n] ?? Array.from({ length: n }, (_, i) => ({ code: String(i + 1), label: '' }));
    return names.map((name, i) => ({
        id: nanoid(),
        ...name,
        points: n === 1 ? 1 : i,
        color: BAND_COLOR_RAMP[n === 1 ? 2 : Math.round((i * (BAND_COLOR_RAMP.length - 1)) / (n - 1))],
    }));
}

/** The default columns of the sample sheet: jaar 1 Mavo / Havo / VWO. */
export function defaultTiers(): RubricTier[] {
    return [
        { id: nanoid(), year: 'jaar-1', track: 'vmbo-tl', label: 'Mavo' },
        { id: nanoid(), year: 'jaar-1', track: 'havo', label: 'Havo' },
        { id: nanoid(), year: 'jaar-1', track: 'vwo', label: 'VWO' },
    ];
}

export function createTieredConfig(): TieredConfig {
    return { tiers: defaultTiers(), bands: bandPreset(3) };
}

/**
 * Midpoint cutoffs: a band starts halfway between its points and the band below, as a share of
 * the top band's points. A student with every criterion in band k therefore gets verdict k.
 */
export function defaultCutoffs(bands: RubricBand[]): number[] {
    const max = bands.length > 0 ? bands[bands.length - 1].points : 0;
    return bands.map((band, k) => (k === 0 || max <= 0 ? 0 : ((bands[k - 1].points + band.points) / 2 / max) * 100));
}

/** Each band's lowest verdict percentage: the teacher's override, else the midpoint default. */
export function bandCutoffs(bands: RubricBand[]): number[] {
    const defaults = defaultCutoffs(bands);
    return bands.map((band, k) => band.minPercentage ?? defaults[k]);
}

export type TieredIssue =
    | 'no_bands'
    | 'no_tiers'
    | 'points_not_increasing'
    | 'no_points'
    | 'duplicate_band'
    | 'duplicate_tier'
    | 'track_without_tracks';

/** Problems that would make a tiered rubric score or display wrongly; empty when it is usable. */
export function validateTiered(config: TieredConfig): TieredIssue[] {
    const issues: TieredIssue[] = [];
    const { bands, tiers } = config;
    if (bands.length === 0) issues.push('no_bands');
    if (tiers.length === 0) issues.push('no_tiers');
    if (bands.some((b, k) => k > 0 && b.points <= bands[k - 1].points)) issues.push('points_not_increasing');
    if (bands.length > 0 && bands[bands.length - 1].points <= 0) issues.push('no_points');
    if (new Set(bands.map((b) => b.id)).size !== bands.length) issues.push('duplicate_band');
    const tierKeys = tiers.map((t) => `${t.year}|${t.track ?? ''}`);
    if (new Set(tiers.map((t) => t.id)).size !== tiers.length || new Set(tierKeys).size !== tiers.length) {
        issues.push('duplicate_tier');
    }
    if (tiers.some((t) => t.track && !SCHOOL_YEAR_HAS_TRACK[t.year])) issues.push('track_without_tracks');
    return issues;
}

/**
 * One level per band, best-first like every other rubric, matched on bandId. Existing levels keep
 * their id, description and sub-items; levels without a band are dropped. Idempotent.
 */
export function syncBandLevels(criterion: RubricCriterion, bands: RubricBand[]): RubricCriterion {
    const byBand = new Map(criterion.levels.filter((l) => l.bandId).map((l) => [l.bandId, l]));
    const levels = [...bands].reverse().map((band) => {
        const existing = byBand.get(band.id);
        const fields = { label: band.code, minPoints: band.points, maxPoints: band.points };
        return existing
            ? { ...existing, ...fields }
            : { id: nanoid(), bandId: band.id, description: '', subItems: [], ...fields };
    });
    return { ...criterion, subItemMode: 'checklist', levels };
}

/** Replaces the bands and re-derives every criterion's levels from them. */
export function applyBands(rubric: Rubric, bands: RubricBand[]): Rubric {
    if (!rubric.tiered) return rubric;
    return {
        ...rubric,
        tiered: { ...rubric.tiered, bands },
        criteria: rubric.criteria.map((c) => syncBandLevels(c, bands)),
    };
}

export function newTieredCriterion(config: TieredConfig, weight: number): RubricCriterion {
    return syncBandLevels(
        { id: nanoid(), title: '', description: '', weight, subItemMode: 'checklist', levels: [] },
        config.bands
    );
}

/** Column header: the teacher's label, else "Jaar 1 · HAVO" (or just the year). */
export function tierLabel(tier: RubricTier): string {
    if (tier.label?.trim()) return tier.label.trim();
    const year = SCHOOL_YEAR_LABELS[tier.year];
    return tier.track ? `${year} · ${VO_TRACK_LABELS[tier.track]}` : year;
}

/**
 * The tier a student is graded in by default: their class's year with their effective track,
 * else a year-only tier. Undefined when nothing matches — the teacher then picks one, because a
 * neighbouring tier's descriptors set different thresholds.
 */
export function resolveTier(
    config: TieredConfig,
    student?: Pick<Student, 'voTrack'>,
    cls?: Pick<Class, 'year' | 'voTrack'>
): RubricTier | undefined {
    const year = cls?.year;
    if (!year) return undefined;
    const track = getEffectiveVoTrack(student, cls);
    return (
        config.tiers.find((t) => t.year === year && !!t.track && t.track === track) ??
        config.tiers.find((t) => t.year === year && !t.track)
    );
}

/** The tier a grade uses: the one saved on it while it still exists, else the student's default. */
export function gradeTier(
    config: TieredConfig,
    sr: Pick<StudentRubric, 'tierId'>,
    student?: Pick<Student, 'voTrack'>,
    cls?: Pick<Class, 'year' | 'voTrack'>
): RubricTier | undefined {
    return config.tiers.find((t) => t.id === sr.tierId) ?? resolveTier(config, student, cls);
}

/** Sub-item filter for one tier: its own statements plus any shared by every tier. */
export function inTier(tierId: string | undefined): (si: SubItem) => boolean {
    return (si) => !si.tierId || si.tierId === tierId;
}

/**
 * The criteria as one tier sees them: each level keeps only that tier's statements.
 * Without a tier every statement stays, so a grade whose tier is still unknown shows them all.
 */
export function criteriaForTier(criteria: RubricCriterion[], tierId: string | undefined): RubricCriterion[] {
    if (!tierId) return criteria;
    return criteria.map((c) => ({ ...c, levels: c.levels.map((l) => levelForTier(l, tierId)) }));
}

/** One level as a tier sees it; see criteriaForTier. */
export function levelForTier(level: RubricLevel, tierId: string | undefined): RubricLevel {
    return tierId ? { ...level, subItems: (level.subItems ?? []).filter(inTier(tierId)) } : level;
}

export interface TieredVerdict {
    band: RubricBand;
    /** Why this band: the teacher chose it, a requirement capped it, or the score earned it. */
    reason: 'override' | 'requirement' | 'score';
}

/** The final verdict ("eindbeoordeling") for a grade at the given overall percentage. */
export function tieredVerdict(
    sr: Pick<StudentRubric, 'verdictOverride' | 'requirementsMet'>,
    config: TieredConfig,
    percentage: number
): TieredVerdict | null {
    const { bands } = config;
    if (bands.length === 0) return null;
    const override = bands.find((b) => b.id === sr.verdictOverride);
    if (override) return { band: override, reason: 'override' };
    if ((config.requirements ?? []).some((r) => sr.requirementsMet?.[r.id] === false)) {
        return { band: bands[0], reason: 'requirement' };
    }
    const cutoffs = bandCutoffs(bands);
    // Rounding (e.g. 2/3 stored as 66.666…) must not drop a student just below an equal cutoff.
    const reached = bands.filter((_, k) => percentage >= cutoffs[k] - 1e-9);
    return { band: reached[reached.length - 1] ?? bands[0], reason: 'score' };
}

// ─── Untrusted input (JSON import, share codes) ────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A tiered config read from a file or share code, or undefined when it can't be used as one. */
export function sanitizeTiered(raw: unknown): TieredConfig | undefined {
    if (!isRecord(raw) || !Array.isArray(raw.bands) || !Array.isArray(raw.tiers)) return undefined;
    const bands: RubricBand[] = raw.bands.filter(isRecord).flatMap((b) =>
        isString(b.id) && typeof b.code === 'string' && isNumber(b.points)
            ? [
                  {
                      id: b.id,
                      code: b.code,
                      label: typeof b.label === 'string' ? b.label : '',
                      points: b.points,
                      ...(isNumber(b.minPercentage) && { minPercentage: b.minPercentage }),
                      ...(typeof b.color === 'string' && { color: b.color }),
                  },
              ]
            : []
    );
    const tiers: RubricTier[] = raw.tiers.filter(isRecord).flatMap((t) => {
        const year = SCHOOL_YEARS.find((y) => y === t.year) as SchoolYear | undefined;
        if (!isString(t.id) || !year) return [];
        const track = VO_TRACKS.find((v) => v === t.track) as VoTrack | undefined;
        return [
            {
                id: t.id,
                year,
                ...(track && { track }),
                ...(typeof t.label === 'string' && { label: t.label }),
            },
        ];
    });
    const requirements: TieredRequirement[] = Array.isArray(raw.requirements)
        ? raw.requirements
              .filter(isRecord)
              .flatMap((r) => (isString(r.id) && typeof r.text === 'string' ? [{ id: r.id, text: r.text }] : []))
        : [];
    const config: TieredConfig = {
        tiers,
        bands,
        ...(requirements.length > 0 && { requirements }),
        ...((raw.comparativePairing === 'tier' || raw.comparativePairing === 'all') && {
            comparativePairing: raw.comparativePairing,
        }),
    };
    return validateTiered(config).length === 0 ? config : undefined;
}
