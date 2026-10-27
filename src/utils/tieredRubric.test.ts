import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT } from '../types';
import type { Rubric, RubricBand, RubricCriterion, ScoreEntry, StudentRubric, TieredConfig } from '../types';
import sheet from './import/__fixtures__/tiered-rubric/grote-opdracht-y1-p1.json';
import { calcGradeSummary } from './gradeCalc';
import { cloneRubricForCopy } from './rubricClone';
import { decodeRubricShareCode, encodeRubricShareCode } from './rubricImport';
import { buildRubricHTML } from './pdfExport';
import {
    DEFAULT_BAND_COLOR,
    applyBands,
    bandCutoffs,
    bandPreset,
    createTieredConfig,
    defaultCutoffs,
    gradeTier,
    inTier,
    isTiered,
    newTieredCriterion,
    resolveTier,
    sanitizeTiered,
    syncBandLevels,
    tierLabel,
    tieredVerdict,
    validateTiered,
} from './tieredRubric';

/** The MY ID card sheet as a tiered rubric: 4 criteria × 3 tiers × IO/B/E, statements as tier-tagged sub-items. */
function sheetRubric(): Rubric {
    const bands: RubricBand[] = sheet.bands.map((b, i) => ({
        id: b.id,
        code: b.code,
        label: b.label,
        points: i,
        color: b.color,
    }));
    const tiered: TieredConfig = {
        tiers: sheet.tiers.map((t) => ({
            id: t.id,
            year: t.year as 'jaar-1',
            track: t.track as 'vmbo-tl' | 'havo' | 'vwo',
            label: t.label,
        })),
        bands,
        requirements: sheet.requirements.map((text, i) => ({ id: `req${i + 1}`, text })),
    };
    const cells = (c: (typeof sheet.criteria)[number]) => c.cells as Record<string, Record<string, string[]>>;
    const criteria = sheet.criteria.map((c, ci) => {
        const base = syncBandLevels({ id: `c${ci}`, title: c.title, description: '', weight: 25, levels: [] }, bands);
        return {
            ...base,
            levels: base.levels.map((level) => ({
                ...level,
                subItems: tiered.tiers.flatMap((tier) =>
                    cells(c)[tier.id][level.bandId!].map((label, i) => ({
                        id: `c${ci}-${tier.id}-${level.bandId}-${i}`,
                        label,
                        tierId: tier.id,
                    }))
                ),
            })),
        };
    });
    return {
        id: 'r1',
        name: sheet.title,
        subject: 'Engels',
        description: '',
        criteria,
        gradeScaleId: 'letter-10',
        format: { ...DEFAULT_FORMAT, levelOrder: 'worst-first' },
        attachmentIds: [],
        createdAt: '',
        updatedAt: '',
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        tiered,
    };
}

function gradeAt(rubric: Rubric, bandIds: string[], extra: Partial<StudentRubric> = {}): StudentRubric {
    const entries: ScoreEntry[] = rubric.criteria.map((c, i) => ({
        criterionId: c.id,
        levelId: c.levels.find((l) => l.bandId === bandIds[i])?.id ?? null,
        comment: '',
        checkedSubItems: [],
    }));
    return {
        id: 'sr1',
        rubricId: rubric.id,
        studentId: 's1',
        entries,
        overallComment: '',
        isPeerReview: false,
        ...extra,
    };
}

describe('bandPreset', () => {
    it('gives the Dutch IO/B/E defaults with the sheet colours and points 0..n-1', () => {
        const bands = bandPreset(3);
        expect(bands.map((b) => [b.code, b.label, b.points, b.color])).toEqual([
            ['IO', 'In ontwikkeling', 0, '#FFD7DE'],
            ['B', 'Beheerst', 1, '#EBF9D8'],
            ['E', 'Expert', 2, '#CED29F'],
        ]);
        expect(new Set(bands.map((b) => b.id)).size).toBe(3);
    });

    it('keeps a single band worth a point, and numbers longer presets', () => {
        expect(bandPreset(1).map((b) => [b.code, b.points])).toEqual([['B', 1]]);
        expect(bandPreset(2).map((b) => b.code)).toEqual(['IO', 'B']);
        expect(bandPreset(5).map((b) => [b.code, b.points])).toEqual([
            ['1', 0],
            ['2', 1],
            ['3', 2],
            ['4', 3],
            ['5', 4],
        ]);
        expect(bandPreset(0)).toHaveLength(1);
        for (let n = 1; n <= 6; n++)
            expect(validateTiered({ tiers: createTieredConfig().tiers, bands: bandPreset(n) })).toEqual([]);
    });
});

