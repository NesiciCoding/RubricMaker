import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, Lightbulb, Save } from 'lucide-react';
import type { TestQuestionIssue } from '../../utils/testQuestionIssues';
import type { TestQualityFinding } from '../../utils/testQualityChecks';

/**
 * A fix the checks screen can apply in place: an input for the missing value, a pick for the correct
 * option, or an `action` button for a field that needs more than one value (the time limit, the CEFR
 * target) and so opens instead of editing here.
 */
export interface TestCheckFix {
    control: 'number' | 'text' | 'select' | 'action';
    /** Translation key of the field label, or the button's own label for `action`. */
    labelKey: string;
    /** Starting value; empty for `action`. */
    value: string;
    /** Choices for `select`. */
    options?: { value: string; label: string }[];
    apply: (value: string) => void;
}

export interface TestCheckRow {
    questionId: string;
    /** 1-based number in the order students see. */
    number: number;
    label: string;
    issues: TestQuestionIssue[];
    /** Fixes that can be applied on this screen, in issue order. */
    fixes?: TestCheckFix[];
}

/** A quality hint plus whatever part of it can be fixed without leaving the screen. */
export interface TestQualityRow extends TestQualityFinding {
    fixes?: TestCheckFix[];
}

export interface VerifiedCheck {
    id: string;
    labelKey: string;
    values?: Record<string, unknown>;
}

interface Props {
    rows: TestCheckRow[];
    noQuestions: boolean;
    questionCount: number;
    totalPoints: number;
    verified: VerifiedCheck[];
    /** Non-blocking quality hints; absent when the test has none. */
    quality?: TestQualityRow[];
    onJump: (questionId: string) => void;
    onBack?: () => void;
    onSave: () => void;
    onAssign: () => void;
    readOnly?: boolean;
}

