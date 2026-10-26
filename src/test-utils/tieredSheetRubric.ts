import { DEFAULT_FORMAT } from '../types';
import type { Rubric, RubricBand, TieredConfig } from '../types';
import sheet from '../utils/import/__fixtures__/tiered-rubric/grote-opdracht-y1-p1.json';
import { syncBandLevels } from '../utils/tieredRubric';

export { sheet };

/** The MY ID card sheet as a tiered rubric: 4 criteria × 3 tiers × IO/B/E, statements as tier-tagged sub-items. */
export function sheetRubric(): Rubric {
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
