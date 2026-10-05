import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookMarked, Download, FileUp, Layers } from 'lucide-react';
import Papa from 'papaparse';
import { CSV_UNPARSE_OPTIONS } from '../../utils/csvOptions';
import { saveAs } from 'file-saver';
import CefrBadge from '../CEFR/CefrBadge';
import VocabCefrDistributionChart from '../Statistics/VocabCefrDistributionChart';
import WordnetDownloadModal from './WordnetDownloadModal';
import { useFlashcards } from '../../context/AppContext';
import { useToast } from '../../hooks/useToast';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';
import { profileText } from '../../utils/cefrVocabularyProfiler';
import { computeTargetVerdict } from '../../utils/textLevelVerdict';
import { lookupManyWordDetails, translationTarget } from '../../services/wordLookup';
import { isWordnetInstalled, removeWordnetPack } from '../../services/wordnetPack';
import { nanoid } from '../../utils/nanoid';
import type { Attachment, CefrLevel } from '../../types';

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

const VERDICT_COLOR = { suitable: 'var(--green)', slightly_above: 'var(--yellow)', too_hard: 'var(--red)' } as const;

export default function TextScreeningPanel() {
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { addFlashcardDeck } = useFlashcards();
    const fileInput = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);

    const [text, setText] = useState('');
    const [targetLevel, setTargetLevel] = useState<CefrLevel>('B1');
    const [extracting, setExtracting] = useState(false);
    const [seeding, setSeeding] = useState<{ done: number; total: number } | null>(null);
    const [wordnetInstalled, setWordnetInstalled] = useState(false);
    const [showWordnetModal, setShowWordnetModal] = useState(false);

    useEffect(() => {
        mounted.current = true;
        void isWordnetInstalled().then((installed) => {
            if (mounted.current) setWordnetInstalled(installed);
        });
        return () => {
            mounted.current = false;
        };
    }, []);

    const profile = useMemo(() => (text.trim() ? profileText(text) : null), [text]);
    const verdict = useMemo(() => (text.trim() ? computeTargetVerdict(text, targetLevel) : null), [text, targetLevel]);
    const totalWords = profile ? CEFR_LEVELS.reduce((sum, lvl) => sum + profile.levelCounts[lvl], 0) : 0;

    async function handleFile(file: File) {
        setExtracting(true);
        try {
            const attachment: Attachment = {
                id: nanoid(),
                name: file.name,
                mimeType: file.type,
                dataUrl: await readAsDataUrl(file),
                size: file.size,
                addedAt: new Date().toISOString(),
            };
            const { extractText } = await import('../../utils/textExtraction');
            const extracted = await extractText(attachment);
            if (mounted.current) setText(extracted);
        } catch {
            if (mounted.current) showToast(t('vocabProfile.screen_extract_failed'), 'error');
        } finally {
            if (mounted.current) setExtracting(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    }

    function handleExportCsv() {
        if (!verdict) return;
        const rows = verdict.aboveTargetWords.map((w) => ({
            [t('vocabProfile.csv_column_word')]: w.word,
            [t('vocabProfile.csv_column_level')]: w.level,
        }));
        saveAs(
            new Blob([Papa.unparse(rows, CSV_UNPARSE_OPTIONS)], { type: 'text/csv;charset=utf-8;' }),
            `${t('vocabProfile.screen_csv_filename')}_${targetLevel}.csv`
        );
    }

    async function handleSeedDeck() {
        if (!verdict || verdict.aboveTargetWords.length === 0) {
            showToast(t('vocabProfile.seed_deck_empty'), 'info');
            return;
        }
        const hits = verdict.aboveTargetWords;
        setSeeding({ done: 0, total: hits.length });
        const details = await lookupManyWordDetails(
            hits.map((w) => w.word),
            translationTarget(i18n.language),
            (done, total) => setSeeding({ done, total })
        );
        if (!mounted.current) return;
        setSeeding(null);

        const deck = addFlashcardDeck({
            name: t('vocabProfile.seed_deck_name', { band: `>${targetLevel}` }),
            deckKind: 'vocabulary',
            cards: hits.map((w, i) => {
                const d = details[i];
                const back = [d.translation, d.definition].filter(Boolean).join(' — ');
                return {
                    id: nanoid(),
                    front: w.word,
                    back,
                    cefrLevel: w.level,
                    ...(d.phonetic && { phonetic: d.phonetic }),
                    ...(d.partOfSpeech && { partOfSpeech: d.partOfSpeech }),
                    ...(d.example && { example: d.example }),
                };
            }),
        });
        const missing = details.filter((d) => !d.definition && !d.translation).length;
        showToast(t('vocabProfile.seed_deck_created', { name: deck.name, count: hits.length }), 'success');
        if (missing > 0) showToast(t('vocabProfile.seed_deck_blank_hint', { count: missing }), 'info');
        navigate(`/flashcards/${deck.id}`);
    }

    async function handleRemoveWordnet() {
        await removeWordnetPack();
        setWordnetInstalled(false);
    }

    return (
        <div className="card">
            <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>{t('vocabProfile.screen_title')}</h3>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                {t('vocabProfile.screen_subtitle')}
            </p>

            <textarea
                aria-label={t('vocabProfile.screen_text_label')}
                placeholder={t('vocabProfile.screen_placeholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={extracting}
                rows={8}
                style={{ width: '100%', resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 16px' }}>
                <input
                    ref={fileInput}
                    type="file"
                    hidden
                    accept=".txt,.pdf,.docx,.html,image/*"
                    aria-label={t('vocabProfile.screen_upload')}
                    onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
                />
                <button
                    className="btn btn-secondary btn-sm"
                    disabled={extracting}
                    onClick={() => fileInput.current?.click()}
                >
                    <FileUp size={14} />{' '}
                    {extracting ? t('vocabProfile.screen_extracting') : t('vocabProfile.screen_upload')}
                </button>
                {text && (
                    <button className="btn btn-ghost btn-sm" disabled={extracting} onClick={() => setText('')}>
                        {t('vocabProfile.screen_clear')}
                    </button>
                )}
            </div>

            <div
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}
                className="text-xs text-muted"
            >
                <BookMarked size={14} />
                {wordnetInstalled ? t('vocabProfile.wordnet_installed') : t('vocabProfile.wordnet_not_installed')}
                {wordnetInstalled ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => void handleRemoveWordnet()}>
                        {t('vocabProfile.wordnet_remove')}
                    </button>
                ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowWordnetModal(true)}>
                        {t('vocabProfile.wordnet_get')}
                    </button>
                )}
            </div>

            {!profile || !verdict ? (
                <p className="text-muted text-sm">{t('vocabProfile.screen_empty')}</p>
            ) : (
                <>
                    <VocabCefrDistributionChart
                        entries={[
                            { name: t('vocabProfile.screen_this_text'), levelCounts: profile.levelCounts, totalWords },
                        ]}
                    />

                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '14px 0' }}>
                        <div>
                            <div className="text-xs text-muted">{t('vocabProfile.table_header_estimated_level')}</div>
                            <CefrBadge level={profile.estimatedLevel} size="sm" />
                        </div>
                        <div>
                            <div className="text-xs text-muted">{t('vocabProfile.table_header_off_list')}</div>
                            <strong>{profile.offListPercent.toFixed(0)}%</strong>
                        </div>
                        <div>
                            <div className="text-xs text-muted">{t('analysis.academic_vocab')}</div>
                            <strong>{(profile.academic.awlPercent + profile.academic.nawlPercent).toFixed(0)}%</strong>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            flexWrap: 'wrap',
                            paddingTop: 12,
                            borderTop: '1px solid var(--border)',
                        }}
                    >
                        <label htmlFor="screen-target" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            {t('vocabProfile.target_level_label')}
                        </label>
                        <select
                            id="screen-target"
                            value={targetLevel}
                            onChange={(e) => setTargetLevel(e.target.value as CefrLevel)}
                            style={{ padding: '2px 6px', fontSize: '1rem' }}
                        >
                            {CEFR_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                    {lvl}
                                </option>
                            ))}
                        </select>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: VERDICT_COLOR[verdict.verdict] }}>
                            {t(`analysis.verdict_${verdict.verdict}`)}
                        </span>
                        <span className="text-xs text-muted">
                            {t('vocabProfile.coverage_known', { pct: verdict.coveragePercent.toFixed(0) })}
                        </span>
                    </div>

                    {verdict.aboveTargetWords.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                            <div className="text-sm" style={{ fontWeight: 600, marginBottom: 6 }}>
                                {t('analysis.above_target')}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                {verdict.aboveTargetWords.map((w) => (
                                    <span key={w.word} className="badge">
                                        {w.word} · {w.level}
                                    </span>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    disabled={seeding !== null}
                                    onClick={() => void handleSeedDeck()}
                                >
                                    <Layers size={14} />{' '}
                                    {seeding
                                        ? t('vocabProfile.seed_deck_looking_up', seeding)
                                        : t('vocabProfile.seed_deck')}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
                                    <Download size={14} /> {t('vocabProfile.export_csv')}
                                </button>
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-muted" style={{ marginBottom: 0 }}>
                        {t('analysis.awl_nawl_attribution')}
                    </p>
                </>
            )}
            {showWordnetModal && (
                <WordnetDownloadModal
                    onClose={() => setShowWordnetModal(false)}
                    onInstalled={() => {
                        setWordnetInstalled(true);
                        setShowWordnetModal(false);
                    }}
                />
            )}
        </div>
    );
}
