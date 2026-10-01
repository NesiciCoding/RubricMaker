import { useTranslation } from 'react-i18next';
import { parseErrorPassage } from '../../../supabase/functions/_shared/testScoring';
import type { TestQuestion } from '../../types';
import AnswerToleranceFields from './AnswerToleranceFields';
import HelpPopover from './HelpPopover';

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
    partialCreditToggle: React.ReactNode;
}

export default function ErrorCorrectionFields({ question, update, partialCreditToggle }: Props) {
    const { t } = useTranslation();
    const fragments = parseErrorPassage(question.errorPassage ?? '').filter((s) => s.type === 'fragment');
    const errors = fragments.filter((f) => f.corrections.length > 0).length;
    const id = question.id;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor={`error-passage-${id}`}>
                {t('tests.error_passage_label')}{' '}
                <HelpPopover title={t('tests.help.error_correction_teacher_title')}>
                    {t('tests.help.error_correction_teacher_body')}
                </HelpPopover>
            </label>
            <textarea
                id={`error-passage-${id}`}
                rows={4}
                value={question.errorPassage ?? ''}
                onChange={(e) => update({ errorPassage: e.target.value })}
                placeholder={t('tests.error_passage_placeholder')}
            />
            <p className="text-muted text-xs" style={{ margin: 0 }}>
                {t('tests.error_passage_summary', { fragments: fragments.length, errors })}
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                <input
                    type="checkbox"
                    checked={!!question.penaliseFalsePicks}
                    onChange={(e) => update({ penaliseFalsePicks: e.target.checked || undefined })}
                />
                {t('tests.penalise_false_picks_label')}
            </label>
            <AnswerToleranceFields
                value={question.answerTolerance}
                onChange={(answerTolerance) => update({ answerTolerance })}
            />
            {partialCreditToggle}
        </div>
    );
}
