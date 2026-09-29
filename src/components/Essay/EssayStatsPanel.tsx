import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeEssayStats } from '../../utils/essayTextStats';
import type { TransitionCategory } from '../../types';

const CATEGORIES: TransitionCategory[] = ['addition', 'contrast', 'cause', 'sequence', 'example', 'conclusion'];

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{ minWidth: 110 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
        </div>
    );
}

export default function EssayStatsPanel({ text }: { text: string }) {
    const { t } = useTranslation();
    const stats = useMemo(() => computeEssayStats(text), [text]);
    const maxLen = Math.max(...stats.sentenceLengths, 1);
    const { readability, transitions } = stats;

    return (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <strong style={{ fontSize: '0.9rem' }}>{t('writingStats.title')}</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <Stat label={t('writingStats.words')} value={stats.wordCount} />
                <Stat label={t('writingStats.sentences')} value={stats.sentenceCount} />
                <Stat label={t('writingStats.avgSentence')} value={stats.avgWordsPerSentence} />
                <Stat label={t('writingStats.variance')} value={stats.sentenceLengthVariance} />
                <Stat
                    label={t('writingStats.range')}
                    value={`${stats.minSentenceLength} – ${stats.maxSentenceLength}`}
                />
                {readability && (
                    <>
                        <Stat label={t('writingStats.fkGrade')} value={readability.fleschKincaidGrade} />
                        <Stat
                            label={`${t('writingStats.fre')} (${t(`writingStats.description.${readability.description}`)})`}
                            value={readability.fleschReadingEase}
                        />
                    </>
                )}
            </div>

            {stats.sentenceLengths.length > 0 && (
                <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                        {t('writingStats.sentenceLengths')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48 }}>
                        {stats.sentenceLengths.map((len, i) => (
                            <div
                                key={i}
                                title={`#${i + 1}: ${len}`}
                                style={{
                                    flex: '1 1 0',
                                    maxWidth: 14,
                                    height: `${Math.max((len / maxLen) * 100, 4)}%`,
                                    background: 'var(--accent)',
                                    borderRadius: 2,
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                    {t('writingStats.transitions')}: {transitions.total} ({transitions.per100Words}{' '}
                    {t('writingStats.perHundred')})
                </div>
                {transitions.total === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {t('writingStats.noTransitions')}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {CATEGORIES.filter((c) => transitions.byCategory[c] > 0).map((c) => (
                            <span key={c} className="badge" style={{ fontSize: '0.75rem' }}>
                                {t(`writingStats.category.${c}`)} · {transitions.byCategory[c]}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('writingStats.note')}</div>
        </div>
    );
}
