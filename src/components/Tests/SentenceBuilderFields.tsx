import { useTranslation } from 'react-i18next';
import type { TestQuestion } from '../../types';
import HelpPopover from './HelpPopover';

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
}

export default function SentenceBuilderFields({ question, update }: Props) {
    const { t } = useTranslation();
    const targets = question.sentenceTargets ?? [];
    const id = question.id;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor={`builder-targets-${id}`}>
                {t('tests.builder_targets_label')}{' '}
                <HelpPopover title={t('tests.help.sentence_builder_teacher_title')}>
                    {t('tests.help.sentence_builder_teacher_body')}
                </HelpPopover>
            </label>
            <textarea
                id={`builder-targets-${id}`}
                rows={3}
                value={targets.join('\n')}
                onChange={(e) => {
                    const next = e.target.value.split('\n').filter((line) => line.trim());
                    update({ sentenceTargets: next.length ? next : undefined });
                }}
                placeholder={t('tests.builder_targets_placeholder')}
            />
            <p className="text-muted text-xs" style={{ margin: 0 }}>
                {t('tests.builder_tile_count', { count: targets[0]?.trim().split(/\s+/).filter(Boolean).length ?? 0 })}
            </p>
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
