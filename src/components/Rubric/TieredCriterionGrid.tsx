import { useTranslation } from 'react-i18next';
import type { RubricCriterion, SubItem, TieredConfig } from '../../types';
import { DEFAULT_BAND_COLOR, tierLabel } from '../../utils/tieredRubric';
import SubItemListEditor from './SubItemListEditor';
import type { CriterionStandardTarget } from './CriterionCard';

interface Props {
    criterion: RubricCriterion;
    config: TieredConfig;
    onSetSubItems: (cid: string, lid: string, items: SubItem[]) => void;
    onMoveSubItem: (cid: string, fromLid: string, sid: string, toLid: string) => void;
    onPickStandard: (target: CriterionStandardTarget) => void;
    onUnlinkStandard: (target: CriterionStandardTarget, stdIndex: number) => void;
}

/**
 * A tiered criterion's statements as the sheet lays them out: one row per band (worst first),
 * one column per tier. Each cell edits the statements of that band's level tagged with that tier.
 */
export default function TieredCriterionGrid({
    criterion,
    config,
    onSetSubItems,
    onMoveSubItem,
    onPickStandard,
    onUnlinkStandard,
}: Props) {
    const { t } = useTranslation();
    const rows = config.bands.flatMap((band) => {
        const level = criterion.levels.find((l) => l.bandId === band.id);
        return level ? [{ band, level }] : [];
    });

    return (
        <div style={{ overflowX: 'auto' }}>
            <table
                className="tiered-criterion-grid"
                style={{
                    width: '100%',
                    minWidth: 110 + config.tiers.length * 230,
                    borderCollapse: 'separate',
                    borderSpacing: 6,
                }}
            >
                <thead>
                    <tr>
                        <th scope="col" style={{ width: 110 }}>
                            <span className="sr-only">{t('rubricBuilder.tiered_band')}</span>
                        </th>
                        {config.tiers.map((tier) => (
                            <th
                                key={tier.id}
                                scope="col"
                                style={{
                                    padding: '6px 8px',
                                    borderRadius: 8,
                                    background: 'var(--bg-elevated)',
                                    fontSize: '0.85rem',
                                }}
                            >
                                {tierLabel(tier)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ band, level }) => {
                        const moveTargets = rows
                            .filter((r) => r.level.id !== level.id)
                            .map((r) => ({ id: r.level.id, label: r.band.code }));
                        return (
                            <tr key={band.id}>
                                <th
                                    scope="row"
                                    style={{
                                        verticalAlign: 'top',
                                        textAlign: 'start',
                                        padding: '6px 8px',
                                        borderRadius: 8,
                                        background: band.color ?? DEFAULT_BAND_COLOR,
                                        color: '#1f2937',
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{band.code}</div>
                                    {band.label && (
                                        <div style={{ fontSize: '0.72rem', fontWeight: 400 }}>{band.label}</div>
                                    )}
                                </th>
                                {config.tiers.map((tier) => {
                                    const items = level.subItems.filter((si) => si.tierId === tier.id);
                                    const label = t('rubricBuilder.tiered_cell_label', {
                                        band: band.code,
                                        tier: tierLabel(tier),
                                    });
                                    return (
                                        <td
                                            key={tier.id}
                                            style={{
                                                verticalAlign: 'top',
                                                padding: 8,
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                                background: 'var(--bg-elevated)',
                                            }}
                                        >
                                            <SubItemListEditor
                                                compact
                                                items={items}
                                                mode="checklist"
                                                levelLabel={label}
                                                onChange={(next) =>
                                                    onSetSubItems(criterion.id, level.id, [
                                                        ...level.subItems.filter((si) => si.tierId !== tier.id),
                                                        ...next.map((si) => ({ ...si, tierId: tier.id })),
                                                    ])
                                                }
                                                onLinkStandard={(sid) =>
                                                    onPickStandard({
                                                        type: 'subitem',
                                                        cid: criterion.id,
                                                        lid: level.id,
                                                        sid,
                                                    })
                                                }
                                                onUnlinkStandard={(sid, idx) =>
                                                    onUnlinkStandard(
                                                        { type: 'subitem', cid: criterion.id, lid: level.id, sid },
                                                        idx
                                                    )
                                                }
                                                moveTargets={moveTargets}
                                                onMove={(sid, toLid) =>
                                                    onMoveSubItem(criterion.id, level.id, sid, toLid)
                                                }
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                {t('rubricBuilder.sub_items_keyboard_hint')}
            </div>
        </div>
    );
}
