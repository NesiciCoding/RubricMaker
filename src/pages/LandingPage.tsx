import React, { useState } from 'react';
import {
    Laptop,
    LogIn,
    GraduationCap,
    ChevronDown,
    ChevronUp,
    Database,
    ExternalLink,
    BookOpen,
    Users,
    BarChart3,
    FileText,
    Layers,
    Globe,
    Shield,
    CheckCircle,
    Star,
    MessageSquare,
    Eye,
    Palette,
    Languages,
    Radio,
    ClipboardCheck,
    PenLine,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { loadSupabaseConfig } from '../services/database';
import LoginButtons from '../components/auth/LoginButtons';

const TEACHER_FEATURES = [
    {
        icon: BookOpen,
        title: 'Rubric Builder',
        desc: 'Design rubrics with custom criteria, weighted scoring, CEFR descriptors, and version history.',
        color: '#3b82f6',
    },
    {
        icon: Users,
        title: 'Smart Grading',
        desc: 'Grade with a comment bank, voice dictation, file attachments, audio/video speaking recordings, and side-by-side comparative view.',
        color: '#8b5cf6',
    },
    {
        icon: BarChart3,
        title: 'Analytics & Export',
        desc: 'Grade distributions, per-criterion breakdowns, class-vs-class comparison with insights, activity dashboard, CEFR progress reports, PDF/Word/CSV export.',
        color: '#06b6d4',
    },
    {
        icon: Palette,
        title: 'Theme bundles',
        desc: 'Six named themes (Academy, Nature, Midnight…) set accent colour, font, and export style in one click.',
        color: '#8b5cf6',
    },
    {
        icon: Languages,
        title: 'Vocabulary Profile',
        desc: 'See each class and student’s CEFR vocabulary range (A1–C2) from their analysed work, and export word lists by level.',
        color: '#f59e0b',
    },
    {
        icon: Radio,
        title: 'Live Monitoring',
        desc: 'Watch tests and essays as students work — who’s online, their progress, and live drafts, updated in real time.',
        color: '#ef4444',
    },
    {
        icon: ClipboardCheck,
        title: 'Tests & Quizzes',
        desc: 'Build multiple-choice, multiple-response, true/false, short-answer, open, fill-the-gap, matching, ordering, categorize, and hot text tests, assign them with a share link or Safe Exam Browser, then auto-grade and fine-tune the class average.',
        color: '#3b82f6',
    },
    {
        icon: PenLine,
        title: 'Essays',
        desc: 'Write a prompt, link a rubric, and assign it to a class from a dedicated Essays page — then track submissions, share links, and watch live progress, all in one place.',
        color: '#6366f1',
    },
];

const STUDENT_FEATURES = [
    {
        icon: Eye,
        title: 'View Feedback',
        desc: 'See your grades, teacher comments, and attached files via your personal portal link — no login needed.',
        color: '#10b981',
    },
    {
        icon: FileText,
        title: 'Submit Essays',
        desc: 'Write in a rich-text A4 editor and submit with a code your teacher gives you. No account required.',
        color: '#f59e0b',
    },
    {
        icon: Star,
        title: 'Self-Assessment',
        desc: 'Rate yourself against CEFR Can-Do statements and track your language proficiency over time.',
        color: '#6366f1',
    },
    {
        icon: MessageSquare,
        title: 'Peer Review',
        desc: "Leave structured feedback on a classmate's work using the same rubric your teacher uses.",
        color: '#8b5cf6',
    },
    {
        icon: ClipboardCheck,
        title: 'Take a Test',
        desc: 'Open a test link from your teacher, answer the questions with a countdown timer, and submit — your answers are saved automatically as you go.',
        color: '#3b82f6',
    },
];

export default function LandingPage() {
    const { enterLocalMode, connectForOAuth } = useApp();

    const savedConfig = loadSupabaseConfig();
    const [supabaseReady, setSupabaseReady] = useState(!!savedConfig);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [dbUrl, setDbUrl] = useState(savedConfig?.supabaseUrl ?? '');
    const [dbKey, setDbKey] = useState(savedConfig?.supabaseAnonKey ?? '');
    const [configuring, setConfiguring] = useState(false);
    const [configError, setConfigError] = useState('');

    async function handleConfigure() {
        if (!dbUrl.trim() || !dbKey.trim()) {
            setConfigError('Both fields are required.');
            return;
        }
        setConfiguring(true);
        setConfigError('');
        const ok = await connectForOAuth({ supabaseUrl: dbUrl.trim(), supabaseAnonKey: dbKey.trim() });
        setConfiguring(false);
        if (ok) {
            setSupabaseReady(true);
            setShowAdvanced(false);
        } else setConfigError('Could not connect — check the URL and key.');
    }

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: 'linear-gradient(160deg, #f0f4ff 0%, #fafbff 50%, #f5f0ff 100%)',
            }}
        >
            {/* ── Hero ── */}
            <div
                style={{
                    width: '100%',
                    maxWidth: 960,
                    padding: '64px 24px 48px',
                    textAlign: 'center',
                }}
            >
                {/* Logo badge */}
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 40,
                        padding: '6px 16px 6px 10px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        marginBottom: 28,
                    }}
                >
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Layers size={15} style={{ color: '#fff' }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', letterSpacing: '-0.01em' }}>
                        RubricMaker
                    </span>
                </div>

                <h1
                    style={{
                        fontSize: 'clamp(2rem, 5vw, 3rem)',
                        fontWeight: 800,
                        color: '#0f172a',
                        margin: '0 0 16px',
                        lineHeight: 1.15,
                        letterSpacing: '-0.03em',
                    }}
                >
                    Better assessment,{' '}
                    <span
                        style={{
                            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        for everyone
                    </span>
                </h1>
                <p
                    style={{
                        fontSize: '1.1rem',
                        color: '#475569',
                        maxWidth: 580,
                        margin: '0 auto 12px',
                        lineHeight: 1.6,
                    }}
                >
                    Teachers build rubrics and grade efficiently. Students view feedback, submit essays, and track their
                    own progress — all without needing an account.
                </p>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 16,
                        flexWrap: 'wrap',
                        marginTop: 8,
                    }}
                >
                    {[
                        { icon: CheckCircle, label: 'No student account needed' },
                        { icon: CheckCircle, label: 'CEFR proficiency tracking' },
                        { icon: CheckCircle, label: 'Offline-first' },
                    ].map(({ icon: Icon, label }) => (
                        <span
                            key={label}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: '0.82rem',
                                color: '#475569',
                            }}
                        >
                            <Icon size={13} style={{ color: '#10b981' }} />
                            {label}
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Login cards ── */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 16,
                    width: '100%',
                    maxWidth: 920,
                    padding: '0 24px',
                }}
            >
                {/* Try-out / Offline */}
                <LoginCard
                    icon={<Laptop size={22} style={{ color: '#475569' }} />}
                    title="Try-out / Offline"
                    subtitle="Work locally, no account needed"
                    accentColor="#475569"
                    accentBg="#f1f5f9"
                >
                    <p style={{ color: '#475569', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 20px' }}>
                        All rubrics and grades stay in this browser. Nothing is sent to a server. You can connect an
                        account later in Settings.
                    </p>
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={enterLocalMode}>
                        Continue without account
                    </button>
                </LoginCard>

                {/* Teacher Login — highlighted */}
                <LoginCard
                    icon={<LogIn size={22} style={{ color: '#6366f1' }} />}
                    title="Teacher Login"
                    subtitle="Sync across devices, share with colleagues"
                    accentColor="#4f46e5"
                    accentBg="#eef2ff"
                    highlighted
                >
                    <LoginButtons supabaseReady={supabaseReady} onNeedConfig={() => setShowAdvanced(true)} />
                    <AdvancedConfig
                        open={showAdvanced}
                        onToggle={() => setShowAdvanced((o) => !o)}
                        dbUrl={dbUrl}
                        setDbUrl={setDbUrl}
                        dbKey={dbKey}
                        setDbKey={setDbKey}
                        configuring={configuring}
                        configError={configError}
                        onConfigure={handleConfigure}
                    />
                </LoginCard>

                {/* Student */}
                <LoginCard
                    icon={<GraduationCap size={22} style={{ color: '#0891b2' }} />}
                    title="Student Login"
                    subtitle="View feedback and submit work"
                    accentColor="#0891b2"
                    accentBg="#ecfeff"
                >
                    <p style={{ color: '#475569', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 16px' }}>
                        Sign in to keep a history of your essays and assessments.
                        <br />
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Your teacher will give you the assignment link — you don't need an account to submit.
                        </span>
                    </p>
                    <LoginButtons supabaseReady={supabaseReady} onNeedConfig={() => setShowAdvanced(true)} />
                </LoginCard>
            </div>

            {/* ── Feature highlights ── */}
            <div style={{ width: '100%', maxWidth: 920, padding: '56px 24px 32px' }}>
                <h2
                    style={{
                        textAlign: 'center',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: 32,
                        letterSpacing: '-0.02em',
                    }}
                >
                    What's included
                </h2>

                {/* For teachers */}
                <FeatureGroup label="For teachers" labelColor="#4f46e5" features={TEACHER_FEATURES} />

                {/* For students */}
                <FeatureGroup label="For students" labelColor="#0e7490" features={STUDENT_FEATURES} />
            </div>

            {/* ── Offline notice + privacy ── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '8px 16px',
                    marginBottom: 16,
                }}
            >
                <Shield size={13} style={{ color: '#475569' }} />
                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                    Your data never leaves your device in offline mode.
                </span>
                <Globe size={11} style={{ color: '#475569' }} />
                <a href="#/privacy" style={{ fontSize: '0.78rem', color: '#475569', textDecoration: 'underline' }}>
                    Privacy statement
                </a>
            </div>

            <p style={{ marginBottom: 48, fontSize: '0.72rem', color: '#475569', textAlign: 'center' }}>
                RubricMaker is open-source software for educators.
            </p>
        </main>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FeatureItem {
    icon: React.ElementType;
    title: string;
    desc: string;
    color: string;
}

function FeatureGroup({ label, labelColor, features }: { label: string; labelColor: string; features: FeatureItem[] }) {
    return (
        <div style={{ marginBottom: 24 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                }}
            >
                <span
                    style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        color: '#fff',
                        background: labelColor,
                        padding: '3px 10px',
                        borderRadius: 20,
                    }}
                >
                    {label}
                </span>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                }}
            >
                {features.map(({ icon: Icon, title, desc, color }) => (
                    <div
                        key={title}
                        style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            padding: '14px 16px',
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start',
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: `${color}18`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <Icon size={16} style={{ color }} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 2 }}>
                                {title}
                            </div>
                            <div style={{ fontSize: '0.79rem', color: '#475569', lineHeight: 1.5 }}>{desc}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface LoginCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    accentColor: string;
    accentBg: string;
    highlighted?: boolean;
    children: React.ReactNode;
}

function LoginCard({ icon, title, subtitle, accentColor, accentBg, highlighted, children }: LoginCardProps) {
    return (
        <div
            style={{
                background: '#fff',
                borderRadius: 16,
                padding: 24,
                boxShadow: highlighted
                    ? '0 8px 32px rgba(99,102,241,0.14), 0 2px 8px rgba(0,0,0,0.06)'
                    : '0 2px 12px rgba(0,0,0,0.06)',
                border: highlighted ? `2px solid ${accentColor}` : '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
            }}
        >
            {highlighted && (
                <div
                    style={{
                        position: 'absolute',
                        top: -1,
                        left: 24,
                        background: accentColor,
                        color: '#fff',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: '0 0 8px 8px',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                    }}
                >
                    Recommended
                </div>
            )}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: accentBg,
                    borderRadius: 10,
                    padding: '10px 14px',
                    marginBottom: 16,
                    marginTop: highlighted ? 8 : 0,
                }}
            >
                {icon}
                <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 1 }}>{subtitle}</div>
                </div>
            </div>
            {children}
        </div>
    );
}

interface AdvancedConfigProps {
    open: boolean;
    onToggle: () => void;
    dbUrl: string;
    setDbUrl: (v: string) => void;
    dbKey: string;
    setDbKey: (v: string) => void;
    configuring: boolean;
    configError: string;
    onConfigure: () => void;
}

function AdvancedConfig({
    open,
    onToggle,
    dbUrl,
    setDbUrl,
    dbKey,
    setDbKey,
    configuring,
    configError,
    onConfigure,
}: AdvancedConfigProps) {
    return (
        <div style={{ marginTop: 12 }}>
            <button
                onClick={onToggle}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '0.78rem',
                    padding: '4px 0',
                }}
            >
                {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Self-hosted / advanced
            </button>

            {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                        Run your own Supabase instance or use a custom project.{' '}
                        <a
                            href="https://supabase.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#64748b' }}
                        >
                            supabase.com <ExternalLink size={9} />
                        </a>
                    </p>
                    <input
                        type="text"
                        value={dbUrl}
                        onChange={(e) => setDbUrl(e.target.value)}
                        placeholder="https://your-project.supabase.co"
                        style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            fontSize: '0.82rem',
                        }}
                    />
                    <input
                        type="password"
                        value={dbKey}
                        onChange={(e) => setDbKey(e.target.value)}
                        placeholder="anon key (eyJhbGci…)"
                        autoComplete="off"
                        style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            fontSize: '0.82rem',
                        }}
                    />
                    {configError && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.78rem' }}>{configError}</p>}
                    <button
                        className="btn btn-secondary btn-sm"
                        disabled={configuring || !dbUrl || !dbKey}
                        onClick={onConfigure}
                    >
                        <Database size={13} />
                        {configuring ? 'Connecting…' : 'Use this Supabase instance'}
                    </button>
                </div>
            )}
        </div>
    );
}
