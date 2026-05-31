import React, { useState } from 'react';
import { CheckCircle2, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';

type RoleChoice = 'user' | 'admin';
type SchoolAction = 'create' | 'join';
type Step = 'role' | 'school' | 'done';

/**
 * Renders the multi-step onboarding UI for selecting a role, creating or joining a school, and completing onboarding.
 *
 * Manages local form state, validation, busy/error states, and advances through the role → school → done steps.
 *
 * @returns The onboarding page React element.
 */
export default function OnboardingPage() {
    const { t } = useTranslation();
    const { createSchool, joinSchool, updateSettings, signOutFromDatabase } = useApp();

    const [step, setStep] = useState<Step>('role');
    const [role, setRole] = useState<RoleChoice>('user');
    const [schoolAction, setSchoolAction] = useState<SchoolAction>('create');
    const [schoolName, setSchoolName] = useState('');
    const [retentionYears, setRetentionYears] = useState(3);
    const [schoolId, setSchoolId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function handleSchoolStep() {
        setError('');
        if (schoolAction === 'create') {
            if (!schoolName.trim()) {
                setError(t('onboarding.error_name_required'));
                return;
            }
            const clampedYears = Math.min(
                20,
                Math.max(1, Number.isFinite(retentionYears) ? Math.round(retentionYears) : 3)
            );
            setBusy(true);
            try {
                const newSchool = await createSchool(schoolName.trim(), clampedYears);
                if (!newSchool) {
                    setError(t('onboarding.error_create', { error: 'unknown' }));
                    return;
                }
                updateSettings({ needsOnboarding: false, schoolId: newSchool.id, schoolName: newSchool.name });
                setStep('done');
            } finally {
                setBusy(false);
            }
        } else {
            if (!schoolId.trim()) {
                setError(t('onboarding.error_id_required'));
                return;
            }
            setBusy(true);
            try {
                const result = await joinSchool(schoolId.trim());
                if (!result.success) {
                    setError(t('onboarding.error_join', { error: result.error ?? 'unknown' }));
                    return;
                }
                updateSettings({ needsOnboarding: false });
                setStep('done');
            } finally {
                setBusy(false);
            }
        }
    }

    const cardStyle: React.CSSProperties = {
        background: '#f8fafc',
        border: '2px solid #e2e8f0',
        borderRadius: 12,
        padding: '20px 24px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'border-color 0.15s, background 0.15s',
    };

    const selectedCardStyle: React.CSSProperties = {
        ...cardStyle,
        background: 'var(--accent-soft)',
        border: '2px solid var(--accent)',
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #f0f4ff 0%, #fafbff 60%, #f5f0ff 100%)',
                padding: '32px 16px',
            }}
        >
            <div style={{ width: '100%', maxWidth: 480 }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>
                        RubricMaker
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '0.95rem' }}>
                        {t('onboarding.subtitle')}
                    </p>
                </div>

                <div
                    style={{
                        background: 'white',
                        borderRadius: 16,
                        padding: 32,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                    }}
                >
                    {step === 'role' && (
                        <>
                            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                {t('onboarding.step_role')}
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {(['user', 'admin'] as RoleChoice[]).map((r) => (
                                    <button
                                        key={r}
                                        style={role === r ? selectedCardStyle : cardStyle}
                                        onClick={() => setRole(r)}
                                    >
                                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                                            {t(`onboarding.role_${r === 'user' ? 'teacher' : 'admin'}`)}
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                            {t(`onboarding.role_${r === 'user' ? 'teacher' : 'admin'}_desc`)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <button
                                className="btn btn-primary"
                                style={{ marginTop: 24, width: '100%' }}
                                onClick={() => setStep('school')}
                            >
                                {t('onboarding.btn_next')}
                            </button>
                        </>
                    )}

                    {step === 'school' && (
                        <>
                            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                {t('onboarding.step_school')}
                            </h2>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                                {(['create', 'join'] as SchoolAction[]).map((a) => (
                                    <button
                                        key={a}
                                        className={
                                            schoolAction === a ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'
                                        }
                                        onClick={() => setSchoolAction(a)}
                                    >
                                        {t(`onboarding.school_${a}`)}
                                    </button>
                                ))}
                            </div>

                            {schoolAction === 'create' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div>
                                        <label
                                            style={{
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                color: '#374151',
                                                display: 'block',
                                                marginBottom: 4,
                                            }}
                                        >
                                            {t('onboarding.school_name_label')}
                                        </label>
                                        <input
                                            className="input"
                                            style={{ width: '100%', boxSizing: 'border-box' }}
                                            value={schoolName}
                                            onChange={(e) => setSchoolName(e.target.value)}
                                            placeholder={t('onboarding.school_name_placeholder')}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            style={{
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                color: '#374151',
                                                display: 'block',
                                                marginBottom: 4,
                                            }}
                                        >
                                            {t('onboarding.retention_label')}
                                        </label>
                                        <input
                                            className="input"
                                            style={{ width: 100 }}
                                            type="number"
                                            min={1}
                                            max={20}
                                            value={retentionYears}
                                            onChange={(e) => setRetentionYears(Number(e.target.value))}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label
                                        style={{
                                            fontSize: '0.875rem',
                                            fontWeight: 600,
                                            color: '#374151',
                                            display: 'block',
                                            marginBottom: 4,
                                        }}
                                    >
                                        {t('onboarding.school_id_label')}
                                    </label>
                                    <input
                                        className="input"
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            fontFamily: 'monospace',
                                            fontSize: '0.875rem',
                                        }}
                                        value={schoolId}
                                        onChange={(e) => setSchoolId(e.target.value)}
                                        placeholder={t('onboarding.school_id_placeholder')}
                                    />
                                </div>
                            )}

                            {error && (
                                <p style={{ margin: '12px 0 0', color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>
                            )}

                            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={() => setStep('role')}
                                    disabled={busy}
                                >
                                    {t('common.back')}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{
                                        flex: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 6,
                                    }}
                                    onClick={handleSchoolStep}
                                    disabled={busy}
                                >
                                    {busy && <Loader size={14} className="spin" />}
                                    {busy
                                        ? t(
                                              schoolAction === 'create'
                                                  ? 'onboarding.btn_creating'
                                                  : 'onboarding.btn_joining'
                                          )
                                        : t('onboarding.btn_finish')}
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'done' && (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <CheckCircle2 size={48} style={{ color: '#22c55e', marginBottom: 16 }} />
                            <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>
                                {t('onboarding.student_linked_title')}
                            </h2>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                {t('onboarding.student_linked_btn')}
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                        }}
                        onClick={signOutFromDatabase}
                    >
                        {t('studentPortal.sign_out')}
                    </button>
                </div>
            </div>
        </div>
    );
}
