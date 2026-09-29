import { useTranslation } from 'react-i18next';
import { useUdGrammarProfile } from '../../hooks/useUdGrammarProfile';
import { CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import type { CefrLevel } from '../../types';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export default function UdGrammarPanel({ text }: { text: string }) {
    const { t } = useTranslation();
    const state = useUdGrammarProfile(text);

    if (state.status === 'unavailable') return null;
    if (state.status === 'loading') {
        return (
            <div className="card" style={{ padding: 14, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('grammarProfile.loading')}
            </div>
        );
    }

    const { profile } = state;
    return (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: '0.9rem' }}>{t('grammarProfile.title')}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('grammarProfile.typical')}: <strong>{profile.estimatedLevel.typical}</strong> ·{' '}
                    {t('grammarProfile.reaches')}: <strong>{profile.estimatedLevel.reaches}</strong>
                </span>
            </div>
            {profile.constructionCount === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('grammarProfile.none')}</div>
            )}
            {LEVELS.filter((l) => profile.results[l].distinct > 0).map((lvl) => (
                <div key={lvl}>
                    <div
                        style={{ fontSize: '0.8rem', fontWeight: 600, color: CEFR_LEVEL_COLORS[lvl], marginBottom: 4 }}
                    >
                        {lvl} · {profile.results[lvl].constructionCount}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {profile.results[lvl].constructions.map((c) => (
                            <span
                                key={c.id}
                                className="badge"
                                style={{ fontSize: '0.75rem' }}
                                title={c.examples.map((e) => e.span).join(' · ')}
                            >
                                {c.name} · {c.count}
                            </span>
                        ))}
                    </div>
                </div>
            ))}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {t('grammarProfile.notAGrade')}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('grammarProfile.attribution')}</div>
        </div>
    );
}