describe('verdict cutoffs', () => {
    it('puts each band halfway above the one below', () => {
        expect(defaultCutoffs(bandPreset(3))).toEqual([0, 25, 75]);
        expect(defaultCutoffs([])).toEqual([]);
        const flat = bandPreset(2).map((b) => ({ ...b, points: 0 }));
        expect(defaultCutoffs(flat)).toEqual([0, 0]);
    });

    it('lets the teacher override a cutoff', () => {
        const bands = bandPreset(3);
        bands[2].minPercentage = 90;
        expect(bandCutoffs(bands)).toEqual([0, 25, 90]);
    });

    it.each([1, 2, 3, 4, 5])('gives verdict k when every criterion is in band k (%i bands)', (n) => {
        const rubric = applyBands(sheetRubric(), bandPreset(n));
        for (const band of rubric.tiered!.bands) {
            const sr = gradeAt(
                rubric,
                rubric.criteria.map(() => band.id)
            );
            expect(calcGradeSummary(sr, rubric.criteria, null, rubric).letterGrade).toBe(band.code);
        }
    });
});

describe('validateTiered', () => {
    const tiers = createTieredConfig().tiers;

    it('accepts the default config', () => {
        expect(validateTiered(createTieredConfig())).toEqual([]);
    });

    it('reports every structural problem', () => {
        const [io, b] = bandPreset(2);
        expect(validateTiered({ tiers: [], bands: [] })).toEqual(['no_bands', 'no_tiers']);
        expect(validateTiered({ tiers, bands: [b, io] })).toContain('points_not_increasing');
        expect(validateTiered({ tiers, bands: [{ ...io, points: 0 }] })).toContain('no_points');
        expect(validateTiered({ tiers, bands: [io, { ...b, id: io.id }] })).toContain('duplicate_band');
        expect(validateTiered({ tiers: [tiers[0], { ...tiers[0], id: 'other' }], bands: [io, b] })).toContain(
            'duplicate_tier'
        );
        expect(validateTiered({ tiers: [{ id: 'g7', year: 'groep-7', track: 'havo' }], bands: [io, b] })).toEqual([
            'track_without_tracks',
        ]);
    });
});

describe('syncBandLevels', () => {
    it('derives one best-first, fixed-point checklist level per band', () => {
        const bands = bandPreset(3);
        const c = newTieredCriterion({ tiers: [], bands }, 50);
        expect(c.subItemMode).toBe('checklist');
        expect(c.weight).toBe(50);
        expect(c.levels.map((l) => [l.bandId, l.label, l.minPoints, l.maxPoints])).toEqual([
            [bands[2].id, 'E', 2, 2],
            [bands[1].id, 'B', 1, 1],
            [bands[0].id, 'IO', 0, 0],
        ]);
    });

    it('never rekeys a level, keeps its content, and is idempotent', () => {
        const bands = bandPreset(3);
        const c = newTieredCriterion({ tiers: [], bands }, 50);
        const withText = {
            ...c,
            levels: c.levels.map((l) => ({
                ...l,
                description: `d-${l.label}`,
                subItems: [{ id: `s-${l.id}`, label: 'x' }],
            })),
        };
        const renamed = bands.map((b) => (b.code === 'B' ? { ...b, code: 'V', points: 3 } : b));
        const resynced = syncBandLevels(withText, renamed);
        expect(resynced.levels.map((l) => l.id)).toEqual(c.levels.map((l) => l.id));
        const v = resynced.levels.find((l) => l.bandId === bands[1].id)!;
        expect([v.label, v.minPoints, v.description, v.subItems[0].id]).toEqual(['V', 3, 'd-B', `s-${v.id}`]);
        expect(syncBandLevels(resynced, renamed)).toEqual(resynced);
    });

    it('adds a level for a new band, drops removed bands and levels without a band', () => {
        const bands = bandPreset(2);
        const c = newTieredCriterion({ tiers: [], bands }, 50);
        const stray = { id: 'stray', label: 'Old', minPoints: 0, maxPoints: 9, description: '', subItems: [] };
        const extra: RubricBand = { id: 'x', code: 'E', label: '', points: 5 };
        const next = syncBandLevels({ ...c, levels: [...c.levels, stray] }, [bands[1], extra]);
        expect(next.levels.map((l) => l.bandId)).toEqual(['x', bands[1].id]);
        expect(next.levels[1].id).toBe(c.levels.find((l) => l.bandId === bands[1].id)!.id);
    });

    it('re-derives every criterion through applyBands, and leaves non-tiered rubrics alone', () => {
        const rubric = sheetRubric();
        const bands = rubric.tiered!.bands.map((b) => ({ ...b, points: b.points * 2 }));
        const next = applyBands(rubric, bands);
        expect(next.tiered!.bands).toBe(bands);
        expect(next.criteria.every((c) => c.levels[0].maxPoints === 4)).toBe(true);
        const plain = { ...rubric, tiered: undefined };
        expect(applyBands(plain, bands)).toBe(plain);
        expect(isTiered(rubric)).toBe(true);
        expect(isTiered(plain)).toBe(false);
    });
});

