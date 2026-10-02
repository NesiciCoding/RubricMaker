import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KEY_WORD_DEFAULT_LIMIT, keyWordChunks } from '../../../supabase/functions/_shared/testScoring';
import type { TestQuestion } from '../../types';
import AnswerToleranceFields from './AnswerToleranceFields';
import HelpPopover from './HelpPopover';

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
    // Raw text, so a typed separator ("a |") survives until the next alternative is written.
    const [rawAnswers, setRawAnswers] = useState(() => answers.join(' | '));

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
            </div>
            <div>
                <label htmlFor={`kwt-answers-${id}`}>{t('tests.kwt_answers_label')}</label>
                <input
                    id={`kwt-answers-${id}`}
                    type="text"
                    value={rawAnswers}
                    onChange={(e) => {
                        setRawAnswers(e.target.value);
                        const next = e.target.value
                            .split('|')
                            .map((a) => a.trim())
                            .filter(Boolean);
                        update({ expectedAnswers: next.length ? next : undefined, expectedAnswer: undefined });
                    }}
                    placeholder={t('tests.kwt_answers_placeholder')}
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