/** One inline fixer: an input, a pick, or a button that opens the field it belongs to. */
function CheckFixControl({ fix, testId }: { fix: TestCheckFix; testId: string }) {
    const { t } = useTranslation();
    const [value, setValue] = useState(fix.value);
    const inputId = `${testId}-input`;

    if (fix.control === 'action') {
        return (
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-testid={`${testId}-apply`}
                onClick={() => fix.apply('')}
            >
                {t(fix.labelKey)}
            </button>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <label htmlFor={inputId} className="text-xs">
                {t(fix.labelKey)}
            </label>
            {fix.control === 'select' ? (
                <select
                    id={inputId}
                    data-testid={inputId}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    style={{ padding: '4px 6px', maxWidth: 220 }}
                >
                    {(fix.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    id={inputId}
                    data-testid={inputId}
                    type={fix.control}
                    inputMode={fix.control === 'number' ? 'decimal' : undefined}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    style={{ padding: '4px 6px', width: fix.control === 'number' ? 90 : 220 }}
                />
            )}
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-testid={`${testId}-apply`}
                onClick={() => fix.apply(value)}
                disabled={value.trim() === ''}
            >
                {t('tests.fix_apply')}
            </button>
        </div>
    );
}

/**
 * The pre-assign screen: what stops the test being handed to students, one line per question with a
 * jump link and the fix that can be applied in place, then what could be better, then what is
 * already fine, then the save/assign footer. It only presents the issues `testAssignBlockers` and
 * `testQualityChecks` already compute — no validation lives here.
 */
export default function TestChecksPanel({
    rows,
    noQuestions,
    questionCount,
    totalPoints,
    verified,
    quality = [],
    onJump,
    onBack,
    onSave,
    onAssign,
    readOnly = false,
}: Props) {
    const { t } = useTranslation();
    const blocked = noQuestions || rows.length > 0;

    return (
        <section
            data-testid="checks-panel"
            aria-labelledby="checks-heading"
            className="card"
            style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2
                    id="checks-heading"
                    style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <ClipboardCheck size={16} aria-hidden="true" />
                    {t('tests.checks_title')}
                </h2>
                <span className="text-muted text-xs">
                    {t('tests.questions_summary', {
                        count: questionCount,
                        points: t('tests.points_total', { count: totalPoints }),
                    })}
                </span>
                {onBack && (
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={onBack}
                        data-testid="checks_back"
                        style={{ marginLeft: 'auto' }}
                    >
                        <ArrowLeft size={14} /> {t('tests.checks_back')}
                    </button>
                )}
            </div>

            <p
                role="status"
                style={{
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    color: blocked ? 'var(--yellow-text)' : 'var(--green-text)',
                }}
            >
                {blocked ? <AlertCircle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
                {blocked ? t('tests.issues_title') : t('tests.checks_ready')}
            </p>

            {(noQuestions || rows.length > 0) && (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                    {noQuestions && (
                        <li className="text-sm" style={{ margin: 0 }}>
                            {t('tests.issue_no_questions')}
                        </li>
                    )}
                    {rows.map((row) => (
                        <li
                            key={row.questionId}
                            data-testid={`checks-row-${row.questionId}`}
                            style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: '8px 10px',
                                display: 'grid',
                                gap: 6,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    data-testid={`checks-jump-${row.questionId}`}
                                    onClick={() => onJump(row.questionId)}
                                    style={{
                                        padding: 0,
                                        border: 'none',
                                        background: 'none',
                                        color: 'var(--accent-text)',
                                        font: 'inherit',
                                        fontWeight: 700,
                                        textDecoration: 'underline',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {t('tests.issue_question', { number: row.number })}
                                </button>
                                <span
                                    className="text-muted text-xs"
                                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                    {row.label}
                                </span>
                                <span className="text-xs" style={{ marginLeft: 'auto' }}>
                                    {t('tests.checks_jump')}
                                </span>
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
                                {row.issues.map((issue) => (
                                    <li key={issue}>{t(`tests.issue_${issue}`)}</li>
                                ))}
                            </ul>
                            {!readOnly &&
                                (row.fixes ?? []).map((fix, index) => (
                                    <CheckFixControl
                                        key={`${fix.labelKey}-${index}`}
                                        fix={fix}
                                        testId={`${row.questionId}-fix-${index}`}
                                    />
                                ))}
                        </li>
                    ))}
                </ul>
            )}

            {quality.length > 0 && (
                <div data-testid="checks-quality" style={{ display: 'grid', gap: 6 }}>
                    <p
                        className="text-muted text-xs"
                        style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}
                    >
                        {t('tests.quality_title')}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                        {quality.map((finding) => (
                            <li
                                key={`${finding.id}-${finding.questionIds.join('-')}`}
                                data-testid={`quality-${finding.id}-${finding.questionIds[0] ?? 'test'}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    fontSize: '0.85rem',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <Lightbulb
                                    size={14}
                                    style={{ color: 'var(--yellow-text)', flexShrink: 0 }}
                                    aria-hidden="true"
                                />
                                <span style={{ flex: 1, minWidth: 200 }}>
                                    {finding.values
                                        ? t(`tests.quality_${finding.id}`, finding.values)
                                        : t(`tests.quality_${finding.id}`)}
                                </span>
                                {finding.questionIds[0] && (
                                    <button
                                        type="button"
                                        data-testid={`quality-jump-${finding.questionIds[0]}`}
                                        onClick={() => onJump(finding.questionIds[0])}
                                        style={{
                                            padding: 0,
                                            border: 'none',
                                            background: 'none',
                                            color: 'var(--accent-text)',
                                            font: 'inherit',
                                            textDecoration: 'underline',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {t('tests.checks_jump')}
                                    </button>
                                )}
                                {!readOnly &&
                                    (finding.fixes ?? []).map((fix, index) => (
                                        <div key={`${fix.labelKey}-${index}`} style={{ flexBasis: '100%' }}>
                                            <CheckFixControl
                                                fix={fix}
                                                testId={`quality-${finding.id}-${finding.questionIds[0] ?? 'test'}-fix-${index}`}
                                            />
                                        </div>
                                    ))}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {verified.length > 0 && (
                <div data-testid="checks-verified" style={{ display: 'grid', gap: 6 }}>
                    <p
                        className="text-muted text-xs"
                        style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}
                    >
                        {t('tests.checks_verified_title')}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                        {verified.map((check) => (
                            <li
                                key={check.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: '0.85rem',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <CheckCircle2 size={14} style={{ color: 'var(--green-text)' }} aria-hidden="true" />
                                {check.values ? t(check.labelKey, check.values) : t(check.labelKey)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    borderTop: '1px solid var(--border)',
                    paddingTop: 12,
                }}
            >
                <span className="text-muted text-xs">{t('tests.checks_assign_hint')}</span>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    {!readOnly && (
                        <>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                data-testid="checks-save"
                                onClick={onSave}
                            >
                                <Save size={14} /> {t('tests.checks_save')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                data-testid="checks-assign"
                                onClick={onAssign}
                            >
                                {t('tests.checks_assign')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
