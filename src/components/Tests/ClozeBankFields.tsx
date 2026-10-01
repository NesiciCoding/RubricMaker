import { useTranslation } from 'react-i18next';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
}

export default function ClozeBankFields({ question, update }: Props) {
    const { t } = useTranslation();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor={`bank-distractors-${question.id}`}>{t('tests.bank_distractors_label')}</label>
            <textarea
                id={`bank-distractors-${question.id}`}
                rows={3}
                value={(question.bankDistractors ?? []).join('\n')}
                onChange={(e) =>
                    update({
                        bankDistractors: e.target.value.split('\n').filter((line) => line.trim()),
                    })
                }
                placeholder={t('tests.bank_distractors_placeholder')}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                <input
                    type="checkbox"
                    checked={question.bankUniqueUse ?? true}
                    onChange={(e) => update({ bankUniqueUse: e.target.checked })}
                />
                {t('tests.bank_unique_use_label')}
            </label>
        </div>
    );
}