describe('tiers', () => {
    const config = sheetRubric().tiered!;
    const [mavo, havo] = config.tiers;
    const withYearOnly: TieredConfig = { ...config, tiers: [...config.tiers, { id: 'j2', year: 'jaar-2' }] };

    it('labels a tier by its override, else year and track', () => {
        expect(tierLabel(mavo)).toBe('Mavo');
        expect(tierLabel({ id: 't', year: 'jaar-2', track: 'havo' })).toBe('Jaar 2 · HAVO');
        expect(tierLabel({ id: 't', year: 'groep-8', label: '  ' })).toBe('Groep 8');
    });

    it("resolves a student's tier from the class year and their effective track", () => {
        expect(resolveTier(config, {}, { year: 'jaar-1', voTrack: 'havo' })).toBe(havo);
        expect(resolveTier(config, { voTrack: 'vmbo-tl' }, { year: 'jaar-1', voTrack: 'havo' })).toBe(mavo);
        expect(resolveTier(withYearOnly, {}, { year: 'jaar-2', voTrack: 'vwo' })?.id).toBe('j2');
    });

    it('leaves the choice to the teacher when nothing matches', () => {
        expect(resolveTier(config, {}, { voTrack: 'havo' })).toBeUndefined();
        expect(resolveTier(config, {}, { year: 'jaar-1' })).toBeUndefined();
        expect(resolveTier(config, {}, { year: 'jaar-1', voTrack: 'vmbo-kb' })).toBeUndefined();
        expect(resolveTier(config, undefined, undefined)).toBeUndefined();
    });

    it('keeps the tier saved on a grade while it exists', () => {
        const cls = { year: 'jaar-1' as const, voTrack: 'havo' as const };
        expect(gradeTier(config, { tierId: mavo.id }, {}, cls)).toBe(mavo);
        expect(gradeTier(config, { tierId: 'deleted' }, {}, cls)).toBe(havo);
        expect(gradeTier(config, {}, {}, cls)).toBe(havo);
    });

    it("filters sub-items to a tier's own statements plus shared ones", () => {
        const items = [
            { id: 'a', label: 'a', tierId: mavo.id },
            { id: 'b', label: 'b', tierId: havo.id },
            { id: 'c', label: 'c' },
        ];
        expect(items.filter(inTier(havo.id)).map((s) => s.id)).toEqual(['b', 'c']);
        expect(items.filter(inTier(undefined)).map((s) => s.id)).toEqual(['c']);
    });
});

describe('tieredVerdict', () => {
    const rubric = sheetRubric();
    const [io, b, e] = rubric.tiered!.bands;

    it('earns a band from the percentage', () => {
        expect(tieredVerdict({}, rubric.tiered!, 24.9)).toEqual({ band: io, reason: 'score' });
        expect(tieredVerdict({}, rubric.tiered!, 25)).toEqual({ band: b, reason: 'score' });
        expect(tieredVerdict({}, rubric.tiered!, 100)).toEqual({ band: e, reason: 'score' });
        // 2/3 = 66.66…% must reach a 66.66…% cutoff despite floating-point noise.
        const thirds = { ...rubric.tiered!, bands: [io, { ...b, minPercentage: 200 / 3 }] };
        expect(tieredVerdict({}, thirds, (2 / 3) * 100)?.band).toBe(thirds.bands[1]);
    });

    it('caps the verdict at the lowest band when a requirement is explicitly unmet', () => {
        expect(tieredVerdict({ requirementsMet: { req2: false } }, rubric.tiered!, 100)).toEqual({
            band: io,
            reason: 'requirement',
        });
        expect(tieredVerdict({ requirementsMet: { req2: true } }, rubric.tiered!, 100)?.band).toBe(e);
    });

    it("lets the teacher's override win, ignoring an unknown band id", () => {
        expect(tieredVerdict({ verdictOverride: b.id, requirementsMet: { req1: false } }, rubric.tiered!, 0)).toEqual({
            band: b,
            reason: 'override',
        });
        expect(tieredVerdict({ verdictOverride: 'gone' }, rubric.tiered!, 0)?.reason).toBe('score');
    });

    it('has no verdict without bands', () => {
        expect(tieredVerdict({}, { tiers: [], bands: [] }, 50)).toBeNull();
    });
});

