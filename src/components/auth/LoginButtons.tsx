import React, { useState, useEffect } from 'react';
import { Mail, KeyRound, ChevronDown, ChevronUp, Loader2, Check } from 'lucide-react';
import { storageSync } from '../../services/database';

interface LoginButtonsProps {
    /** Called after email OTP is successfully verified (not needed for OAuth — those redirect). */
    onEmailSuccess?: () => void;
    /** Whether the Supabase client is ready to trigger OAuth. */
    supabaseReady: boolean;
    /** Shown when supabaseReady is false to let the user configure the connection first. */
    onNeedConfig?: () => void;
}

export default function LoginButtons({ onEmailSuccess, supabaseReady, onNeedConfig }: LoginButtonsProps) {
    const [emailOpen, setEmailOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [busy, setBusy] = useState<string | null>(null); // which button is loading
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    // Student login via teacher-issued password — the alternative when OTP email
    // delivery is unreliable (school spam filters, low default send limits).
    const [studentLoginOpen, setStudentLoginOpen] = useState(false);
    const [studentEmail, setStudentEmail] = useState('');
    const [studentPassword, setStudentPassword] = useState('');

    // null = not yet fetched (show all); string[] = loaded from site_config
    const [enabledProviders, setEnabledProviders] = useState<string[] | null>(null);

    useEffect(() => {
        if (!supabaseReady) return;
        storageSync.adapter.fetchAuthProviders().then((p) => {
            if (p) setEnabledProviders(p);
            // On null (error / table missing) we leave state as null → show all (fail open)
        });
    }, [supabaseReady]);

    // Returns true when a provider key should be shown.
    // null means "not loaded yet" → show everything optimistically.
    const show = (key: string) => enabledProviders === null || enabledProviders.includes(key);

    async function handleOAuth(provider: 'google' | 'ms-personal' | 'azure-ad') {
        if (!supabaseReady) {
            onNeedConfig?.();
            return;
        }
        setError('');
        setBusy(provider);
        let result: { error?: string };
        if (provider === 'google') result = await storageSync.signInWithGoogle();
        else if (provider === 'ms-personal') result = await storageSync.signInWithMicrosoftPersonal();
        else result = await storageSync.signInWithAzureAD();
        // On success the browser redirects — error only if something went wrong
        if (result.error) {
            setError(result.error);
            setBusy(null);
        }
    }

    async function handleSendOtp() {
        if (!email.trim()) {
            setError('Enter your email address.');
            return;
        }
        if (!supabaseReady) {
            onNeedConfig?.();
            return;
        }
        setError('');
        setBusy('otp-send');
        const result = await storageSync.adapter.signInWithEmail(email.trim());
        setBusy(null);
        if (result.error) setError(result.error);
        else setOtpSent(true);
    }

    async function handleVerifyOtp() {
        if (otp.trim().length < 8) {
            setError('Enter the 8-digit code.');
            return;
        }
        setError('');
        setBusy('otp-verify');
        const result = await storageSync.adapter.verifyOtp(email.trim(), otp.trim());
        setBusy(null);
        if (result.error) setError(result.error);
        else {
            setDone(true);
            onEmailSuccess?.();
        }
    }

    async function handleStudentPasswordLogin() {
        if (!studentEmail.trim() || !studentPassword) {
            setError('Enter your email and password.');
            return;
        }
        if (!supabaseReady) {
            onNeedConfig?.();
            return;
        }
        setError('');
        setBusy('student-password');
        const result = await storageSync.adapter.signInWithPassword(studentEmail.trim(), studentPassword);
        setBusy(null);
        if (result.error) setError(result.error);
        else {
            setDone(true);
            onEmailSuccess?.();
        }
    }

    const btnBase: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        background: '#fff',
        fontSize: '0.9rem',
        fontWeight: 600,
        cursor: 'pointer',
        width: '100%',
        transition: 'background 0.15s',
    };

    if (done) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontWeight: 600 }}>
                <Check size={18} /> Signed in — loading your data…
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Google */}
            {show('google') && (
                <button
                    style={btnBase}
                    disabled={!!busy}
                    onClick={() => handleOAuth('google')}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                    {busy === 'google' ? (
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    ) : (
                        <GoogleIcon />
                    )}
                    Sign in with Google
                </button>
            )}

            {/* Microsoft personal */}
            {show('azure_personal') && (
                <button
                    style={btnBase}
                    disabled={!!busy}
                    onClick={() => handleOAuth('ms-personal')}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                    {busy === 'ms-personal' ? (
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    ) : (
                        <MicrosoftIcon />
                    )}
                    Sign in with Microsoft
                </button>
            )}

            {/* Azure AD */}
            {show('azure_ad') && (
                <button
                    style={{ ...btnBase, borderColor: '#bfdbfe', background: '#eff6ff' }}
                    disabled={!!busy}
                    onClick={() => handleOAuth('azure-ad')}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#dbeafe')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#eff6ff')}
                >
                    {busy === 'azure-ad' ? (
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    ) : (
                        <MicrosoftIcon />
                    )}
                    <span>
                        Sign in with Microsoft{' '}
                        <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#2563eb' }}>(school / work)</span>
                    </span>
                </button>
            )}

            {/* Email OTP toggle */}
            {show('email') && (
                <button
                    style={{
                        ...btnBase,
                        background: 'transparent',
                        border: 'none',
                        padding: '6px 4px',
                        color: '#64748b',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                    }}
                    onClick={() => setEmailOpen((o) => !o)}
                >
                    <Mail size={16} />
                    Sign in with email
                    {emailOpen ? (
                        <ChevronUp size={14} style={{ marginLeft: 'auto' }} />
                    ) : (
                        <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                    )}
                </button>
            )}

            {show('email') && emailOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                    {!otpSent ? (
                        <>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError('');
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                                placeholder="your@email.com"
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: 7,
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.9rem',
                                }}
                                autoFocus
                            />
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={!!busy || !email.trim()}
                                onClick={handleSendOtp}
                            >
                                {busy === 'otp-send' ? (
                                    <>
                                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending…
                                    </>
                                ) : (
                                    'Send login code'
                                )}
                            </button>
                        </>
                    ) : (
                        <>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                Check <strong>{email}</strong> for an 8-digit code.
                            </p>
                            <input
                                type="text"
                                value={otp}
                                maxLength={8}
                                onChange={(e) => {
                                    setOtp(e.target.value.replace(/\D/g, ''));
                                    setError('');
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                                placeholder="12345678"
                                style={{
                                    padding: '9px 12px',
                                    borderRadius: 7,
                                    border: '1px solid #e2e8f0',
                                    fontSize: '1.1rem',
                                    letterSpacing: '0.25em',
                                    textAlign: 'center',
                                    fontFamily: 'monospace',
                                }}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        setOtpSent(false);
                                        setOtp('');
                                    }}
                                >
                                    Back
                                </button>
                                <button
                                    className="btn btn-primary btn-sm"
                                    disabled={!!busy || otp.length < 8}
                                    onClick={handleVerifyOtp}
                                >
                                    {busy === 'otp-verify' ? (
                                        <>
                                            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{' '}
                                            Verifying…
                                        </>
                                    ) : (
                                        'Verify code'
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Student login (password) — bypasses OTP email entirely, for schools where
                Supabase's default email delivery is blocked or delayed. The teacher issues
                this password from the Students page. */}
            <button
                style={{
                    ...btnBase,
                    background: 'transparent',
                    border: 'none',
                    padding: '6px 4px',
                    color: '#64748b',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                }}
                onClick={() => setStudentLoginOpen((o) => !o)}
            >
                <KeyRound size={16} />
                Student login (password)
                {studentLoginOpen ? (
                    <ChevronUp size={14} style={{ marginLeft: 'auto' }} />
                ) : (
                    <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                )}
            </button>

            {studentLoginOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                    <input
                        type="email"
                        value={studentEmail}
                        onChange={(e) => {
                            setStudentEmail(e.target.value);
                            setError('');
                        }}
                        placeholder="your@email.com"
                        style={{ padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                    />
                    <input
                        type="password"
                        value={studentPassword}
                        onChange={(e) => {
                            setStudentPassword(e.target.value);
                            setError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleStudentPasswordLogin()}
                        placeholder="Password"
                        style={{ padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                    />
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={!!busy || !studentEmail.trim() || !studentPassword}
                        onClick={handleStudentPasswordLogin}
                    >
                        {busy === 'student-password' ? (
                            <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…
                            </>
                        ) : (
                            'Sign in'
                        )}
                    </button>
                </div>
            )}

            {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.82rem' }}>{error}</p>}
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            />
            <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
                fill="#FBBC05"
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            />
            <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
        </svg>
    );
}

function MicrosoftIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 21 21" style={{ flexShrink: 0 }}>
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
    );
}
