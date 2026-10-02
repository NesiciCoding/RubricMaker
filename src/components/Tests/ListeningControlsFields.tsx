import { useTranslation } from 'react-i18next';

interface Value {
    maxPlays?: number;
    spokenText?: string;
    transcript?: string;
}

interface Props {
    id: string;
    value: Value;
    onChange: (patch: Partial<Value>) => void;
    /** Hidden for dictation, which speaks its own dictationText */
    showSpokenText?: boolean;
}

export default function ListeningControlsFields({ id, value, onChange, showSpokenText = true }: Props) {
    const { t } = useTranslation();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
                <label htmlFor={`${id}-max-plays`}>{t('tests.max_plays_label')}</label>
                <input
                    id={`${id}-max-plays`}
                    type="number"
                    min={1}
                    value={value.maxPlays ?? ''}
                    onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        onChange({ maxPlays: n >= 1 ? n : undefined });
                    }}
                    placeholder={t('tests.max_plays_placeholder')}
                    style={{ width: 120 }}
                />
            </div>
            {showSpokenText && (
                <div>
                    <label htmlFor={`${id}-spoken`}>{t('tests.spoken_text_label')}</label>
                    <textarea
                        id={`${id}-spoken`}
                        rows={3}
                        value={value.spokenText ?? ''}
                        onChange={(e) => onChange({ spokenText: e.target.value || undefined })}
                    />
                    <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                        {t('tests.spoken_text_help')}
                    </p>
                </div>
            )}
            <div>
                <label htmlFor={`${id}-transcript`}>{t('tests.transcript_label')}</label>
                <textarea
                    id={`${id}-transcript`}
                    rows={3}
                    value={value.transcript ?? ''}
                    onChange={(e) => onChange({ transcript: e.target.value || undefined })}
                />
                <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                    {t('tests.transcript_help')}
                </p>
            </div>
        </div>
    );
}
