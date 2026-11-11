import { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Eye, EyeOff, FileDown, GraduationCap, Pencil, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LiveWritingFinalText, LiveWritingSessionStatus, Rubric } from '../../types';
import { computeEssayStats } from '../../utils/essayTextStats';
import Modal from '../ui/Modal';
import { liveWritingSelfRatingKey } from '../../utils/liveWriting';

interface Props {
    roundIndex: number;
    roundCount: number;
    status: LiveWritingSessionStatus;
    texts: LiveWritingFinalText[];
    rubrics: Pick<Rubric, 'id' | 'name'>[];
    rubricId: string;
    busy: boolean;
    failed: boolean;
    sendingParticipantIds: Set<string>;
    sendingAll: boolean;
    onRubricChange: (rubricId: string) => void;
    onToggleHidden: (text: LiveWritingFinalText) => void;
    onReplace: (text: LiveWritingFinalText, replacementText: string) => void;
    onSendToGrading: (text: LiveWritingFinalText) => void;
    onSendAllToGrading: (texts: LiveWritingFinalText[]) => void;
    onAnotherRound: () => void;
}

type SortMode = 'votes' | 'words' | 'time';

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function csvCell(value: string | number | boolean | undefined): string {
    const text = value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: (string | number | boolean | undefined)[][]): void {
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export default function LiveWritingFinalsPanel({
    roundIndex,
    roundCount,
    status,
    texts,
    rubrics,
    rubricId,
    busy,
    failed,
    sendingParticipantIds,
    sendingAll,
    onRubricChange,
    onToggleHidden,
    onReplace,
    onSendToGrading,
    onSendAllToGrading,
    onAnotherRound,
}: Props) {
    const { t } = useTranslation();
    const [revealNames, setRevealNames] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('votes');
    const [spotlight, setSpotlight] = useState<LiveWritingFinalText | null>(null);
    const [replaceTarget, setReplaceTarget] = useState<LiveWritingFinalText | null>(null);
    const [replaceDraft, setReplaceDraft] = useState('');

    const handedInTexts = useMemo(() => texts.filter((text) => Boolean(text.handedInAt)), [texts]);
    const visibleTexts = useMemo(
        () => handedInTexts.filter((text) => !text.hidden && text.wordCount > 0),
        [handedInTexts]
    );
    const hiddenTexts = useMemo(() => handedInTexts.filter((text) => text.hidden), [handedInTexts]);
    const sortedTexts = useMemo(() => {
        const rows = [...visibleTexts];
        if (sortMode === 'words') rows.sort((a, b) => b.wordCount - a.wordCount);
        else if (sortMode === 'time') rows.sort((a, b) => (a.handedInAt ?? '').localeCompare(b.handedInAt ?? ''));
        else
            rows.sort(
                (a, b) => b.votesReceived - a.votesReceived || (a.handedInAt ?? '').localeCompare(b.handedInAt ?? '')
            );
        return rows;
    }, [sortMode, visibleTexts]);

    const selfChecks = handedInTexts.filter((text) => text.selfRating).length;
    const happy = handedInTexts.filter((text) => text.selfRating === 'happy').length;
    const neutral = handedInTexts.filter((text) => text.selfRating === 'neutral').length;
    const unhappy = handedInTexts.filter((text) => text.selfRating === 'unhappy').length;
    const votes = handedInTexts.reduce((total, text) => total + text.votesReceived, 0);
    const medianWords = median(visibleTexts.map((text) => text.wordCount));
    const unsent = visibleTexts.filter((text) => !text.gradingSubmissionId);
    const sentCount = handedInTexts.filter((text) => text.gradingSubmissionId).length;
    const cefrOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const cefrIndexes = visibleTexts
        .map((text) => (text.cefrEstimate ? cefrOrder.indexOf(text.cefrEstimate) : -1))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b);
    const medianCefr = cefrIndexes.length === 0 ? undefined : cefrOrder[Math.floor(cefrIndexes.length / 2)];
    const canHandOff = Boolean(rubricId) && !busy && !sendingAll;
    const numberById = new Map(texts.map((text, index) => [text.participantId, index + 1] as const));
    const labelFor = (text: LiveWritingFinalText) =>
        revealNames
            ? text.displayName
            : t('liveWriting.finals_text_label', { number: numberById.get(text.participantId) ?? 1 });
    const spotlightStats = spotlight ? computeEssayStats(spotlight.contentHtml) : null;

    function beginReplace(text: LiveWritingFinalText) {
        setReplaceTarget(text);
        setReplaceDraft(
            DOMPurify.sanitize(text.contentHtml, { ALLOWED_TAGS: [], KEEP_CONTENT: true }).replace(/\s+/g, ' ').trim()
        );
    }

    function saveReplacement() {
        if (!replaceTarget || replaceDraft.trim() === '') return;
        onReplace(replaceTarget, replaceDraft.trim());
        setReplaceTarget(null);
        setReplaceDraft('');
    }

    function exportCsv() {
        downloadCsv(`live-writing-round-${roundIndex}.csv`, [
            [
                t('liveWriting.finals_student'),
                t('liveWriting.finals_student_id'),
                t('liveWriting.finals_words'),
                t('liveWriting.finals_votes'),
                t('liveWriting.finals_self_check'),
                t('liveWriting.finals_self_note'),
                t('liveWriting.finals_cefr'),
                t('liveWriting.finals_hidden'),
                t('liveWriting.finals_handed_in'),
                t('liveWriting.finals_grading_status'),
            ],
            ...texts.map((text) => [
                text.displayName,
                text.studentId,
                text.wordCount,
                text.votesReceived,
                text.selfRating ? t(liveWritingSelfRatingKey(text.selfRating)) : '',
                text.selfNote ?? '',
                text.cefrEstimate ?? '',
                text.hidden ? t('liveWriting.finals_yes') : t('liveWriting.finals_no'),
                text.handedInAt,
                text.gradingSubmissionId ? t('liveWriting.finals_sent') : t('liveWriting.finals_not_sent'),
            ]),
        ]);
    }

    return (
        <section className="card" style={{ padding: 24, marginTop: 20 }} aria-labelledby="live-finals-title">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 16,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <h2 id="live-finals-title" className="item-heading" style={{ margin: 0 }}>
                        <Sparkles size={17} /> {t('liveWriting.finals_title', { round: roundIndex })}
                    </h2>
                    <p className="text-muted text-xs" style={{ margin: '5px 0 0' }}>
                        {t('liveWriting.finals_intro')}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevealNames((v) => !v)}>
                        {revealNames ? <EyeOff size={15} /> : <Eye size={15} />}
                        {revealNames ? t('liveWriting.finals_hide_names') : t('liveWriting.finals_reveal_names')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={exportCsv}
                        disabled={texts.length === 0}
                    >
                        <FileDown size={15} /> {t('liveWriting.finals_csv')}
                    </button>
                </div>
            </div>

            {failed && (
                <p className="text-muted" role="alert" style={{ margin: '12px 0 0' }}>
                    {t('liveWriting.finals_load_failed')}
                </p>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                    gap: 10,
                    marginTop: 18,
                }}
            >
                {[
                    [t('liveWriting.finals_stat_participants'), String(texts.length)],
                    [t('liveWriting.finals_stat_finalists'), String(visibleTexts.length)],
                    [t('liveWriting.finals_stat_words'), String(medianWords)],
                    [t('liveWriting.finals_stat_cefr'), medianCefr ?? '—', t('liveWriting.finals_cefr_early')],
                    [
                        t('liveWriting.finals_stat_self_checks'),
                        `${selfChecks}/${texts.length}`,
                        t('liveWriting.finals_stat_self_breakdown', { happy, neutral, unhappy }),
                    ],
                    [t('liveWriting.finals_stat_votes'), String(votes)],
                    [t('liveWriting.finals_stat_sent'), `${sentCount}/${visibleTexts.length}`],
                ].map(([label, value, hint]) => (
                    <div
                        key={label}
                        style={{
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: '12px 14px',
                            background: 'var(--surface-2)',
                        }}
                    >
                        <div className="text-muted text-xs">{label}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                        {hint && (
                            <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                {hint}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'end',
                    flexWrap: 'wrap',
                    marginTop: 20,
                    paddingTop: 18,
                    borderTop: '1px solid var(--border)',
                }}
            >
                <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                    <label htmlFor="live-finals-rubric" style={{ display: 'block', marginBottom: 5 }}>
                        {t('liveWriting.finals_rubric')}
                    </label>
                    <select
                        id="live-finals-rubric"
                        className="input"
                        value={rubricId}
                        onChange={(event) => onRubricChange(event.target.value)}
                    >
                        <option value="">{t('liveWriting.finals_select_rubric')}</option>
                        {rubrics.map((rubric) => (
                            <option key={rubric.id} value={rubric.id}>
                                {rubric.name}
                            </option>
                        ))}
                    </select>
                    {rubrics.length === 0 && (
                        <p className="text-muted text-xs" style={{ margin: '5px 0 0' }}>
                            {t('liveWriting.finals_no_rubrics')}
                        </p>
                    )}
                </div>
                <div style={{ minWidth: 150 }}>
                    <label htmlFor="live-finals-sort" style={{ display: 'block', marginBottom: 5 }}>
                        {t('liveWriting.finals_sort')}
                    </label>
                    <select
                        id="live-finals-sort"
                        className="input"
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as SortMode)}
                    >
                        <option value="votes">{t('liveWriting.finals_sort_votes')}</option>
                        <option value="words">{t('liveWriting.finals_sort_words')}</option>
                        <option value="time">{t('liveWriting.finals_sort_time')}</option>
                    </select>
                </div>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!canHandOff || unsent.length === 0}
                    onClick={() => onSendAllToGrading(unsent)}
                >
                    <Send size={15} />
                    {sendingAll
                        ? t('liveWriting.finals_sending')
                        : t('liveWriting.finals_send_all', { count: unsent.length })}
                </button>
            </div>
            {!rubricId && visibleTexts.length > 0 && (
                <p className="text-muted text-xs" style={{ margin: '8px 0 0' }}>
                    {t('liveWriting.finals_rubric_required')}
                </p>
            )}

            {sortedTexts.length === 0 ? (
                <p className="text-muted" style={{ margin: '18px 0 0' }}>
                    {t('liveWriting.finals_empty')}
                </p>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 12,
                        marginTop: 18,
                    }}
                >
                    {sortedTexts.map((text) => {
                        const sent = Boolean(text.gradingSubmissionId);
                        const sending = sendingParticipantIds.has(text.participantId);
                        return (
                            <article
                                key={text.participantId}
                                style={{
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                    padding: 16,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                    background: 'var(--surface)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <strong>{labelFor(text)}</strong>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {t('liveWriting.finals_vote_count', { count: text.votesReceived })}
                                    </span>
                                </div>
                                <div className="text-muted text-xs">
                                    {t('liveWriting.finals_card_stats', {
                                        words: text.wordCount,
                                        sentences: computeEssayStats(text.contentHtml).sentenceCount,
                                    })}
                                    {text.cefrEstimate
                                        ? ` · ${t('liveWriting.finals_cefr_short', { level: text.cefrEstimate })}`
                                        : ''}
                                </div>
                                <div
                                    style={{
                                        maxHeight: 120,
                                        overflow: 'hidden',
                                        position: 'relative',
                                        fontSize: '0.88rem',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text.contentHtml) }} />
                                </div>
                                {text.selfRating && (
                                    <div className="text-muted text-xs">
                                        {t('liveWriting.finals_self_check_value', {
                                            rating: t(liveWritingSelfRatingKey(text.selfRating)),
                                        })}
                                        {text.selfNote ? ` — “${text.selfNote}”` : ''}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setSpotlight(text)}
                                    >
                                        <Eye size={14} /> {t('liveWriting.finals_spotlight')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={busy}
                                        onClick={() => onToggleHidden(text)}
                                    >
                                        <EyeOff size={14} /> {t('liveWriting.finals_hide')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={busy}
                                        onClick={() => beginReplace(text)}
                                    >
                                        <Pencil size={14} /> {t('liveWriting.finals_replace')}
                                    </button>
                                    <button
                                        type="button"
                                        className={sent ? 'btn btn-ghost btn-sm' : 'btn btn-secondary btn-sm'}
                                        disabled={!canHandOff || sent || sending || text.wordCount === 0}
                                        onClick={() => onSendToGrading(text)}
                                    >
                                        <GraduationCap size={14} />
                                        {sent
                                            ? t('liveWriting.finals_sent')
                                            : sending
                                              ? t('liveWriting.finals_sending')
                                              : t('liveWriting.finals_send')}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
                <h3 className="item-heading" style={{ fontSize: '0.95rem', margin: '0 0 10px' }}>
                    {t('liveWriting.finals_table_title')}
                </h3>
                <table className="table" style={{ width: '100%', minWidth: 720 }}>
                    <thead>
                        <tr>
                            <th scope="col">{t('liveWriting.finals_student')}</th>
                            <th scope="col">{t('liveWriting.finals_words')}</th>
                            <th scope="col">{t('liveWriting.finals_cefr')}</th>
                            <th scope="col">{t('liveWriting.finals_self_check')}</th>
                            <th scope="col">{t('liveWriting.finals_votes')}</th>
                            <th scope="col">{t('liveWriting.finals_handed_in')}</th>
                            <th scope="col">{t('liveWriting.finals_grading_status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {texts.map((text) => (
                            <tr key={text.participantId}>
                                <td>
                                    <Link to={`/students/${text.studentId}`}>{text.displayName}</Link>
                                </td>
                                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{text.wordCount}</td>
                                <td>{text.cefrEstimate ?? '—'}</td>
                                <td>{text.selfRating ? t(liveWritingSelfRatingKey(text.selfRating)) : '—'}</td>
                                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{text.votesReceived}</td>
                                <td>
                                    {text.handedInAt ? t('liveWriting.finals_yes') : t('liveWriting.finals_no')}
                                    {text.hidden ? ` · ${t('liveWriting.finals_hidden')}` : ''}
                                </td>
                                <td>
                                    {text.gradingSubmissionId
                                        ? t('liveWriting.finals_sent')
                                        : t('liveWriting.finals_not_sent')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {hiddenTexts.length > 0 && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHidden((v) => !v)}>
                        {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        {t('liveWriting.finals_show_hidden', { count: hiddenTexts.length })}
                    </button>
                    {showHidden && (
                        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                            {hiddenTexts.map((text) => (
                                <div
                                    key={text.participantId}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '8px 10px',
                                        border: '1px dashed var(--border)',
                                        borderRadius: 8,
                                    }}
                                >
                                    <span>{labelFor(text)}</span>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={busy}
                                        onClick={() => onToggleHidden(text)}
                                    >
                                        {t('liveWriting.finals_unhide')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {status === 'finals' && roundIndex < roundCount && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={onAnotherRound}>
                        <RefreshCw size={15} /> {t('liveWriting.finals_another_round')}
                    </button>
                </div>
            )}

            {replaceTarget && (
                <Modal titleId="live-finals-replace-title" onClose={() => setReplaceTarget(null)} maxWidth={680}>
                    <div className="modal-header">
                        <h3 id="live-finals-replace-title" className="item-heading" style={{ margin: 0 }}>
                            {t('liveWriting.finals_replace_title', { text: labelFor(replaceTarget) })}
                        </h3>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            aria-label={t('common.close')}
                            onClick={() => setReplaceTarget(null)}
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="modal-body">
                        <p className="text-muted text-xs" style={{ margin: '6px 0 12px' }}>
                            {t('liveWriting.finals_replace_help')}
                        </p>
                        <textarea
                            className="input"
                            rows={10}
                            value={replaceDraft}
                            onChange={(event) => setReplaceDraft(event.target.value)}
                            aria-label={t('liveWriting.finals_replace_label')}
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-ghost" onClick={() => setReplaceTarget(null)}>
                            {t('liveWriting.finals_replace_cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={replaceDraft.trim() === ''}
                            onClick={saveReplacement}
                        >
                            {t('liveWriting.finals_replace_save')}
                        </button>
                    </div>
                </Modal>
            )}

            {spotlight && spotlightStats && (
                <Modal
                    titleId="live-finals-spotlight-title"
                    onClose={() => setSpotlight(null)}
                    maxWidth={760}
                    style={{ maxHeight: '88vh' }}
                >
                    <div className="modal-header">
                        <div>
                            <h3 id="live-finals-spotlight-title" className="item-heading" style={{ margin: 0 }}>
                                {labelFor(spotlight)}
                            </h3>
                            <p className="text-muted text-xs" style={{ margin: '5px 0 0' }}>
                                {t('liveWriting.finals_spotlight_stats', {
                                    words: spotlightStats.wordCount,
                                    sentences: spotlightStats.sentenceCount,
                                    avg: spotlightStats.avgWordsPerSentence,
                                    votes: spotlight.votesReceived,
                                })}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('liveWriting.finals_close_spotlight')}
                            onClick={() => setSpotlight(null)}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="modal-body" style={{ overflowY: 'auto' }}>
                        <div
                            style={{ marginTop: 6, lineHeight: 1.7, fontSize: '1.02rem' }}
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(spotlight.contentHtml) }}
                        />
                        <p className="text-muted text-xs" style={{ margin: '18px 0 0' }}>
                            {t('liveWriting.finals_cefr_disclaimer')}
                        </p>
                    </div>
                </Modal>
            )}
        </section>
    );
}
