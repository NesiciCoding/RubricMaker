import { useTranslation } from 'react-i18next';
import type { AnswerTolerance } from '../../../supabase/functions/_shared/testScoring';
import HelpPopover from './HelpPopover';

const FLAGS = ['punctuation', 'contractions', 'spelling', 'slips'] as const;

interface Props {
    value?: AnswerTolerance;
    onChange: (next: AnswerTolerance | undefined) => void;
}

export default function AnswerToleranceFields({ value, onChange }: Props) {
    const { t } = useTranslation();
    const toggle = (flag: (typeof FLAGS)[number], on: boolean) => {
        const next = { ...value, [flag]: on || undefined };
        onChange(FLAGS.some((f) => next[f]) ? next : undefined);
    };
    return (
        <fieldset style={{ border: 'none', padding: 0, margin: '4px 0 0' }}>
            <legend style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {t('tests.tolerance_label')}{' '}
                <HelpPopover title={t('tests.tolerance_label')}>{t('tests.tolerance_help')}</HelpPopover>
            </legend>
            {FLAGS.map((flag) => (
                <label key={flag} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={!!value?.[flag]} onChange={(e) => toggle(flag, e.target.checked)} />
                    {t(`tests.tolerance_${flag}`)}
                </label>
            ))}
        </fieldset>
    );
}
