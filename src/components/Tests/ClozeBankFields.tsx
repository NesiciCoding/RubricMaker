import { useTranslation } from 'react-i18next';
import { stripHtmlKeepLineBreaks } from '../../utils/exportDataPrep';
import { renderClozeSegments } from '../../utils/clozeParse';
import type { TestQuestion } from '../../types';
import ChipListEditor from './ChipListEditor';
import LineListTextarea from './LineListTextarea';
import RawTextToggle from './RawTextToggle';
import { CHIP_STYLES } from './testEditorStyles';

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
}

export default function ClozeBankFields({ question, update }: Props) {
    const { t } = useTranslation();
    const distractors = question.bankDistractors ?? [];
    const answers = renderClozeSegments(stripHtmlKeepLineBreaks(question.prompt)).flatMap((s) =>
        s.type === 'gap' ? [s.gap.alternatives[0] ?? ''] : []
    );
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>{t('tests.bank_distractors_label')}</span>
            <RawTextToggle
                visual={
                    <ChipListEditor
                        id={`bank-distractors-${question.id}`}
                        values={distractors}
                        separators={[]}
                        ariaLabel={t('tests.bank_distractors_label')}
                        placeholder={t('tests.bank_distractors_chip_placeholder')}
                        removeLabel={(value) => t('tests.chip_remove', { value })}
                        onChange={(bankDistractors) => update({ bankDistractors })}
                    />
                }
                raw={
                    <LineListTextarea
                        id={`bank-distractors-${question.id}`}
                        value={distractors}
                        onChange={(bankDistractors) => update({ bankDistractors })}
                        placeholder={t('tests.bank_distractors_placeholder')}
                    />
                }
            />
            <div>
                <style>{CHIP_STYLES}</style>
                <p className="text-muted text-xs" style={{ margin: '0 0 4px' }}>
                    {t('tests.bank_preview_label')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label={t('tests.bank_preview_label')}>
                    {answers.filter(Boolean).map((text, i) => (
                        <span key={`a-${i}`} className="te-chip" style={{ paddingRight: 10 }}>
                            {text}
                        </span>
                    ))}
                    {distractors.map((text, i) => (
                        <span key={`d-${i}`} className="te-chip te-chip-plain" style={{ paddingRight: 10 }}>
                            {text}
                        </span>
                    ))}
                </div>
                <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                    {t('tests.bank_preview_legend')}
                </p>
            </div>
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
