import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { KEY_WORD_DEFAULT_LIMIT, keyWordChunks } from '../../../supabase/functions/_shared/testScoring';
import type { TestQuestion } from '../../types';
import AnswerToleranceFields from './AnswerToleranceFields';
import ChipListEditor from './ChipListEditor';
import HelpPopover from './HelpPopover';
import RawTextToggle from './RawTextToggle';

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
    partialCreditToggle: React.ReactNode;
}

export default function KeyWordTransformationFields({ question, update, partialCreditToggle }: Props) {
    const { t } = useTranslation();
    const limit = question.answerWordLimit ?? KEY_WORD_DEFAULT_LIMIT;
    const answers = question.expectedAnswers ?? [];
    const badChunkCount = answers.some((a) => keyWordChunks(a).length > 2);
    const id = question.id;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
                <label htmlFor={`kwt-key-${id}`}>
                    {t('tests.kwt_key_word_label')}{' '}
                    <HelpPopover title={t('tests.help.key_word_transformation_teacher_title')}>
                        {t('tests.help.key_word_transformation_teacher_body')}
                    </HelpPopover>
                </label>
                <input
                    id={`kwt-key-${id}`}
                    type="text"
                    value={question.keyWord ?? ''}
                    onChange={(e) => update({ keyWord: e.target.value || undefined })}
                    style={{ width: 200 }}
                />
            </div>
            <div>
                <label htmlFor={`kwt-gapped-${id}`}>{t('tests.kwt_gapped_label')}</label>
                <textarea
                    id={`kwt-gapped-${id}`}
                    rows={2}
                    value={question.gappedSentence ?? ''}
                    onChange={(e) => update({ gappedSentence: e.target.value })}
                    placeholder={t('tests.kwt_gapped_placeholder')}
                />
                <KwtPreview sentence={question.gappedSentence ?? ''} keyWord={question.keyWord ?? ''} />
            </div>
            <div>
                <span style={{ display: 'block', marginBottom: 4 }}>{t('tests.kwt_answers_label')}</span>
                <RawTextToggle
                    visual={
                        <KwtAnswerCards
                            id={id}
                            answers={answers}
                            onChange={(next) =>
                                update({ expectedAnswers: next.length ? next : undefined, expectedAnswer: undefined })
                            }
                        />
                    }
                    raw={
                        <KwtAnswersRaw
                            id={id}
                            answers={answers}
                            onChange={(next) =>
                                update({ expectedAnswers: next.length ? next : undefined, expectedAnswer: undefined })
                            }
                        />
                    }
                />
                <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                    {badChunkCount ? t('tests.kwt_answers_too_many_chunks') : t('tests.kwt_answers_help')}
                </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label htmlFor={`kwt-min-${id}`}>{t('tests.kwt_word_limit_label')}</label>
                <input
                    id={`kwt-min-${id}`}
                    type="number"
                    min={1}
                    value={limit.min}
                    aria-label={t('tests.kwt_word_limit_min')}
                    onChange={(e) => {
                        const min = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                        update({ answerWordLimit: { min, max: Math.max(min, limit.max) } });
                    }}
                    style={{ width: 70 }}
                />
                <span>–</span>
                <input
                    type="number"
                    min={limit.min}
                    value={limit.max}
                    aria-label={t('tests.kwt_word_limit_max')}
                    onChange={(e) =>
                        update({
                            answerWordLimit: {
                                ...limit,
                                max: Math.max(limit.min, Math.floor(Number(e.target.value)) || limit.min),
                            },
                        })
                    }
                    style={{ width: 70 }}
                />
            </div>
            <AnswerToleranceFields
                value={question.answerTolerance}
                onChange={(answerTolerance) => update({ answerTolerance })}
            />
            {partialCreditToggle}
        </div>
    );
}

function KwtPreview({ sentence, keyWord }: { sentence: string; keyWord: string }) {
    const { t } = useTranslation();
    if (!sentence.trim() && !keyWord.trim()) return null;
    const parts = sentence.split(/_{3,}/);
    return (
        <p className="text-muted text-xs" style={{ margin: '6px 0 0' }} aria-label={t('tests.kwt_preview_label')}>
            {keyWord.trim() && (
                <strong
                    style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '0 6px', marginRight: 8 }}
                >
                    {keyWord.toUpperCase()}
                </strong>
            )}
            {parts.map((part, i) => (
                <span key={i}>
                    {part}
                    {i < parts.length - 1 && (
                        <span style={{ display: 'inline-block', minWidth: 90, borderBottom: '1px solid var(--text)' }}>
                            &nbsp;
                        </span>
                    )}
                </span>
            ))}
        </p>
    );
}

function KwtAnswerCards({
    id,
    answers,
    onChange,
}: {
    id: string;
    answers: string[];
    onChange: (answers: string[]) => void;
}) {
    const { t } = useTranslation();
    // Local so a freshly added, still-empty card survives until its first part is typed.
    const [cards, setCards] = useState<string[][]>(() => (answers.length ? answers.map(keyWordChunks) : [[]]));
    const commit = (next: string[][]) => {
        setCards(next);
        onChange(next.filter((c) => c.length > 0).map((c) => c.join(' // ')));
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cards.map((parts, i) => (
                <div key={i} className="te-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="text-muted text-xs">{t('tests.kwt_answer_card', { number: i + 1 })}</span>
                        {cards.length > 1 && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-label={t('tests.kwt_remove_answer', { number: i + 1 })}
                                onClick={() => commit(cards.filter((_, j) => j !== i))}
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <ChipListEditor
                        id={i === 0 ? `kwt-answers-${id}` : undefined}
                        values={parts}
                        separators={[]}
                        plain
                        ariaLabel={t('tests.kwt_part_label', { number: i + 1 })}
                        placeholder={t('tests.kwt_part_placeholder')}
                        removeLabel={(value) => t('tests.chip_remove', { value })}
                        onChange={(next) => commit(cards.map((c, j) => (j === i ? next : c)))}
                    />
                </div>
            ))}
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setCards([...cards, []])}
            >
                <Plus size={14} /> {t('tests.kwt_add_answer')}
            </button>
        </div>
    );
}

function KwtAnswersRaw({
    id,
    answers,
    onChange,
}: {
    id: string;
    answers: string[];
    onChange: (answers: string[]) => void;
}) {
    const { t } = useTranslation();
    // Raw text, so a typed separator ("a |") survives until the next alternative is written.
    const [raw, setRaw] = useState(() => answers.join(' | '));
    return (
        <input
            id={`kwt-answers-${id}`}
            type="text"
            aria-label={t('tests.kwt_answers_label')}
            value={raw}
            onChange={(e) => {
                setRaw(e.target.value);
                onChange(
                    e.target.value
                        .split('|')
                        .map((a) => a.trim())
                        .filter(Boolean)
                );
            }}
            placeholder={t('tests.kwt_answers_placeholder')}
        />
    );
}
