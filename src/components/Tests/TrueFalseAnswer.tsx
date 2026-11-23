import { useTranslation } from 'react-i18next';

interface Props {
    value: string;
    onChange: (value: string) => void;
    /** Custom wording for the two buttons; blank falls back to True / False. */
    trueLabel?: string;
    falseLabel?: string;
}

/** Two wide buttons; the chosen one is outlined in the accent colour and bold. */
export default function TrueFalseAnswer({ value, onChange, trueLabel, falseLabel }: Props) {
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
                    {(option === 'true' ? trueLabel : falseLabel)?.trim() || t(`tests.true_false_${option}`)}
                </button>
            ))}
        </div>
    );
}
