import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { TestQuestion } from '../../types';
import HelpPopover from './HelpPopover';
import LineListTextarea from './LineListTextarea';
import RawTextToggle from './RawTextToggle';
import { CHIP_STYLES } from './testEditorStyles';

const sortedWords = (sentence: string) =>
    sentence
        .toLowerCase()
        .replace(/[^\p{L}\p{N}'\s]/gu, '')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
}

export default function SentenceBuilderFields({ question, update }: Props) {
    const { t } = useTranslation();
    const targets = question.sentenceTargets ?? [];
    const id = question.id;
    // Tiles come from the first sentence only, so an alternative must reuse exactly those words.
    const unbuildable = targets
        .map((sentence, i) => (i > 0 && sortedWords(sentence) !== sortedWords(targets[0]) ? i + 1 : 0))
        .filter(Boolean);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>
                {t('tests.builder_targets_label')}{' '}
                <HelpPopover title={t('tests.help.sentence_builder_teacher_title')}>
                    {t('tests.help.sentence_builder_teacher_body')}
                </HelpPopover>
            </span>
            <RawTextToggle
                visual={
                    <SentenceCards
                        id={id}
                        targets={targets}
                        mismatched={unbuildable}
                        onChange={(next) => update({ sentenceTargets: next.length ? next : undefined })}
                    />
                }
                raw={
                    <LineListTextarea
                        id={`builder-targets-${id}`}
                        value={targets}
                        onChange={(next) => update({ sentenceTargets: next.length ? next : undefined })}
                        placeholder={t('tests.builder_targets_placeholder')}
                    />
                }
            />
            {unbuildable.length > 0 && (
                <p role="alert" className="text-xs" style={{ margin: 0, color: 'var(--red)' }}>
                    {t('tests.builder_alt_mismatch', { lines: unbuildable.join(', ') })}
                </p>
            )}
            <TilePreview sentence={targets[0] ?? ''} />
            <label htmlFor={`builder-scoring-${id}`}>{t('tests.builder_scoring_label')}</label>
            <select
                id={`builder-scoring-${id}`}
                value={question.builderScoring ?? 'longest-run'}
                onChange={(e) => update({ builderScoring: e.target.value as TestQuestion['builderScoring'] })}
                style={{ width: 'auto' }}
            >
                <option value="longest-run">{t('tests.builder_scoring_longest_run')}</option>
                <option value="all-or-nothing">{t('tests.builder_scoring_all_or_nothing')}</option>
            </select>
        </div>
    );
}

function TilePreview({ sentence }: { sentence: string }) {
    const { t } = useTranslation();
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    return (
        <div>
            <style>{CHIP_STYLES}</style>
            <p className="text-muted text-xs" style={{ margin: '0 0 4px' }}>
                {t('tests.builder_tile_count', { count: words.length })}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label={t('tests.builder_tiles_label')}>
                {[...words].sort().map((word, i) => (
                    <span key={`${word}-${i}`} className="te-chip te-chip-plain" style={{ paddingRight: 10 }}>
                        {word}
                    </span>
                ))}
            </div>
        </div>
    );
}

function SentenceCards({
    id,
    targets,
    mismatched,
    onChange,
}: {
    id: string;
    targets: string[];
    mismatched: number[];
    onChange: (targets: string[]) => void;
}) {
    const { t } = useTranslation();
    // Local so a freshly added, still-empty alternative survives until it is typed.
    const [rows, setRows] = useState<string[]>(() => (targets.length ? targets : ['']));
    const commit = (next: string[]) => {
        setRows(next);
        onChange(next.filter((r) => r.trim()));
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <style>{CHIP_STYLES}</style>
            {rows.map((row, i) => (
                <div key={i} className="te-card">
                    <label className="text-muted text-xs" htmlFor={`builder-row-${id}-${i}`}>
                        {i === 0 ? t('tests.builder_target_sentence') : t('tests.builder_alternative', { number: i })}
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            id={`builder-row-${id}-${i}`}
                            type="text"
                            value={row}
                            placeholder={i === 0 ? t('tests.builder_target_placeholder') : undefined}
                            aria-invalid={mismatched.includes(i + 1) || undefined}
                            onChange={(e) => commit(rows.map((r, j) => (j === i ? e.target.value : r)))}
                            style={{ flex: 1 }}
                        />
                        {i > 0 && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-label={t('tests.builder_remove_alternative', { number: i })}
                                onClick={() => commit(rows.filter((_, j) => j !== i))}
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setRows([...rows, ''])}
            >
                <Plus size={14} /> {t('tests.builder_add_alternative')}
            </button>
        </div>
    );
}
