import React from 'react';
import { useTranslation } from 'react-i18next';
import { GRAMMAR_LEVEL_BANDS, type GrammarLevelBand } from '../../utils/grammarStandardAggregator';

const LABEL_KEY: Record<GrammarLevelBand, string> = {
    a1a2: 'grammarOverview.band_a1a2',
    b1: 'grammarOverview.band_b1',
    b2plus: 'grammarOverview.band_b2plus',
    all: 'grammarOverview.band_all',
};

export default function GrammarBandFilter({
    value,
    onChange,
    ariaLabel,
}: {
    value: GrammarLevelBand;
    onChange: (band: GrammarLevelBand) => void;
    ariaLabel: string;
}) {
    const { t } = useTranslation();

    return (
        <div
            role="group"
            aria-label={ariaLabel}
            style={{
                display: 'inline-flex',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 2,
            }}
        >
            {GRAMMAR_LEVEL_BANDS.map((band) => (
                <button
                    key={band}
                    type="button"
                    className={`btn btn-sm ${value === band ? 'btn-secondary' : 'btn-ghost'}`}
                    style={{ border: 'none' }}
                    aria-pressed={value === band}
                    onClick={() => onChange(band)}
                >
                    {t(LABEL_KEY[band])}
                </button>
            ))}
        </div>
    );
}
