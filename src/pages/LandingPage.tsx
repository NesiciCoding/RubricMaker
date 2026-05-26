import React, { useState } from 'react';
import { Laptop, LogIn, GraduationCap, ChevronDown, ChevronUp, Database, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { loadSupabaseConfig } from '../services/database';
import LoginButtons from '../components/auth/LoginButtons';

export default function LandingPage() {
    const { enterLocalMode, connectForOAuth } = useApp();

    const savedConfig = loadSupabaseConfig();
    const [supabaseReady, setSupabaseReady] = useState(!!savedConfig);

    // State for the "advanced" self-hosted URL/key form
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [dbUrl, setDbUrl] = useState(savedConfig?.supabaseUrl ?? '');
    const [dbKey, setDbKey] = useState(savedConfig?.supabaseAnonKey ?? '');
    const [configuring, setConfiguring] = useState(false);
    const [configError, setConfigError] = useState('');

    async function handleConfigure() {
        if (!dbUrl.trim() || !dbKey.trim()) { setConfigError('Both fields are required.'); return; }
        setConfiguring(true);
        setConfigError('');
        const ok = await connectForOAuth({ supabaseUrl: dbUrl.trim(), supabaseAnonKey: dbKey.trim() });
        setConfiguring(false);
        if (ok) { setSupabaseReady(true); setShowAdvanced(false); }
        else setConfigError('Could not connect — check the URL and key.');
    }

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #f0f4ff 0%, #fafbff 60%, #f5f0ff 100%)',
            padding: '32px 16px',
        }}>
            {/* Logo / title */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.03em' }}>
                    RubricMaker
                </div>
                <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '1rem' }}>
                    Choose how you'd like to continue
                </p>
            </div>

            {/* Three-column card grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 20,
                width: '100%',
                maxWidth: 900,
            }}>
                {/* ── Column 1: Try-out / Offline ── */}
                <Card
                    icon={<Laptop size={28} style={{ color: '#64748b' }} />}
                    title="Try-out / Offline"
                    subtitle="Work locally, no account needed"
                    accent="#64748b"
                    accentSoft="#f1f5f9"
                >
                    <p style={{ color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 20px' }}>
                        All your rubrics and grades stay in this browser. Nothing is sent to a server.
                        You can always connect an account later in Settings.
                    </p>
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={enterLocalMode}>
                        Continue without account
                    </button>
                </Card>

                {/* ── Column 2: Teacher Login ── */}
                <Card
                    icon={<LogIn size={28} style={{ color: 'var(--accent, #6366f1)' }} />}
                    title="Teacher Login"
                    subtitle="Sync across devices, share with colleagues"
                    accent="var(--accent, #6366f1)"
                    accentSoft="#eef2ff"
                    highlighted
                >
                    <LoginButtons
                        supabaseReady={supabaseReady}
                        onNeedConfig={() => setShowAdvanced(true)}
                    />
                    <AdvancedConfig
                        open={showAdvanced}
                        onToggle={() => setShowAdvanced(o => !o)}
                        dbUrl={dbUrl} setDbUrl={setDbUrl}
                        dbKey={dbKey} setDbKey={setDbKey}
                        configuring={configuring}
                        configError={configError}
                        onConfigure={handleConfigure}
                    />
                </Card>

                {/* ── Column 3: Student Login ── */}
                <Card
                    icon={<GraduationCap size={28} style={{ color: '#0891b2' }} />}
                    title="Student Login"
                    subtitle="Track your submissions"
                    accent="#0891b2"
                    accentSoft="#ecfeff"
                >
                    <p style={{ color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 16px' }}>
                        Sign in to keep a history of your essays and assessments.
                        <br />
                        <span style={{ fontSize: '0.8rem' }}>
                            Your teacher will give you the assignment link — you don't need an account to submit.
                        </span>
                    </p>
                    <LoginButtons
                        supabaseReady={supabaseReady}
                        onNeedConfig={() => setShowAdvanced(true)}
                    />
                </Card>
            </div>

            <p style={{ marginTop: 32, fontSize: '0.78rem', color: '#94a3b8' }}>
                By continuing you agree to the{' '}
                <a href="#/privacy" style={{ color: '#94a3b8', textDecoration: 'underline' }}>privacy statement</a>.
            </p>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface CardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    accent: string;
    accentSoft: string;
    highlighted?: boolean;
    children: React.ReactNode;
}

function Card({ icon, title, subtitle, accentSoft, highlighted, children }: CardProps) {
    return (
        <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 28,
            boxShadow: highlighted
                ? '0 8px 32px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.06)'
                : '0 2px 12px rgba(0,0,0,0.06)',
            border: highlighted ? '2px solid var(--accent, #6366f1)' : '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: accentSoft, borderRadius: 10, padding: '12px 14px', marginBottom: 18,
            }}>
                {icon}
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{title}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 1 }}>{subtitle}</div>
                </div>
            </div>
            {children}
        </div>
    );
}

interface AdvancedConfigProps {
    open: boolean;
    onToggle: () => void;
    dbUrl: string; setDbUrl: (v: string) => void;
    dbKey: string; setDbKey: (v: string) => void;
    configuring: boolean;
    configError: string;
    onConfigure: () => void;
}

function AdvancedConfig({ open, onToggle, dbUrl, setDbUrl, dbKey, setDbKey, configuring, configError, onConfigure }: AdvancedConfigProps) {
    return (
        <div style={{ marginTop: 12 }}>
            <button
                onClick={onToggle}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', fontSize: '0.78rem', padding: '4px 0',
                }}>
                {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Self-hosted / advanced
            </button>

            {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                        Run your own Supabase instance or use a custom project.{' '}
                        <a href="https://supabase.com" target="_blank" rel="noopener noreferrer"
                            style={{ color: '#94a3b8' }}>
                            supabase.com <ExternalLink size={9} />
                        </a>
                    </p>
                    <input
                        type="text" value={dbUrl}
                        onChange={e => setDbUrl(e.target.value)}
                        placeholder="https://your-project.supabase.co"
                        style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem' }}
                    />
                    <input
                        type="password" value={dbKey}
                        onChange={e => setDbKey(e.target.value)}
                        placeholder="anon key (eyJhbGci…)"
                        autoComplete="off"
                        style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.82rem' }}
                    />
                    {configError && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.78rem' }}>{configError}</p>}
                    <button className="btn btn-secondary btn-sm" disabled={configuring || !dbUrl || !dbKey}
                        onClick={onConfigure}>
                        <Database size={13} />
                        {configuring ? 'Connecting…' : 'Use this Supabase instance'}
                    </button>
                </div>
            )}
        </div>
    );
}
