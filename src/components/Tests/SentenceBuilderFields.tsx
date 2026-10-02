import { useTranslation } from 'react-i18next';
import type { TestQuestion } from '../../types';
import HelpPopover from './HelpPopover';
import LineListTextarea from './LineListTextarea';

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
            <label htmlFor={`builder-targets-${id}`}>
                {t('tests.builder_targets_label')}{' '}
                <HelpPopover title={t('tests.help.sentence_builder_teacher_title')}>
                    {t('tests.help.sentence_builder_teacher_body')}
                </HelpPopover>
            </label>
            <LineListTextarea
                id={`builder-targets-${id}`}
                value={targets}
                onChange={(next) => update({ sentenceTargets: next.length ? next : undefined })}
                placeholder={t('tests.builder_targets_placeholder')}
            />
            {unbuildable.length > 0 && (
                <p role="alert" className="text-xs" style={{ margin: 0, color: 'var(--red)' }}>
                    {t('tests.builder_alt_mismatch', { lines: unbuildable.join(', ') })}
                </p>
            )}
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
