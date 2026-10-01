import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeEssayStats } from '../../utils/essayTextStats';
import { profileText } from '../../utils/cefrVocabularyProfiler';
import { computeTargetVerdict } from '../../utils/textLevelVerdict';
import { profileGrammar } from '../../utils/grammarChecker';
import { analyseVocabulary } from '../../utils/vocabularyAnalyser';
import type { CefrLevel, VocabularyItem } from '../../types';

interface Props {
    text: string;
    targetLevel?: CefrLevel;
    /** Required vocabulary, typically the linked rubric's vocabularyItems */
    vocabularyItems?: VocabularyItem[];
}

/**
 * Teacher-side reading aid for a typed answer. Everything here is local and deterministic
 * (no LanguageTool, no network) and is only ever an insight: it never produces or suggests points.
 */
export default function OpenAnswerInsightsPanel({ text, targetLevel, vocabularyItems = [] }: Props) {
    const { t } = useTranslation();
    const insights = useMemo(() => {
        if (!text.trim()) return null;
        return {
            stats: computeEssayStats(text),
            vocabulary: profileText(text),
            verdict: targetLevel ? computeTargetVerdict(text, targetLevel) : null,
            grammar: profileGrammar(text),
            checklist: analyseVocabulary(text, vocabularyItems),
        };
    }, [text, targetLevel, vocabularyItems]);
    if (!insights) return null;
    const { stats, vocabulary, verdict, grammar, checklist } = insights;
    const found = checklist.filter((c) => c.found).length;

    return (
        <details style={{ marginBottom: 8 }}>
            <summary className="text-sm" style={{ cursor: 'pointer' }}>
                {t('tests.results.insights_title')}
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', fontSize: '0.85rem' }}>
                <p className="text-muted text-xs" style={{ margin: 0 }}>
                    {t('tests.results.insights_disclaimer')}
                </p>
                <div>
                    {t('tests.results.insights_words', {
                        words: stats.wordCount,
                        sentences: stats.sentenceCount,
                    })}
                </div>
                <div>
                    {t('tests.results.insights_vocabulary', { level: vocabulary.estimatedLevel })}
                    {verdict && (
                        <>
                            {' — '}
                            {t('tests.results.insights_verdict', {
                                level: verdict.targetLevel,
                                verdict: t(`analysis.verdict_${verdict.verdict}`),
                                coverage: Math.round(verdict.coveragePercent),
                            })}
                        </>
                    )}
                </div>
                <div>
                    {grammar.detectedStructures.length > 0
                        ? t('tests.results.insights_grammar', {
                              level: grammar.estimatedLevel,
                              structures: grammar.detectedStructures
                                  .slice(0, 6)
                                  .map((s) => s.label)
                                  .join(', '),
                          })
                        : t('tests.results.insights_grammar_none')}
                </div>
                {checklist.length > 0 && (
                    <div>
                        <div>{t('tests.results.insights_required_vocab', { found, total: checklist.length })}</div>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                            {vocabularyItems.map((item, i) => (
                                <li
                                    key={item.id}
                                    style={{ color: checklist[i].found ? 'var(--green)' : 'var(--text-muted)' }}
                                >
                                    {checklist[i].found ? '✓' : '✗'} {item.phrase}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </details>
    );
}
