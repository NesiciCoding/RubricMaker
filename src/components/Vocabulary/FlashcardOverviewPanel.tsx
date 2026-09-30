import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useFlashcards } from '../../context/AppContext';
import { computeCrossDeckOverview } from '../../utils/flashcardOverview';
import FlashcardInsightsPanel from '../Flashcards/FlashcardInsightsPanel';

const thStyle = { padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' } as const;
const tdStyle = { padding: '8px 10px', textAlign: 'center' } as const;

export default function FlashcardOverviewPanel() {
    const { t, i18n } = useTranslation();
    const { flashcardDecks, flashcardAssignments, flashcardReviews } = useFlashcards();

    const overview = useMemo(
        () => computeCrossDeckOverview(flashcardDecks, flashcardAssignments, flashcardReviews),
        [flashcardDecks, flashcardAssignments, flashcardReviews]
    );

    if (overview.rows.length === 0) {
        return <div className="card text-muted text-sm">{t('vocabProfile.fc_empty')}</div>;
    }

    const stats = [
        { label: t('vocabProfile.fc_stat_decks'), value: overview.rows.length },
        { label: t('vocabProfile.fc_stat_active_students'), value: overview.activeStudentCount },
        { label: t('vocabProfile.fc_stat_mastered'), value: overview.masteredCount },
        { label: t('vocabProfile.fc_stat_due'), value: overview.dueCount },
    ];

    return (
        <div className="card">
            <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>{t('vocabProfile.fc_title')}</h3>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                {t('vocabProfile.fc_subtitle')}
            </p>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '12px 0 16px' }}>
                {stats.map((s) => (
                    <div key={s.label}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                        <div className="text-xs text-muted">{s.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                            <th style={{ ...thStyle, textAlign: 'left' }}>{t('vocabProfile.fc_col_deck')}</th>
                            <th style={thStyle}>{t('vocabProfile.fc_col_assigned')}</th>
                            <th style={thStyle}>{t('vocabProfile.fc_col_active')}</th>
                            <th style={{ ...thStyle, minWidth: 160 }}>{t('vocabProfile.fc_col_progress')}</th>
                            <th style={thStyle}>{t('vocabProfile.fc_col_due')}</th>
                            <th style={thStyle}>{t('vocabProfile.fc_col_last')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {overview.rows.map(({ deck, assignedCount, activeCount, insights }) => (
                            <tr key={deck.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ ...tdStyle, textAlign: 'left' }}>
                                    <Link to={`/flashcards/${deck.id}`}>{deck.name}</Link>
                                </td>
                                <td style={tdStyle}>{assignedCount}</td>
                                <td style={tdStyle}>{activeCount}</td>
                                <td style={tdStyle}>
                                    <FlashcardInsightsPanel insights={insights} compact deckKind={deck.deckKind} />
                                </td>
                                <td style={tdStyle}>{insights.dueCount}</td>
                                <td style={tdStyle}>
                                    {insights.lastStudied
                                        ? new Date(insights.lastStudied).toLocaleDateString(i18n.language)
                                        : t('vocabProfile.fc_never')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
