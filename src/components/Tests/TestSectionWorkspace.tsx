import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMarked, FileText, Layers, Music, Plus, X } from 'lucide-react';
import EssayEditor from '../Editor/EssayEditor';
import AudioUrlStatus from './AudioUrlStatus';
import ListeningControlsFields from './ListeningControlsFields';
import { computeTargetVerdict } from '../../utils/textLevelVerdict';
import { htmlToPlainText } from '../../hooks/useTTS';
import { CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import type { CefrLevel, TestSection } from '../../types';

interface Props {
    section: TestSection;
    /** Effective target level: the test's CEFR level, falling back to the section's own. */
    targetLevel: CefrLevel | '';
    questionCount: number;
    onPatch: (patch: Partial<TestSection>) => void;
    onContentChange: (html: string) => void;
    onSaveToBank: () => void;
    onSeedDeck: (words: { word: string; level: CefrLevel }[]) => void;
    /** The rail layout adds a question from here; the stacked card keeps its button below the list. */
    onAddQuestion?: () => void;
    /** Present in the rail layout, where the workspace stands alone and needs a way back. */
    onClose?: () => void;
    defaultPassageOpen?: boolean;
}

/**
 * Everything that belongs to a section rather than to one of its questions: the passage with its
 * CEFR verdict, the section audio and its listening controls, saving the section to the question
 * bank and adding a question to it. Shared by the stacked layout's section card and the rail
 * layout's focus pane, so neither can lose a control the other has.
 */
export default function TestSectionWorkspace({
    section,
    targetLevel,
    questionCount,
    onPatch,
    onContentChange,
    onSaveToBank,
    onSeedDeck,
    onAddQuestion,
    onClose,
    defaultPassageOpen = false,
}: Props) {
    const { t } = useTranslation();
    const [passageOpen, setPassageOpen] = useState(defaultPassageOpen);

    const verdict =
        targetLevel && section.content ? computeTargetVerdict(htmlToPlainText(section.content), targetLevel) : null;

    return (
        <div
            data-testid={`section-workspace-${section.id}`}
            style={
                onClose
                    ? {
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 14,
                          background: 'var(--bg-elevated)',
                      }
                    : undefined
            }
        >
            {onClose && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        aria-label={t('tests.section_name_label')}
                        value={section.title}
                        onChange={(e) => onPatch({ title: e.target.value })}
                        style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.95rem' }}
                    />
                    <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>
                        {t('tests.section_question_count', { count: questionCount })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label={t('common.close')}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-expanded={passageOpen}
                        onClick={() => setPassageOpen((open) => !open)}
                        style={{ marginBottom: passageOpen ? 8 : 0 }}
                    >
                        <FileText size={14} /> {t('tests.section_passage_label')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={onSaveToBank}
                        disabled={questionCount === 0}
                    >
                        <BookMarked size={14} /> {t('questionBank.save_section_to_bank')}
                    </button>
                </div>

                {passageOpen && (
                    <>
                        <EssayEditor
                            content={section.content ?? ''}
                            onChange={onContentChange}
                            placeholder={t('tests.section_passage_placeholder')}
                            minHeight={160}
                            allowPageMode={false}
                            showDragHandle
                            showTableOfContents
                            allowImageEmbedding
                        />
                        {verdict && (
                            <div
                                className="text-sm"
                                data-testid={`section-verdict-${section.id}`}
                                style={{
                                    marginTop: 8,
                                    padding: '8px 10px',
                                    borderRadius: 6,
                                    background: 'var(--bg-elevated)',
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: 700,
                                        color:
                                            verdict.verdict === 'suitable'
                                                ? 'var(--green)'
                                                : verdict.verdict === 'slightly_above'
                                                  ? 'var(--yellow)'
                                                  : 'var(--red)',
                                    }}
                                >
                                    {t(`analysis.verdict_${verdict.verdict}`)}
                                </span>{' '}
                                <span className="text-muted">
                                    {t('analysis.coverage_known', {
                                        level: targetLevel,
                                        pct: verdict.coveragePercent.toFixed(0),
                                    })}
                                </span>
                                {verdict.aboveTargetWords.length > 0 && (
                                    <div style={{ marginTop: 6 }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 6,
                                                flexWrap: 'wrap',
                                                marginBottom: 6,
                                            }}
                                        >
                                            {verdict.aboveTargetWords.map(({ word, level }) => (
                                                <span
                                                    key={word}
                                                    title={level}
                                                    style={{
                                                        fontSize: '0.78rem',
                                                        padding: '2px 7px',
                                                        borderRadius: 4,
                                                        background: CEFR_LEVEL_COLORS[level] + '18',
                                                        border: `1px solid ${CEFR_LEVEL_COLORS[level]}44`,
                                                        color: 'var(--text)',
                                                    }}
                                                >
                                                    {word}
                                                </span>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => onSeedDeck(verdict.aboveTargetWords)}
                                        >
                                            <Layers size={14} /> {t('tests.section_seed_deck_button')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="form-group" style={{ marginTop: 8 }}>
                            <label
                                htmlFor={`section-audio-${section.id}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Music size={14} /> {t('tests.section_audio_label')}{' '}
                                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                    ({t('essay_assignment.optional')})
                                </span>
                            </label>
                            <input
                                id={`section-audio-${section.id}`}
                                type="url"
                                value={section.audioUrl ?? ''}
                                onChange={(e) => onPatch({ audioUrl: e.target.value || undefined })}
                                placeholder={t('tests.question_audio_placeholder')}
                            />
                            <AudioUrlStatus url={section.audioUrl} />
                            {section.audioUrl && (
                                <audio
                                    controls
                                    src={section.audioUrl}
                                    aria-label={t('tests.question_audio_preview_alt')}
                                    style={{ marginTop: 8, width: '100%' }}
                                />
                            )}
                            <ListeningControlsFields id={`section-${section.id}`} value={section} onChange={onPatch} />
                        </div>
                    </>
                )}
            </div>

            {onAddQuestion && (
                <button
                    className="btn btn-secondary btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={onAddQuestion}
                >
                    <Plus size={14} /> {t('tests.add_question')}
                </button>
            )}
        </div>
    );
}
