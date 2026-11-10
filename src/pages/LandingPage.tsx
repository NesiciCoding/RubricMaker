import React, { useState } from 'react';
import {
    Laptop,
    LogIn,
    GraduationCap,
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
    TrendingUp,
    Store,
    UserCheck,
    Download,
    Search,
    KeyRound,
    ListChecks,
    Mail,
    Newspaper,
    Route,
    Bell,
    ScanLine,
    Table2,
} from 'lucide-react';
import { usePlatform } from '../context/AppContext';
import { loadSupabaseConfig } from '../services/database/supabaseConfig';
import LoginButtons from '../components/auth/LoginButtons';
import { useTranslation } from 'react-i18next';

const TEACHER_FEATURES = [
    {
        icon: BookOpen,
        key: 'rubric_builder',
        title: 'Rubric Builder',
        desc: 'Design rubrics with custom criteria, weighted scoring, tick-off checklists of what each level looks like, tiered rubrics with a column per school level, CEFR descriptors, grammar standards, and version history.',
        color: '#3b82f6',
    },
    {
        icon: Layers,
        key: 'folders',
        title: 'Folders',
        desc: 'Sort rubrics, tests, essays and flashcard decks into nested folders.',
        color: '#0ea5e9',
    },
    {
        icon: Users,
        key: 'smart_grading',
        title: 'Smart Grading',
        desc: 'Grade quickly with a comment bank, voice dictation, keyboard shortcuts, anchored inline comments on submissions, audio feedback, and a card or grid view — plus side-by-side and group grading.',
        color: '#8b5cf6',
    },
    {
        icon: ScanLine,
        key: 'scan_handwritten_work',
        title: 'Scan handwritten work',
        desc: 'Photograph or import a handwritten answer while grading; the text is recognised on your device, you correct it, and it drops into your feedback — the image is used only for recognition and isn’t stored.',
        color: '#0ea5e9',
    },
    {
        icon: BarChart3,
        key: 'analytics_export',
        title: 'Analytics & Export',
        desc: 'Your dashboard opens with a student snapshot — CEFR, grammar, and vocabulary mastery plus a needs-attention flag for every student, colour-coded and filterable by class — follow progress across rubrics and tests, ask your own statistics questions, then export grades (with ready-made gradebook presets), report cards, essays, and assignment deadlines in the format that works for you. Rubric criteria get the same quality analysis as test questions, so you can see which descriptors are doing the work.',
        color: '#06b6d4',
    },
    {
        icon: Palette,
        key: 'theme_bundles',
        title: 'Theme bundles',
        desc: 'Six named themes (Academy, Nature, Midnight…) set accent colour, font, and export style in one click.',
        color: '#8b5cf6',
    },
    {
        icon: Languages,
        key: 'vocabulary_grammar',
        title: 'Vocabulary & Grammar',
        desc: 'See each class and student’s CEFR vocabulary range (A1–C2) and academic-word coverage from their analysed work, check whether a pasted or uploaded reading suits your class’s level, see flashcard progress across all your decks, spot criteria a student keeps losing points on across essays, auto-check linked grammar in scanned essays, and export or seed flashcard decks from word lists by level.',
        color: '#f59e0b',
    },
    {
        icon: Radio,
        key: 'live_monitoring',
        title: 'Live Monitoring',
        desc: 'Watch tests and essays as students work — who’s online, their progress, and live drafts, updated in real time.',
        color: '#ef4444',
    },
    {
        icon: ClipboardCheck,
        key: 'tests_quizzes',
        title: 'Tests & Quizzes',
        desc: 'Build multiple-choice, multiple-response, true/false, short-answer, open, fill-the-gap, matching, ordering, categorize, hot text, and audio-response tests with rich-text prompts, reading passages, and picture-choice options, preview the printed A4 page live while you build, assign them with a share link or Safe Exam Browser, then auto-grade, fine-tune the class average, and export a strong/weak point summary per student or class. Add an ungraded, retakeable Practice mode with audio questions for listening comprehension, or have students record a spoken answer for speaking practice. Save questions — or a whole reading/listening passage — to a reusable bank, then generate a new test automatically from bank criteria in one click. Auto-generate cloze gaps (fixed-ratio, C-test, grammar or vocabulary-targeted), check a passage against your class’s CEFR level with one-click pre-teaching decks, and turn a flashcard deck straight into test questions. Export a printable, CITO-style exam paper — question booklet, answer sheet, attachment, and grading sheet — as PDF or Word, then scan a student’s filled-in paper answer sheet back in for automatic marking.',
        color: '#3b82f6',
    },
    {
        icon: Table2,
        key: 'paper_test_score_sheet',
        title: 'Paper-Test Score Sheet',
        desc: 'Type in the points per question for a paper test in a spreadsheet-style grid and get grades from a percentage, N-term, pass mark or per-year norm table, plus P-values and reliability.',
        color: '#2563eb',
    },
    {
        icon: Route,
        key: 'placement_testing',
        title: 'Placement Testing',
        desc: 'Build a placement test with a branching-sections, staircase, or live generator engine that pulls questions from your bank on the fly — each student lands on the right difficulty and gets a provisional CEFR estimate, with a live level view and teacher adjustments while the test is in progress, ideal for sizing up new students at the start of the year.',
        color: '#10b981',
    },
    {
        icon: PenLine,
        key: 'essays',
        title: 'Essays',
        desc: 'Write a prompt, link a rubric, and assign it to a class from a dedicated Essays page — then track submissions, share links, and watch live progress — and see word, sentence, transition, readability and grammar-range stats for each essay while you grade.',
        color: '#6366f1',
    },
    {
        icon: TrendingUp,
        key: 'learning_paths',
        title: 'Learning Paths',
        desc: 'See which students need extra support, with rubric suggestions based on their CEFR progress compared to the class average, plus grammar practice suggestions for repeated low scores on grammar-linked criteria and questions.',
        color: '#10b981',
    },
    {
        icon: Store,
        key: 'marketplace',
        title: 'Marketplace',
        desc: 'Share your best rubrics, tests, and flashcard decks with colleagues at your school, and clone theirs.',
        color: '#3b82f6',
    },
    {
        icon: UserCheck,
        key: 'department_collaboration',
        title: 'Department Collaboration',
        desc: 'Share rubrics, tests and whole folders with your co-teachers or your whole school, send work for a second opinion, co-teach a class — grading it together with the same rubrics and tests — and assign ungraded work to colleagues.',
        color: '#f59e0b',
    },
    {
        icon: Download,
        key: 'install_as_an_app',
        title: 'Install as an App',
        desc: 'Add RubricMaker to your home screen or desktop for a faster, app-like launch — great for shared classroom devices, and works fully offline.',
        color: '#0ea5e9',
    },
    {
        icon: Search,
        key: 'quick_search',
        title: 'Quick Search',
        desc: "Press Ctrl/Cmd+K from anywhere to instantly find a rubric, test, student, class, or essay — filter by school year or VO track, or type a student's name with a rubric's name to jump straight to grading.",
        color: '#f59e0b',
    },
    {
        icon: Mail,
        key: 'student_messaging',
        title: 'Student Messaging',
        desc: 'Answer student questions about a rubric, test, or essay right from your Messages inbox — or reach out to a student yourself.',
        color: '#f59e0b',
    },
    {
        icon: Bell,
        key: 'notification_center',
        title: 'Notification Center',
        desc: 'One bell for overdue grading, unread messages, and pending moderation reviews, with a full filterable history and optional nightly email digests per category.',
        color: '#f59e0b',
    },
    {
        icon: Layers,
        key: 'vocabulary_grammar_flashcards',
        title: 'Vocabulary & Grammar Flashcards',
        desc: 'Build vocabulary or grammar flashcard decks by hand or import them from CSV, Excel, or Word — add pronunciation and part of speech per word — assign them to a class, and see which items each student should focus on.',
        color: '#8b5cf6',
    },
    {
        icon: Newspaper,
        key: 'news_flashes',
        title: 'News Flashes',
        desc: 'Curate an article, book, or video and share it with every student — with an optional link to a flashcard deck, test, or rubric.',
        color: '#8b5cf6',
    },
    {
        icon: Radio,
        key: 'live_writing',
        title: 'Live Writing',
        desc: 'Run a timed in-class writing session: students join with a short code, pick their name, and write — no accounts and no AI.',
        color: '#ec4899',
    },
];

