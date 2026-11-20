import { useTranslation } from 'react-i18next';
import { gapCorrectAnswers, parseClozeGaps, setDropdownAlternativeRole } from '../../utils/clozeParse';

interface Props {
    prompt: string;
    onChange: (prompt: string) => void;
    /** Dropdown gaps give each alternative a correct/wrong role, so each one can be ticked. */
    rolesEditable: boolean;
}

const CHIP: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: '0.85rem',
    // The prompt form's label style uppercases its children; an answer must read as authored.
    textTransform: 'none',
    letterSpacing: 'normal',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text)',
};

/**
 * The passage's gaps as a numbered list, so an author can see every gap and its accepted answers
 * without opening each pill. Dropdown gaps tick the alternatives that count as correct; the marks
 * are written back into the stored `{{=correct|~wrong}}` syntax, which stays the only source of truth.
 */
export default function ClozeGapList({ prompt, onChange, rolesEditable }: Props) {
    const { t } = useTranslation();
    const gaps = parseClozeGaps(prompt);
    if (gaps.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                {rolesEditable ? t('tests.cloze_gaps_hint_roles') : t('tests.cloze_gaps_hint_typed')}
            </span>
            <ol
                aria-label={t('tests.cloze_gaps_label')}
                style={{ margin: 0, paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
                {gaps.map((gap, gapIndex) => {
                    const accepted = new Set(gapCorrectAnswers(gap, true).map((answer) => answer.trim().toLowerCase()));
                    return (
                        <li key={`gap-${gapIndex}`}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {gap.alternatives.map((alternative, alternativeIndex) => {
                                    const correct = rolesEditable && accepted.has(alternative.trim().toLowerCase());
                                    if (!rolesEditable) {
                                        return (
                                            <span key={`alt-${alternativeIndex}`} style={CHIP}>
                                                {alternative}
                                            </span>
                                        );
                                    }
                                    return (
                                        <label
                                            key={`alt-${alternativeIndex}`}
                                            style={{
                                                ...CHIP,
                                                padding: '2px 10px 2px 8px',
                                                background: correct
                                                    ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                                                    : 'var(--bg-elevated)',
                                                color: correct ? 'var(--accent-text)' : 'var(--text-muted)',
                                                fontWeight: correct ? 600 : 500,
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={correct}
                                                onChange={(e) =>
                                                    onChange(
                                                        setDropdownAlternativeRole(
                                                            prompt,
                                                            gapIndex,
                                                            alternativeIndex,
                                                            e.target.checked
                                                        )
                                                    )
                                                }
                                                aria-label={t('tests.cloze_gap_alt_mark', {
                                                    gap: gapIndex + 1,
                                                    alternative,
                                                })}
                                                style={{ accentColor: 'var(--accent-text)', margin: 0 }}
                                            />
                                            {alternative}
                                        </label>
                                    );
                                })}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
