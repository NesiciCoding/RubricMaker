import { useTranslation } from 'react-i18next';
import type { Test } from '../../../types';
import {
    DEFAULT_GRADE_DECIMALS,
    DEFAULT_PASS_GRADE,
    buildNormPreview,
    normTierLabel,
    testNorm,
} from '../../../utils/testGradingNorm';
import { formatPoints } from '../../../utils/scoreSheet';

interface Props {
    test: Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'>;
    maxPoints: number;
}

export default function NormPreview({ test, maxPoints }: Props) {
    const { t, i18n } = useTranslation();
    const norm = testNorm(test);
    const rows = buildNormPreview(test, maxPoints);
    if (rows.length === 0) return <p className="text-muted text-sm">{t('tests.norm.preview_scale')}</p>;
    const decimals = test.gradeDecimals ?? DEFAULT_GRADE_DECIMALS;
    const passGrade = test.passGrade ?? DEFAULT_PASS_GRADE;
    const headers =
        norm.type === 'table'
            ? norm.tiers.map((tier) => normTierLabel(tier, t('tests.norm.tier_all')))
            : [t('tests.scoreSheet.col_grade')];

    return (
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 200 }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'right', padding: '4px 10px' }}>{t('tests.scoreSheet.col_points')}</th>
                        {headers.map((h) => (
                            <th key={h} style={{ textAlign: 'right', padding: '4px 10px' }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.points} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ textAlign: 'right', padding: '3px 10px' }}>
                                {formatPoints(row.points, i18n.language)}
                            </td>
                            {row.grades.map((g, i) => (
                                <td
                                    key={i}
                                    style={{
                                        textAlign: 'right',
                                        padding: '3px 10px',
                                        fontWeight: 600,
                                        color:
                                            g === null
                                                ? 'var(--text-muted)'
                                                : g >= passGrade
                                                  ? 'var(--green-text)'
                                                  : 'var(--red-text)',
                                    }}
                                >
                                    {g === null ? '—' : g.toFixed(decimals)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