const STUDENT_FEATURES = [
    {
        icon: Eye,
        key: 'view_feedback',
        title: 'View Feedback',
        desc: 'See your grades, teacher comments, the checklist points your teacher ticked, and attached files via your personal portal link — organised into Home, Assignments, Feedback, and Progress tabs, no login needed.',
        color: '#10b981',
    },
    {
        icon: FileText,
        key: 'submit_essays',
        title: 'Submit Essays',
        desc: 'Write in a distraction-free rich-text A4 editor with the prompt, word target, and a writing tip beside you — your draft autosaves and you submit with a code your teacher gives you. No account required.',
        color: '#f59e0b',
    },
    {
        icon: Star,
        key: 'self_assessment',
        title: 'Self-Assessment',
        desc: 'Rate yourself against CEFR Can-Do statements and track your language proficiency over time.',
        color: '#6366f1',
    },
    {
        icon: MessageSquare,
        key: 'peer_review',
        title: 'Peer Review',
        desc: "Leave structured feedback on a classmate's work using the same rubric your teacher uses.",
        color: '#8b5cf6',
    },
    {
        icon: ClipboardCheck,
        key: 'take_a_test',
        title: 'Take a Test',
        desc: 'Open a test link from your teacher, answer the questions with a countdown timer, flag any to revisit, and jump between them from a colour-coded question map, then submit — your answers save automatically as you go. Practice tests can be retaken and never affect your graded results. If your teacher has enabled the read-aloud accommodation for you, passages, questions and answer options can be read aloud in any test, including graded ones.',
        color: '#3b82f6',
    },
    {
        icon: KeyRound,
        key: 'student_portal_login',
        title: 'Student Portal Login',
        desc: 'If your school connects a database, you can sign in with your email and a password your teacher gives you — no confirmation email needed.',
        color: '#0ea5e9',
    },
    {
        icon: ListChecks,
        key: 'my_work_progress',
        title: 'My Work & Progress',
        desc: 'See every assigned essay and test in one to-do list — overdue, planned, and completed — plus a radar chart of your own scores across rubrics. Search your own work, grades, and flashcards right from the portal.',
        color: '#14b8a6',
    },
    {
        icon: Mail,
        key: 'ask_your_teacher',
        title: 'Ask Your Teacher',
        desc: 'Ask a question about a rubric grade, test, or essay right from your portal, and see the reply on your next visit.',
        color: '#f59e0b',
    },
    {
        icon: TrendingUp,
        key: 'grade_review_recommendations',
        title: 'Grade Review & Recommendations',
        desc: 'See a note in your portal if a grade is currently being double-checked by a colleague of your teacher, plus personalised rubric and grammar-practice suggestions based on your own progress.',
        color: '#6366f1',
    },
    {
        icon: Layers,
        key: 'study_flashcards',
        title: 'Study Flashcards',
        desc: 'Practice vocabulary decks from your teacher with smart spaced repetition — see the pronunciation on each card, track a progress bar, and watch hard words come back sooner. Make your own private decks too, and share one with your teacher in a tap.',
        color: '#8b5cf6',
    },
    {
        icon: Newspaper,
        key: 'news_flashes_2',
        title: 'News Flashes',
        desc: 'See a chronological timeline of articles, books, and videos your teacher shares — with an unread badge that clears once you open one.',
        color: '#8b5cf6',
    },
];