describe('verdict in calcGradeSummary', () => {
    const rubric = sheetRubric();
    const [io, b, e] = rubric.tiered!.bands;

    it("reports the band code and colour as the grade, as the sheet's Eindbeoordeling", () => {
        // B, B, E, E → 6/8 = 75% → E; all B → 50% → B.
        const mixed = calcGradeSummary(gradeAt(rubric, [b.id, b.id, e.id, e.id]), rubric.criteria, null, rubric);
        expect(mixed.percentage).toBe(75);
        expect([mixed.letterGrade, mixed.gradeColor, mixed.verdict?.reason]).toEqual(['E', e.color, 'score']);
        const allB = calcGradeSummary(gradeAt(rubric, [b.id, b.id, b.id, b.id]), rubric.criteria, null, rubric);
        expect(allB.letterGrade).toBe('B');
    });

    it('uses the snapshot saved with the grade when the caller passes no rubric', () => {
        const sr = gradeAt(rubric, [e.id, e.id, e.id, e.id], {
            rubricSnapshot: rubric,
            requirementsMet: { req3: false },
        });
        const summary = calcGradeSummary(sr, rubric.criteria, null);
        expect([summary.letterGrade, summary.verdict?.reason]).toEqual([io.code, 'requirement']);
    });

    it('falls back to a default colour for a band without one, and leaves other rubrics alone', () => {
        const plainBand = {
            ...rubric,
            tiered: { ...rubric.tiered!, bands: rubric.tiered!.bands.map(({ color: _c, ...band }) => band) },
        };
        const sr = gradeAt(plainBand, [io.id, io.id, io.id, io.id]);
        expect(calcGradeSummary(sr, plainBand.criteria, null, plainBand).gradeColor).toBe(DEFAULT_BAND_COLOR);
        const plain = calcGradeSummary(sr, plainBand.criteria, null, { scoringMode: 'weighted-percentage' });
        expect(plain.verdict).toBeUndefined();
        expect(plain.letterGrade).toBe('—');
    });
});

describe('grade summary rubric', () => {
    it("takes the caller's rubric over the snapshot, and the snapshot only when none is passed", () => {
        const saved = sheetRubric();
        const [, , e] = saved.tiered!.bands;
        const sr = gradeAt(saved, [e.id, e.id, e.id, e.id], { rubricSnapshot: saved });
        const standard = { ...saved, tiered: undefined };
        expect(calcGradeSummary(sr, saved.criteria, null, standard).verdict).toBeUndefined();
        expect(calcGradeSummary(sr, saved.criteria, null).verdict?.band).toEqual(e);
    });
});

describe('PDF grade summary', () => {
    it('prints the verdict from the rubric saved with the grade, not the live one', () => {
        const saved = sheetRubric();
        const [, , e] = saved.tiered!.bands;
        const sr = gradeAt(saved, [e.id, e.id, e.id, e.id], { rubricSnapshot: saved });
        const live = {
            ...saved,
            tiered: { ...saved.tiered!, bands: saved.tiered!.bands.map((b) => ({ ...b, code: `${b.code}*` })) },
        };
        const scale = { id: 'g', name: 'G', type: 'letter' as const, ranges: [] };
        const html = buildRubricHTML(sr, live, { id: 's1', name: 'Alice', classId: 'c1' }, scale);
        expect(html).toContain(`line-height:1">${e.code}</div>`);
        expect(html).not.toContain(`${e.code}*`);
    });
});

