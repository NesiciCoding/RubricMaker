import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Touch-friendly +/- stepper for point scoring (44px targets, keyboard-operable).
 * Extracted from GradeStudent so the grid and card grading layouts share one control.
 */
export default function TouchStepper({
    value,
    min,
    max,
    step,
    accentColor,
    onChange,
    label,
}: {
    value: number;
    min: number;
    max: number;
    step: number;
    accentColor: string;
    onChange: (value: number) => void;
    label: string;
}) {
    const { t } = useTranslation();
    const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
    const stepBy = (delta: number) => onChange(clamp(value + delta));
    const controlStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        minHeight: 44,
        padding: 0,
    };
    const decDisabled = value <= min;
    const incDisabled = value >= max;
    return (
        <div
            className="touch-stepper"
            role="group"
            aria-label={label}
            style={{ alignItems: 'center', gap: 8, marginTop: 4 }}
        >
            <button
                type="button"
                className="btn btn-secondary"
                aria-label={t('gradeStudent.stepper_decrease')}
                aria-disabled={decDisabled}
                onClick={() => !decDisabled && stepBy(-step)}
                style={{ ...controlStyle, opacity: decDisabled ? 0.5 : 1 }}
            >
                <Minus size={18} />
            </button>
            <div
                style={{
                    minWidth: 36,
                    textAlign: 'center',
                    fontWeight: 600,
                    color: accentColor,
                }}
            >
                {value}
            </div>
            <button
                type="button"
                className="btn btn-secondary"
                aria-label={t('gradeStudent.stepper_increase')}
                aria-disabled={incDisabled}
                onClick={() => !incDisabled && stepBy(step)}
                style={{ ...controlStyle, opacity: incDisabled ? 0.5 : 1 }}
            >
                <Plus size={18} />
            </button>
        </div>
    );
}