const TOP_TEACHER_KEYS = ['rubric_builder', 'smart_grading', 'tests_quizzes'];
const TOP_STUDENT_KEYS = ['view_feedback', 'submit_essays', 'take_a_test'];

export default function LandingPage() {
    const { t } = useTranslation();
    const { enterLocalMode } = usePlatform();

    const savedConfig = loadSupabaseConfig();
    const [supabaseReady] = useState(!!savedConfig);
    const [showCloudHint, setShowCloudHint] = useState(false);
    const [showAllFeatures, setShowAllFeatures] = useState(false);

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
                            color: '#4f46e5',
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
                        { icon: CheckCircle, label: 'Works offline' },
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
                    title={t('tooltips.landing_tryout_title')}
                    subtitle={t('tooltips.landing_tryout_sub')}
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

                {/* Teacher Login — deliberately not highlighted: Continue first, login second. */}
                <LoginCard
                    icon={<LogIn size={22} style={{ color: '#6366f1' }} />}
                    title={t('tooltips.landing_teacher_title')}
                    subtitle={t('tooltips.landing_teacher_sub')}
                    accentColor="#4f46e5"
                    accentBg="#eef2ff"
                >
                    <LoginButtons supabaseReady={supabaseReady} onNeedConfig={() => setShowCloudHint(true)} />
                    {showCloudHint && !supabaseReady && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                            {t('landing.cloud_not_configured', {
                                defaultValue:
                                    'Cloud sync is not configured on this device. Continue offline, or connect it later in Settings → Database.',
                            })}
                        </p>
                    )}
                </LoginCard>

                {/* Student */}
                <LoginCard
                    icon={<GraduationCap size={22} style={{ color: '#0891b2' }} />}
                    title={t('tooltips.landing_student_title')}
                    subtitle={t('tooltips.landing_student_sub')}
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
                    <LoginButtons supabaseReady={supabaseReady} onNeedConfig={() => setShowCloudHint(true)} />
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

                {/* For teachers — top 3 first, expand for all */}
                <FeatureGroup
                    label={t('landing.for_teachers', { defaultValue: 'For teachers' })}
                    labelColor="#4f46e5"
                    features={TEACHER_FEATURES}
                    topKeys={TOP_TEACHER_KEYS}
                    expanded={showAllFeatures}
                    onToggle={() => setShowAllFeatures((v) => !v)}
                    toggleLabel={t('landing.show_all_features', { defaultValue: 'Show all features' })}
                    toggleCollapseLabel={t('landing.show_fewer_features', { defaultValue: 'Show fewer' })}
                />

                {/* For students */}
                <FeatureGroup
                    label={t('landing.for_students', { defaultValue: 'For students' })}
                    labelColor="#0e7490"
                    features={STUDENT_FEATURES}
                    topKeys={TOP_STUDENT_KEYS}
                    expanded={showAllFeatures}
                    onToggle={() => setShowAllFeatures((v) => !v)}
                    toggleLabel={t('landing.show_all_features', { defaultValue: 'Show all features' })}
                    toggleCollapseLabel={t('landing.show_fewer_features', { defaultValue: 'Show fewer' })}
                />
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
    key: string;
    title: string;
    desc: string;
    color: string;
}

