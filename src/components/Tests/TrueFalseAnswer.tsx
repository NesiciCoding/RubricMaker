import { useTranslation } from 'react-i18next';

interface Props {
    value: string;
    onChange: (value: string) => void;
}

/** Two wide buttons; the chosen one is outlined in the accent colour and bold. */
export default function TrueFalseAnswer({ value, onChange }: Props) {
    const { t } = useTranslation();
    return (
        <div style={{ display: 'flex', gap: 10 }}>
            {(['true', 'false'] as const).map((option) => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    style={{
                        flex: 1,
                        padding: '14px 0',
                        borderRadius: 8,
                        border: value === option ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background:
                            value === option ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)',
                        color: 'var(--text)',
                        fontWeight: value === option ? 700 : 400,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                    }}
                >
                    {t(`tests.true_false_${option}`)}
                </button>
            ))}
        </div>
    );
}
