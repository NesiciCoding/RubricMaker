import React, { useState } from 'react';
import {
    BookOpen,
    Users,
    FileText,
    BarChart3,
    Download,
    GraduationCap,
    Database,
    Map,
    ChevronRight,
    CheckCircle,
    MessageSquare,
    Layers,
    Settings,
    Shield,
    Globe,
    Mic,
    PenLine,
    FileSearch,
    LayoutDashboard,
    ArrowRight,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'route-map' | 'getting-started' | 'rubrics' | 'grading' | 'cefr' | 'essays' | 'analytics' | 'data';

interface RouteNode {
    path: string;
    label: string;
    description: string;
    color: string;
    children?: RouteNode[];
    badge?: string;
}

// ── Route tree ─────────────────────────────────────────────────────────────────

const ROUTE_TREE: RouteNode[] = [
    {
        path: '/',
        label: 'Dashboard',
        description: 'Overview of rubrics, students, recent activity, and quick-start templates.',
        color: '#6366f1',
    },
    {
        path: '/rubrics',
        label: 'Rubrics',
        description: 'Browse, create, import and manage all rubrics.',
        color: '#3b82f6',
        children: [
            {
                path: '/rubrics/new',
                label: 'New Rubric',
                description: 'Create a rubric from scratch or a template.',
                color: '#3b82f6',
            },
            {
                path: '/rubrics/:id',
                label: 'Rubric Builder',
                description: 'Edit criteria, levels, CEFR descriptors, standards, and scoring mode.',
                color: '#3b82f6',
                children: [
                    {
                        path: '/rubrics/:rubricId/grade/:studentId',
                        label: 'Grade Student',
                        description: 'Interactive grading with comment bank, voice input, and file attachments.',
                        color: '#8b5cf6',
                    },
                    {
                        path: '/rubrics/:rubricId/peer-review/:studentId',
                        label: 'Peer Review',
                        description: 'Students review each other against the same rubric.',
                        color: '#8b5cf6',
                        badge: 'Student',
                    },
                    {
                        path: '/rubrics/:rubricId/self-assess/:studentId',
                        label: 'Self-Assessment',
                        description: 'Students self-assess against CEFR Can-Do statements.',
                        color: '#8b5cf6',
                        badge: 'Student',
                    },
                ],
            },
            {
                path: '/grade-comparative/:classId/:rubricId',
                label: 'Comparative Grading',
                description: 'Grade two students side-by-side for calibration and consistency.',
                color: '#06b6d4',
            },
        ],
    },
    {
        path: '/students',
        label: 'Students',
        description: 'Manage students and classes, view progress, configure VO tracks.',
        color: '#10b981',
        children: [
            {
                path: '/students/:id',
                label: 'Student Profile',
                description: 'Individual grades, CEFR levels, essays, and overdue tracking.',
                color: '#10b981',
                children: [
                    {
                        path: '/students/:id/cefr-overview',
                        label: 'CEFR Overview (Student)',
                        description: 'Per-student proficiency dashboard across all CEFR skills.',
                        color: '#10b981',
                    },
                ],
            },
        ],
    },
    {
        path: '/cefr-overview',
        label: 'CEFR Overview',
        description: 'Whole-class CEFR proficiency dashboard across Reading, Writing, Speaking, Listening.',
        color: '#f59e0b',
    },
    {
        path: '/speaking/:rubricId/:studentId',
        label: 'Speaking Session',
        description: 'Structured speaking assessments with six CEFR-aligned dimensions.',
        color: '#f59e0b',
    },
    {
        path: '/portal/:studentId',
        label: 'Student Portal',
        description: 'Students view feedback, submit essays, and complete self-assessments. No login required.',
        color: '#06b6d4',
        badge: 'Public',
    },
    {
        path: '/attachments',
        label: 'Attachments',
        description: 'Manage uploaded files; OCR and document analysis powered by Tesseract and Mammoth.',
        color: '#64748b',
    },
    {
        path: '/comments',
        label: 'Comment Bank',
        description: 'Reusable feedback snippets organised by tag, insertable during grading.',
        color: '#64748b',
    },
    {
        path: '/statistics',
        label: 'Statistics',
        description: 'Grade distributions, per-criterion performance, CEFR achievement rates.',
        color: '#64748b',
    },
    {
        path: '/export',
        label: 'Export',
        description: 'Export graded rubrics as PDF, DOCX (with mail-merge), or CSV.',
        color: '#64748b',
    },
    {
        path: '/settings',
        label: 'Settings',
        description: 'Theme, accent colour, grade scales, language, and backup/restore.',
        color: '#64748b',
    },
    {
        path: '/admin',
        label: 'Admin Panel',
        description: 'User roles, school management, database connection, integrations, data retention.',
        color: '#ef4444',
        badge: 'Admin only',
    },
    {
        path: '/privacy',
        label: 'Privacy Statement',
        description: 'Full privacy policy for the application.',
        color: '#94a3b8',
        badge: 'Public',
    },
];

// ── Docs sections ──────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'route-map', label: 'Route Map', icon: Map },
    { id: 'getting-started', label: 'Getting Started', icon: CheckCircle },
    { id: 'rubrics', label: 'Rubric Builder', icon: BookOpen },
    { id: 'grading', label: 'Grading', icon: PenLine },
    { id: 'cefr', label: 'CEFR & Speaking', icon: GraduationCap },
    { id: 'essays', label: 'Essay Writing', icon: FileText },
    { id: 'analytics', label: 'Analytics & Export', icon: BarChart3 },
    { id: 'data', label: 'Data Management', icon: Database },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function RouteCard({ node, depth = 0 }: { node: RouteNode; depth?: number }) {
    return (
        <div style={{ marginLeft: depth * 24 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    border: `1px solid var(--border)`,
                    borderLeft: `3px solid ${node.color}`,
                    marginBottom: 6,
                    position: 'relative',
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <code
                            style={{
                                fontSize: '0.78rem',
                                background: 'var(--bg-elevated)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                color: node.color,
                                fontWeight: 600,
                                flexShrink: 0,
                            }}
                        >
                            {node.path}
                        </code>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{node.label}</span>
                        {node.badge && (
                            <span
                                style={{
                                    fontSize: '0.68rem',
                                    padding: '1px 7px',
                                    borderRadius: 20,
                                    background: node.badge === 'Admin only' ? '#fee2e2' : node.badge === 'Student' ? '#d1fae5' : '#dbeafe',
                                    color: node.badge === 'Admin only' ? '#dc2626' : node.badge === 'Student' ? '#065f46' : '#1d4ed8',
                                    fontWeight: 600,
                                }}
                            >
                                {node.badge}
                            </span>
                        )}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {node.description}
                    </p>
                </div>
            </div>
            {node.children?.map((child) => (
                <div key={child.path} style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                    <div
                        style={{
                            width: 20,
                            borderLeft: '2px dashed var(--border)',
                            borderBottom: '2px dashed var(--border)',
                            marginLeft: 16,
                            marginTop: -2,
                            height: 24,
                            flexShrink: 0,
                            marginBottom: 0,
                        }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <RouteCard node={child} depth={0} />
                    </div>
                </div>
            ))}
        </div>
    );
}

interface StepProps {
    number: number;
    title: string;
    children: React.ReactNode;
}

function Step({ number, title, children }: StepProps) {
    return (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            <div
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    flexShrink: 0,
                    marginTop: 2,
                }}
            >
                {number}
            </div>
            <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>{children}</div>
            </div>
        </div>
    );
}

interface FeatureSectionProps {
    icon: React.ElementType;
    title: string;
    color: string;
    children: React.ReactNode;
}

function FeatureSection({ icon: Icon, title, color, children }: FeatureSectionProps) {
    return (
        <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `${color}18`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <Icon size={18} style={{ color }} />
                </div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
            </div>
            {children}
        </div>
    );
}

function FeatureList({ items }: { items: string[] }) {
    return (
        <ul style={{ margin: '0 0 16px', paddingLeft: 20 }}>
            {items.map((item, i) => (
                <li key={i} style={{ marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {item}
                </li>
            ))}
        </ul>
    );
}

function InfoBox({ children, color = 'var(--accent)' }: { children: React.ReactNode; color?: string }) {
    return (
        <div
            style={{
                background: `${color}12`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: '0.88rem',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
            }}
        >
            {children}
        </div>
    );
}

// ── Tab content ────────────────────────────────────────────────────────────────

function RouteMapTab() {
    return (
        <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem', lineHeight: 1.6 }}>
                All application routes and their parent-child relationships. Routes marked{' '}
                <strong style={{ color: '#1d4ed8' }}>Public</strong> are accessible without logging in.
                Routes marked <strong style={{ color: '#dc2626' }}>Admin only</strong> require the admin role.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ROUTE_TREE.map((node) => (
                    <RouteCard key={node.path} node={node} />
                ))}
            </div>
        </div>
    );
}

function GettingStartedTab() {
    return (
        <div>
            <FeatureSection icon={CheckCircle} title="Quick Start" color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>
                    RubricMaker works entirely offline — all data lives in your browser. No account is needed. You can
                    optionally connect a Supabase database later for multi-device sync.
                </p>
                <Step number={1} title="Choose your mode">
                    On the landing page, click <strong>Continue without account</strong> to use the app offline, or{' '}
                    <strong>Teacher Login</strong> to connect a cloud database. You can always add cloud sync later from
                    Settings.
                </Step>
                <Step number={2} title="Create your first rubric">
                    Go to <strong>Rubrics → New Rubric</strong>. Pick a quick-start template or start from scratch. Give
                    it a name, subject, and description. Add criteria and levels, then click{' '}
                    <strong>Save</strong>.
                </Step>
                <Step number={3} title="Add students">
                    Go to <strong>Students</strong>. Click <strong>+ Add Student</strong> and fill in their name. Group
                    students into classes by setting the Class field. You can also import from a CSV or Magister.
                </Step>
                <Step number={4} title="Grade a student">
                    Open any rubric from the Rubrics page. Click the student's name to open the grading view. Click each
                    criterion level, add comments, attach files, and click <strong>Save &amp; Next</strong>.
                </Step>
                <Step number={5} title="Share feedback">
                    Each student has a unique portal link (shown in their profile). Share it so they can view grades,
                    submit essays, and complete self-assessments — no login required on their end.
                </Step>

                <InfoBox>
                    <strong>Guided tour:</strong> A built-in Joyride walkthrough runs the first time you log in. You can
                    restart it at any time from <strong>Settings → Guided tour</strong>.
                </InfoBox>
            </FeatureSection>

            <FeatureSection icon={Layers} title="Modes of operation" color="#6366f1">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    {[
                        {
                            title: 'Offline / Local',
                            desc: 'All data in browser localStorage. Nothing sent to a server. Works on any static host.',
                            color: '#64748b',
                        },
                        {
                            title: 'Cloud sync',
                            desc: 'Connect a Supabase project (self-hosted or supabase.com) for multi-device access and sharing.',
                            color: '#6366f1',
                        },
                        {
                            title: 'Docker (full stack)',
                            desc: 'docker-compose up spins up the frontend + Supabase + Caddy (HTTPS). Recommended for schools.',
                            color: '#0891b2',
                        },
                    ].map((m) => (
                        <div
                            key={m.title}
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderLeft: `3px solid ${m.color}`,
                                borderRadius: 8,
                                padding: '12px 14px',
                            }}
                        >
                            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.9rem', color: 'var(--text)' }}>
                                {m.title}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                {m.desc}
                            </div>
                        </div>
                    ))}
                </div>
            </FeatureSection>
        </div>
    );
}

function RubricsTab() {
    return (
        <div>
            <FeatureSection icon={BookOpen} title="Rubric Builder" color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    The Rubric Builder is the core of RubricMaker. Open any rubric from the Rubrics list, or create a
                    new one, to enter the builder.
                </p>
                <InfoBox>
                    Switch between <strong>Form view</strong> (detailed editing) and <strong>Designer view</strong>{' '}
                    (table layout) at any time using the toggle in the toolbar.
                </InfoBox>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Scoring modes
                </h3>
                <FeatureList
                    items={[
                        'Total Points — raw score from all criteria levels.',
                        'Weighted Percentage — each criterion has a weight (%). Final score is the weighted average.',
                        'Single-Point Rubric — one level per criterion (meets / does not meet); pass/fail logic.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Level options
                </h3>
                <FeatureList
                    items={[
                        'Sub-item checklists within a level (students must complete specific items).',
                        'Point ranges — set a min and max; teacher picks a value inside the range during grading.',
                        'Score modifiers — apply %, point, or level adjustments with an optional reason.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Standards & framework links
                </h3>
                <FeatureList
                    items={[
                        'CEFR Can-Do descriptors — attach specific descriptors per criterion.',
                        'IB Learner Profile attributes and Bloom\'s Taxonomy levels.',
                        'CCSS, NGSS, and state standards via the Common Standards Project API.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Version history
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Every save creates an automatic snapshot. Click <strong>Version History</strong> in the toolbar to
                    browse past versions and restore any of them. Manual labels can be added before saving.
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Save as Template
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Use the <strong>Save as Template</strong> button to store the current rubric as a reusable template.
                    Your saved templates appear under <em>My Templates</em> when creating a new rubric on the Dashboard.
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Import & export
                </h3>
                <FeatureList
                    items={[
                        'Import: upload a JSON file exported from another RubricMaker instance, or paste a share code.',
                        'Export: PDF rubric document, DOCX, or raw JSON for backup.',
                        'Share code: a compact base64 code you can send to a colleague who can import it in one click.',
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

function GradingTab() {
    return (
        <div>
            <FeatureSection icon={PenLine} title="Grading interface" color="#8b5cf6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Open a rubric from the Rubrics list, then click a student's name to enter the grading view. Use{' '}
                    <strong>Save &amp; Next</strong> to move through your class efficiently.
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Scoring
                </h3>
                <FeatureList
                    items={[
                        'Click any level cell to select it. Click again to deselect.',
                        'For point ranges, use the slider to choose a value within the allowed range.',
                        'Toggle sub-items inside a level with checkboxes.',
                        'Apply score modifiers (% bonus, point deduction, level adjustment) with a reason.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Feedback tools
                </h3>
                <FeatureList
                    items={[
                        'Comment Bank — insert reusable snippets by tag. Build the bank from the Comment Bank page.',
                        'Voice grading — dictate comments hands-free using the browser\'s speech recognition API.',
                        'Per-criterion notes in addition to the overall feedback field.',
                        'File attachments — upload evidence files (images, PDFs) per graded rubric.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Comparative grading
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    Click <strong>Compare</strong> on the Rubrics list to open the side-by-side grading view. Grade two
                    students at once for calibration and anchor-based grading. The interface adaptively suggests level
                    adjustments when there is a mismatch between students' scores.
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Peer review &amp; self-assessment
                </h3>
                <FeatureList
                    items={[
                        'Peer Review — share a URL with a student to review a classmate\'s work.',
                        'Self-Assessment — students rate themselves against CEFR Can-Do statements. Results are stored alongside teacher scores.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={MessageSquare} title="Comment Bank" color="#06b6d4">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Go to <strong>Comment Bank</strong> in the sidebar to manage your snippets. Organise them with tags
                    (e.g. "writing", "grammar", "effort"). During grading, click the comment icon to open the bank
                    and insert any snippet into the feedback field with one click.
                </p>
            </FeatureSection>
        </div>
    );
}

function CefrTab() {
    return (
        <div>
            <FeatureSection icon={GraduationCap} title="CEFR Overview" color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    The CEFR (Common European Framework of Reference) module tracks language proficiency across Reading,
                    Writing, Speaking, and Listening — aligned to Dutch VO targets (VMBO-BB through VWO).
                </p>
                <FeatureList
                    items={[
                        'Whole-class overview (/cefr-overview) — heatmap of all students across CEFR levels per skill.',
                        'Per-student overview — timeline of assessed levels, self-assessment scores alongside teacher scores.',
                        'Progress tracking — see which students are on-track, ahead, or behind their VO target level.',
                    ]}
                />
                <InfoBox color="#f59e0b">
                    CEFR levels are computed from rubric scores when CEFR descriptors are linked to criteria. They are
                    also updated by speaking sessions and self-assessments.
                </InfoBox>
            </FeatureSection>

            <FeatureSection icon={Mic} title="Speaking Sessions" color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Start a speaking session from either of two entry points:
                </p>
                <FeatureList
                    items={[
                        'Student Profile → "Speaking Session" button in the top bar. With one rubric it navigates directly; with multiple rubrics a dropdown lets you pick.',
                        'Rubrics → find a rubric card → "Speaking…" dropdown at the bottom — select a student to jump straight into the session.',
                        'Past sessions appear in a "Speaking Sessions" card on the Student Profile, each with a link to reopen and extend it.',
                        'Inside the session: set a timer, mark pronunciation quick-marks (word stress, th-sound, etc.), score the linked rubric criteria, and add an overall comment.',
                        'Results are saved to the student\'s CEFR history and are visible on the CEFR Overview heatmap.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Globe} title="Student Self-Assessment" color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Students access self-assessment via their portal link or a direct URL. They rate themselves against
                    the Can-Do descriptors attached to a rubric's criteria. Their ratings and reflection text are stored
                    alongside the teacher's scores and are visible on the Student Profile and CEFR Overview pages.
                </p>
            </FeatureSection>
        </div>
    );
}

function EssaysTab() {
    return (
        <div>
            <FeatureSection icon={FileText} title="Essay assignments" color="#6366f1">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Create essay prompts from the Dashboard or a rubric. Optionally link a rubric to auto-grade
                    submissions.
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Creating an assignment
                </h3>
                <FeatureList
                    items={[
                        'Set a title, prompt, optional word count (min/max), and time limit.',
                        'Enable "Read-only after submit" to lock essays once submitted.',
                        'Link a rubric for structured feedback after grading.',
                        'Generate a submission code — share it with students so they can submit without accounts.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Rich text editor (A4 page mode)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    Students write in a TipTap-powered editor with a full formatting toolbar: bold, italic, headings,
                    lists, tables, text colour, highlight, superscript, and more. Toggle{' '}
                    <strong>Page view</strong> in the toolbar to switch to an A4-sized paper layout with realistic
                    margins — ideal for essay writing practice.
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Document analysis
                </h3>
                <FeatureList
                    items={[
                        'Upload a DOCX or PDF to import text into the editor.',
                        'OCR via Tesseract.js for scanned images or PDFs.',
                        'Vocabulary and grammar checking via LanguageTool integration.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={FileSearch} title="Submission flow" color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Students visit the essay URL or enter the submission code in the Student Portal. After an optional
                    email verification gate, they write and submit. Drafts are auto-saved to localStorage every few
                    seconds. After submission, teachers see the text in the student's profile and can grade against
                    the linked rubric.
                </p>
            </FeatureSection>
        </div>
    );
}

function AnalyticsTab() {
    return (
        <div>
            <FeatureSection icon={BarChart3} title="Statistics dashboard" color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Go to <strong>Statistics</strong> in the sidebar. Filter by class and rubric.
                </p>
                <FeatureList
                    items={[
                        'Summary cards: Average, Median, Highest, and Lowest scores.',
                        'Grade distribution bar chart — see how many students fall in each grade band.',
                        'Per-criterion breakdown — which criteria students find hardest.',
                        'CEFR achievement rates — percentage of students at each level per skill.',
                        'Learning goal progress tracking across a class.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Download} title="Export options" color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Go to <strong>Export</strong> in the sidebar. Choose your format and scope.
                </p>
                <FeatureList
                    items={[
                        'PDF — individual student reports or bulk class export in one PDF.',
                        'DOCX — raw export or mail-merge template with field substitution ({{student_name}}, {{score}}, etc.).',
                        'CSV — raw grade data for Excel or your school\'s gradebook.',
                        'Period report — aggregated CEFR progress report for a class over a date range.',
                    ]}
                />
                <InfoBox color="#10b981">
                    Mail-merge DOCX templates support custom fields. Upload a .docx file with placeholder fields and
                    the app will substitute them with student data.
                </InfoBox>
            </FeatureSection>
        </div>
    );
}

function DataTab() {
    return (
        <div>
            <FeatureSection icon={Database} title="Data management" color="#6366f1">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    All data lives in localStorage by default. Supabase sync is optional.
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Backup &amp; restore
                </h3>
                <FeatureList
                    items={[
                        'Export entire dataset to a single JSON file from Settings.',
                        'Restore from any prior backup JSON — replaces all current data.',
                        'Docker deployments: use scripts/backup.sh and scripts/restore.sh for server-side backups.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Supabase sync
                </h3>
                <FeatureList
                    items={[
                        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sync.',
                        'LocalStorage stays the source of truth; Supabase is a sync layer.',
                        'Multi-teacher collaboration: share rubrics between accounts in the same Supabase project.',
                        'Email OTP login — optional; requires SMTP configuration in Docker.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Shield} title="Admin panel" color="#ef4444">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    Accessible at <code>/admin</code> for users with the <strong>admin</strong> role.
                </p>
                <FeatureList
                    items={[
                        'Users tab — assign roles (admin, teacher, student), invite colleagues.',
                        'Schools tab — manage school names and branding.',
                        'Database tab — configure Supabase connection, push/pull data, manage sharing.',
                        'Integrations tab — Standards API key, Cambridge Dictionary API key.',
                        'Data tab — anonymise student data, bulk delete, compliance tools.',
                        'Retention tab — set automatic data retention policies.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Settings} title="Settings" color="#64748b">
                <FeatureList
                    items={[
                        'Theme — dark / light, accent colour picker.',
                        'Grade scales — create custom scales (1–10, A–F, etc.) and set a default.',
                        'Language — English, Dutch, French, German, Spanish.',
                        'Guided tour — restart the onboarding walkthrough.',
                        'Backup / restore — download or upload the full dataset JSON.',
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

const TAB_CONTENT: Record<TabId, React.ReactNode> = {
    'route-map': <RouteMapTab />,
    'getting-started': <GettingStartedTab />,
    rubrics: <RubricsTab />,
    grading: <GradingTab />,
    cefr: <CefrTab />,
    essays: <EssaysTab />,
    analytics: <AnalyticsTab />,
    data: <DataTab />,
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DocsPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TabId>('getting-started');

    return (
        <>
            <Topbar title={t('navigation.docs')} />
            <div className="page-content fade-in">
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '200px 1fr',
                        gap: 24,
                        alignItems: 'start',
                    }}
                >
                    {/* ── Left nav ── */}
                    <nav
                        style={{
                            position: 'sticky',
                            top: 16,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            overflow: 'hidden',
                        }}
                    >
                        <div
                            style={{
                                padding: '12px 14px',
                                borderBottom: '1px solid var(--border)',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: 'var(--text-dim)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            Documentation
                        </div>
                        {TABS.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    width: '100%',
                                    padding: '9px 14px',
                                    background: activeTab === id ? 'var(--accent-soft)' : 'transparent',
                                    color: activeTab === id ? 'var(--accent)' : 'var(--text-muted)',
                                    border: 'none',
                                    borderLeft: `3px solid ${activeTab === id ? 'var(--accent)' : 'transparent'}`,
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: activeTab === id ? 600 : 400,
                                    textAlign: 'left',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Icon size={14} />
                                {label}
                            </button>
                        ))}
                    </nav>

                    {/* ── Content ── */}
                    <div
                        className="card"
                        style={{ minHeight: 600 }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                            <LayoutDashboard size={14} style={{ color: 'var(--text-dim)' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Docs</span>
                            <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>
                                {TABS.find((t) => t.id === activeTab)?.label}
                            </span>
                        </div>
                        {TAB_CONTENT[activeTab]}
                    </div>
                </div>
            </div>
        </>
    );
}