function FeatureGroup({
    label,
    labelColor,
    features,
    topKeys,
    expanded,
    onToggle,
    toggleLabel,
    toggleCollapseLabel,
}: {
    label: string;
    labelColor: string;
    features: FeatureItem[];
    topKeys?: string[];
    expanded?: boolean;
    onToggle?: () => void;
    toggleLabel?: string;
    toggleCollapseLabel?: string;
}) {
    const { t } = useTranslation();
    const visible = expanded || !topKeys ? features : features.filter((f) => topKeys.includes(f.key));
    const hiddenCount = features.length - visible.length;
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
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                    gap: 10,
                }}
            >
                {visible.map(({ icon: Icon, key, title, desc, color }) => (
                    <div
                        key={key}
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
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: 2 }}>
                                {t(`landing.features.${key}_title`, { defaultValue: title })}
                            </div>
                            <div
                                style={{
                                    fontSize: '0.79rem',
                                    color: '#475569',
                                    lineHeight: 1.5,
                                    display: '-webkit-box',
                                    WebkitLineClamp: expanded ? 'unset' : 4,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {t(`landing.features.${key}_desc`, { defaultValue: desc })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {onToggle && hiddenCount > 0 && (
                <button
                    onClick={onToggle}
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 12 }}
                    aria-expanded={!!expanded}
                >
                    {toggleLabel} ({hiddenCount})
                </button>
            )}
            {onToggle && expanded && topKeys && (
                <button onClick={onToggle} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
                    {toggleCollapseLabel}
                </button>
            )}
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

// F3: self-hosted Supabase config removed from landing — connect via Settings → Database.