describe('copies and share codes', () => {
    const levelBands = (c: RubricCriterion) => c.levels.map((l) => l.bandId);
    const tierCounts = (r: Pick<Rubric, 'criteria'>) =>
        r.criteria.map((c) => c.levels.flatMap((l) => l.subItems.map((si) => si.tierId)).length);

    it('keeps bands, tiers and statement tiers attached when a rubric is duplicated', () => {
        const rubric = sheetRubric();
        const copy = cloneRubricForCopy(rubric);
        expect(copy.tiered).toEqual(rubric.tiered);
        expect(copy.criteria.map(levelBands)).toEqual(rubric.criteria.map(levelBands));
        expect(copy.criteria[0].levels[0].id).not.toBe(rubric.criteria[0].levels[0].id);
        expect(tierCounts(copy)).toEqual([18, 27, 27, 23]);
    });

    it('round-trips through a share code with all 95 statements in their tiers', () => {
        const rubric = sheetRubric();
        const parsed = decodeRubricShareCode(encodeRubricShareCode(rubric));
        expect(parsed.tiered).toEqual(rubric.tiered);
        expect(parsed.criteria.map(levelBands)).toEqual(rubric.criteria.map(levelBands));
        expect(parsed.criteria.every((c) => c.subItemMode === 'checklist')).toBe(true);
        expect(tierCounts(parsed).reduce((a, b) => a + b, 0)).toBe(95);
        const havo = parsed.tiered!.tiers[1].id;
        const spelling = parsed.criteria[0].levels.find((l) => l.label === 'IO')!;
        expect(spelling.subItems.filter(inTier(havo)).map((si) => si.label)).toEqual(sheet.criteria[0].cells.havo.io);
    });

    it('warns when a share code carries a tiered config it cannot use', () => {
        const rubric = { ...sheetRubric(), tiered: { tiers: [], bands: [] } as TieredConfig };
        const parsed = decodeRubricShareCode(encodeRubricShareCode(rubric));
        expect(parsed.tiered).toBeUndefined();
        expect(parsed.warnings).toContainEqual({ key: 'importRubric.warn_json_tiered_invalid' });
        expect(decodeRubricShareCode(encodeRubricShareCode(sheetRubric())).warnings).not.toContainEqual({
            key: 'importRubric.warn_json_tiered_invalid',
        });
    });
});

describe('sanitizeTiered', () => {
    it('keeps a valid config and its optional fields', () => {
        const config: TieredConfig = {
            tiers: [{ id: 't', year: 'jaar-1', track: 'havo', label: 'Havo' }],
            bands: [
                { id: 'a', code: 'IO', label: 'In ontwikkeling', points: 0, color: '#fff' },
                { id: 'b', code: 'B', label: 'Beheerst', points: 1, minPercentage: 40 },
            ],
            requirements: [{ id: 'r', text: 'Op tijd' }],
            comparativePairing: 'all',
        };
        expect(sanitizeTiered(JSON.parse(JSON.stringify(config)))).toEqual(config);
    });

    it('drops malformed entries and fields', () => {
        const parsed = sanitizeTiered({
            tiers: [
                { id: 't', year: 'jaar-1', track: 'nope' },
                { id: 'x', year: 'jaar-9' },
                'junk',
                { year: 'jaar-2' },
            ],
            bands: [
                { id: 'a', code: 'IO', points: 0, minPercentage: 'high', color: 3 },
                { id: 'b', code: 'B', points: 1 },
                { id: 'c', code: 'E' },
            ],
            requirements: [{ id: 'r' }, { id: 'r2', text: 'ok' }],
            comparativePairing: 'sideways',
        });
        expect(parsed).toEqual({
            tiers: [{ id: 't', year: 'jaar-1' }],
            bands: [
                { id: 'a', code: 'IO', label: '', points: 0 },
                { id: 'b', code: 'B', label: '', points: 1 },
            ],
            requirements: [{ id: 'r2', text: 'ok' }],
        });
    });

    it('rejects anything that is not a usable tiered config', () => {
        expect(sanitizeTiered(undefined)).toBeUndefined();
        expect(sanitizeTiered({ tiers: [] })).toBeUndefined();
        expect(sanitizeTiered({ tiers: [], bands: [], requirements: 'x' })).toBeUndefined();
        expect(
            sanitizeTiered({ tiers: [{ id: 't', year: 'jaar-1' }], bands: [{ id: 'a', code: 'B', points: 0 }] })
        ).toBeUndefined();
    });
});
