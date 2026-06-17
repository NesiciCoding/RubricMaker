import React, { useState } from 'react';
import {
    BookOpen,
    FileText,
    BarChart3,
    Download,
    GraduationCap,
    Database,
    Map,
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
    Award,
    Languages,
    ClipboardCheck,
    Radio,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

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
                        path: '/peer-analytics/:rubricId',
                        label: 'Peer Review Analytics',
                        description:
                            'Consistency scoring of peer reviews against the teacher baseline, feedback heatmaps, and reviewer trends.',
                        color: '#8b5cf6',
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
        path: '/tests',
        label: 'Tests',
        description: 'Browse, create, and manage tests and quizzes for assignment to students.',
        color: '#3b82f6',
        children: [
            {
                path: '/tests/new',
                label: 'New Test',
                description:
                    'Create a test from scratch with multiple-choice, multiple-response, true/false, short-answer, open, fill-the-gap, matching, ordering, categorize, and hot text questions.',
                color: '#3b82f6',
            },
            {
                path: '/tests/:id',
                label: 'Test Builder',
                description:
                    'Edit test settings (duration, shuffle, Safe Exam Browser requirement, grade scale) and questions, including standards and CEFR linking.',
                color: '#3b82f6',
            },
            {
                path: '/tests/:testId/results/:studentTestId',
                label: 'Test Results',
                description:
                    "Review a student's submission: auto-scored answers, manual grading for open questions, grade mapping, standards/CEFR breakdowns, and a session integrity panel.",
                color: '#3b82f6',
            },
            {
                path: '/tests/:testId/monitor',
                label: 'Live Test Monitor',
                description:
                    'Watch a running test in real time: who is online, their progress on each question, and proctoring signals (tab switches, copy/paste, battery, Safe Exam Browser status).',
                color: '#3b82f6',
            },
        ],
    },
    {
        path: '/essays',
        label: 'Essays',
        description: 'Browse, create, and manage essay assignments for your classes.',
        color: '#6366f1',
        children: [
            {
                path: '/essays/new',
                label: 'New Essay',
                description: 'Write a prompt, link a rubric, and assign it to students in a class.',
                color: '#6366f1',
            },
            {
                path: '/essays/:teacherKey',
                label: 'Essay Builder',
                description:
                    'Edit the prompt, rubric link, and settings; manage assigned students, copy share links, and import submission codes.',
                color: '#6366f1',
                children: [
                    {
                        path: '/essays/:teacherKey/monitor',
                        label: 'Live Essay Monitor',
                        description:
                            'Watch students write in real time: presence, live word counts, last-activity timestamps, and an expandable draft preview.',
                        color: '#8b5cf6',
                    },
                ],
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
        path: '/vocabulary',
        label: 'Vocabulary Profile',
        description:
            'CEFR vocabulary distribution (A1–C2) per class and student, derived from document analysis, with CSV export of vocabulary lists by band.',
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
        path: '/test/:code',
        label: 'Take a Test',
        description:
            'Students open a shared link to take a test — answer questions, optional countdown timer, and submit. No login required.',
        color: '#06b6d4',
        badge: 'Student',
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
        description: 'Grade distributions, per-criterion performance, class comparison, and trend analysis.',
        color: '#64748b',
    },
    {
        path: '/activity-dashboard',
        label: 'Activity Dashboard',
        description: 'Grid of all rubrics, tests, and essays vs classes — link, assign, and monitor coverage at a glance.',
        color: '#0ea5e9',
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

function getTabs(t: TFunction): { id: TabId; label: string; icon: React.ElementType }[] {
    return [
        { id: 'route-map', label: t('docs.tab_route_map'), icon: Map },
        { id: 'getting-started', label: t('docs.tab_getting_started'), icon: CheckCircle },
        { id: 'rubrics', label: t('docs.tab_rubrics'), icon: BookOpen },
        { id: 'grading', label: t('docs.tab_grading'), icon: PenLine },
        { id: 'cefr', label: t('docs.tab_cefr'), icon: GraduationCap },
        { id: 'essays', label: t('docs.tab_essays'), icon: FileText },
        { id: 'analytics', label: t('docs.tab_analytics'), icon: BarChart3 },
        { id: 'data', label: t('docs.tab_data'), icon: Database },
    ];
}

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
                                    background:
                                        node.badge === 'Admin only'
                                            ? '#fee2e2'
                                            : node.badge === 'Student'
                                              ? '#d1fae5'
                                              : '#dbeafe',
                                    color:
                                        node.badge === 'Admin only'
                                            ? '#dc2626'
                                            : node.badge === 'Student'
                                              ? '#065f46'
                                              : '#1d4ed8',
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
                <li
                    key={i}
                    style={{ marginBottom: 6, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}
                >
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
                <strong style={{ color: '#1d4ed8' }}>Public</strong> are accessible without logging in. Routes marked{' '}
                <strong style={{ color: '#dc2626' }}>Admin only</strong> require the admin role.
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
                    it a name, subject, and description. Add criteria and levels, then click <strong>Save</strong>.
                </Step>
                <Step number={3} title="Add students">
                    Go to <strong>Students</strong>. Click <strong>+ Add Student</strong> and fill in their name. Group
                    students into classes by setting the Class field. You can also import from a CSV or a Magister
                    export — the importer auto-detects Dutch column names and, if "Update existing students" is checked,
                    will update matching records instead of creating duplicates.
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

            <FeatureSection icon={Settings} title="Themes & appearance" color="#ec4899">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 12 }}>
                    Personalise the look of the app and your exported rubrics from <strong>Settings → General</strong>.
                </p>
                <FeatureList
                    items={[
                        'Accent color — pick a custom hex color or one of 8 preset swatches.',
                        'Interface font — choose the typeface used throughout the app (Inter, Nunito, Source Sans 3, Lato, Roboto).',
                        'Theme bundles — Academy, Nature, Midnight, Warm, Slate, and Rose apply a matching accent color, interface font, and rubric header color in one click.',
                        'Rubric export font — in the Rubric Builder formatting panel, choose the font used for headings in PDF and Word exports, including decorative options like Playfair Display, Oswald, Bebas Neue, Special Elite, and Courier Prime.',
                    ]}
                />
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
                        "IB Learner Profile attributes and Bloom's Taxonomy levels.",
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

            <FeatureSection icon={ClipboardCheck} title="Tests & quizzes" color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Build tests and quizzes from the <strong>Tests</strong> page. Add multiple-choice, multiple-response
                    (select all that apply), true/false, short-answer, open, fill-the-gap, matching, ordering,
                    categorize, and hot text questions, set a duration and grade scale, and optionally require Safe Exam
                    Browser. Link standards and CEFR descriptors per question, then assign the test to a class — each
                    student gets a unique share link to complete it. Every question type has a small{' '}
                    <strong>{'{?}'}</strong> help button for both you and your students explaining how to author and
                    answer it.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>Fill-the-gap questions</strong> use <code>{'{{...}}'}</code> markers in the question text.
                    Write <code>{'{{Paris}}'}</code> to create a blank that students type into — add alternative correct
                    spellings separated by a pipe, e.g. <code>{'{{Paris|City of Paris}}'}</code>. For a dropdown instead
                    of free text, choose the <strong>Fill the gap (dropdown)</strong> type and list the correct answer
                    first, e.g. <code>{'{{Paris|London|Berlin}}'}</code> — students see the options in a shuffled order.
                    The builder's "Insert gap" / "Insert dropdown gap" buttons add the markers for you, and a preview
                    shows the parsed gaps and their correct answers.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>Matching, ordering, and categorize questions</strong> let students work with several related
                    items at once. For <strong>matching</strong>, enter left/right pairs — students see the left items
                    in order and pick a matching right item from a dropdown for each. For
                    <strong> ordering</strong>, enter the items in their correct order using the up/down arrows —
                    students see them shuffled and reorder them with arrows. For <strong>categorize</strong>, define
                    categories and assign each item to the category it belongs to — students sort each item into a
                    category via a dropdown. All three support an <strong>Allow partial credit</strong> toggle, which
                    awards points proportionally for each correct pair, position, or item instead of all-or-nothing.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>Hot text questions</strong> ask students to click selectable words or phrases within a
                    passage. Write the passage and wrap each selectable fragment in double square brackets, e.g.{' '}
                    <code>{'The capital of [[France]] is [[Paris]].'}</code> — the "Insert selectable fragment" button
                    wraps your current text selection for you. Below the passage, use the checkmarks to mark which
                    fragments students should select. Students click highlighted fragments to toggle them on or off.
                    <strong> Allow partial credit</strong> awards points per fragment instead of all-or-nothing.
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    What students see
                </h3>
                <FeatureList
                    items={[
                        'If the test requires Safe Exam Browser, students see a blocking screen until they open the link inside SEB.',
                        'A countdown timer (when set) shows time remaining and auto-submits the test when it reaches zero.',
                        'Answers are autosaved to the device as the student works, so a reload or browser crash restores their progress.',
                        'Submitting produces a confirmation and, when no cloud sync is configured, a submission code for the student to send to their teacher.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Radio} title="Live monitoring" color="#ef4444">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    While a test or essay is in progress, click <strong>Monitor</strong> (from the Tests page for a
                    test, or from the assignment dialog for an essay) to open a live view of the session. This requires
                    cloud sync to be enabled — without it, the page explains that you can review progress after the fact
                    from each student's saved answers or draft instead.
                </p>
                <FeatureList
                    items={[
                        'Presence — a coloured dot shows whether each student is active, idle, or disconnected, based on how recently their browser checked in.',
                        'Response grid (tests) — a students-by-questions matrix, colour-coded as students answer. Click a question header to open a gallery of every answer to that question.',
                        'Live draft preview (essays) — a card per student with a live word count, last-activity timestamp, and an expandable preview of what they are currently writing.',
                        'Hide names — toggle to anonymise the view, useful when sharing your screen.',
                        'Proctoring flags — counts of tab switches, copy/paste/cut, battery level, and Safe Exam Browser status. These are advisory signals only: a determined student can spoof them, so use them to prompt a conversation, not as definitive proof.',
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
                        "Voice grading — dictate comments hands-free using the browser's speech recognition API.",
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
                        "Peer Review — share a URL with a student to review a classmate's work.",
                        'Self-Assessment — students rate themselves against CEFR Can-Do statements. Results are stored alongside teacher scores.',
                        'Peer Review Analytics (/peer-analytics/:rubricId) — open from the Peer Review screen to see consistency scores comparing peer grades to your baseline, a feedback heatmap of which criteria get the most comments, and round-over-round trends. Reviews are matched to reviewers via their student ID; older records without one are shown as "Anonymous reviewer".',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={MessageSquare} title="Comment Bank" color="#06b6d4">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Go to <strong>Comment Bank</strong> in the sidebar to manage your snippets. Organise them with tags
                    (e.g. "writing", "grammar", "effort"). During grading, click the comment icon to open the bank and
                    insert any snippet into the feedback field with one click.
                </p>
            </FeatureSection>

            <FeatureSection icon={ClipboardCheck} title="Test results &amp; grading" color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    From the <strong>Tests</strong> list, click <strong>Results</strong> on a test to see every
                    student's submission and open results at <code>/tests/:testId/results/:studentTestId</code>.
                </p>
                <FeatureList
                    items={[
                        'Multiple-choice and exact-match short-answer questions are auto-scored and marked correct/incorrect.',
                        "Open questions (and short-answer questions without a model answer) get a manual points input — clamped to the question's max — plus a feedback field.",
                        "Total points, percentage, and a letter/scale grade (from the test's grade scale) are shown at the top of the page.",
                        'Standards and CEFR breakdowns roll up points earned per linked standard or Can-Do descriptor, mirroring the Learning Goals view.',
                        'A "Session integrity" panel summarises proctoring events (tab switches, copy/paste, battery, SEB status) captured while the student took the test.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Class average adjustment
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Open <strong>Results</strong> on a test to see the Class average adjustment tool. Enter a target
                    average percentage, preview how each student's points and percentage would change with a uniform
                    point adjustment, then <strong>Apply adjustment</strong>. Raw answer scores are never overwritten —
                    the adjustment is stored separately and is fully reversible with <strong>Revert adjustment</strong>,
                    and the audit trail records when it was applied.
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Importing offline submissions
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    If a student submits a test as a code instead of online (e.g. when offline), click{' '}
                    <strong>Import submission code</strong> on the Tests list, paste the code, and the submission is
                    created or updated automatically — ready for grading and results.
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
                        "Results are saved to the student's CEFR history and are visible on the CEFR Overview heatmap.",
                        'Record audio (and, with cloud sync enabled, video) directly inside the session — recordings are saved with the session and play back from the "Portfolio" tab on the Student Profile.',
                    ]}
                />
                <InfoBox color="#f59e0b">
                    Recordings are privacy-first: without cloud sync configured, audio recording is available but files
                    stay only in this browser's storage (cleared if the user clears browsing data); video recording is
                    disabled in that case. With cloud sync enabled, both audio and video recordings sync to the
                    teacher's private storage. A single recording is capped at 50MB.
                </InfoBox>
            </FeatureSection>

            <FeatureSection icon={Globe} title="Student Self-Assessment" color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Students access self-assessment via their portal link or a direct URL. They rate themselves against
                    the Can-Do descriptors attached to a rubric's criteria. Their ratings and reflection text are stored
                    alongside the teacher's scores and are visible on the Student Profile and CEFR Overview pages.
                </p>
            </FeatureSection>

            <FeatureSection icon={Award} title="Cambridge English Exam Labels" color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Enable "Show Cambridge exam labels" in Settings → General to display the Cambridge English
                    Qualification that maps to each CEFR level (A2 Key, B1 Preliminary, B2 First, C1 Advanced, C2
                    Proficiency) as a subtle secondary label next to CEFR badges on the Student CEFR Overview and
                    Student Profile pages. A1 has no main-suite Cambridge exam, so no label is shown for it.
                </p>
                <FeatureList
                    items={[
                        'Rubric Builder vocabulary panel — when a Cambridge Dictionary API key is set in Admin → Integrations, each word gets a "Look up" button that fetches its CEFR level and definition.',
                        'Lookups only fill in empty CEFR level / definition fields and never overwrite values you already entered.',
                        'Without an API key, the lookup button is hidden and the app continues to work fully offline using the bundled CEFR-J vocabulary data.',
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

function EssaysTab() {
    return (
        <div>
            <FeatureSection icon={FileText} title="Essays workspace" color="#6366f1">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    The <strong>Essays</strong> section in the sidebar is the dedicated home for essay assignments —
                    separate from the Rubrics page. It lists every essay you have created, grouped by assignment, with
                    the linked rubric, the number of assigned students, and how many have submitted.
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Creating an essay
                </h3>
                <FeatureList
                    items={[
                        'Click "New Essay" to open the builder: write the title and prompt, set optional word count limits (min/max), a time limit, and a deadline.',
                        'Use the rubric connector to link a rubric for structured feedback after grading.',
                        'Enable "Read-only after submit" to lock essays once submitted.',
                        'Enable "Require Safe Exam Browser (SEB)" to lock the assignment to the SEB app — download the .seb config from the assignment dialog to distribute to students.',
                        'Click "Assign to students" to pick a class — each selected student gets their own share link and submission code.',
                        'Once assigned, the builder lists every student with their submission status and a per-student "Copy link" button.',
                        'Use "Import submission code" to add a student\'s completed essay (pasted code) when no database connection is configured.',
                        'Click "Monitor" to open the live essay monitor for the assignment.',
                        'Save configuration — click "Save configuration" in the assignment dialog footer to store the title, prompt, limits, and deadline locally for this rubric. The form auto-fills from the saved configuration the next time you open the assignment dialog, so you can prepare assignments in advance and only share links when you are ready.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Rich text editor (A4 page mode)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    Students write in a TipTap-powered editor with a full formatting toolbar: bold, italic, headings,
                    lists, tables, text colour, highlight, superscript, and more. Toggle <strong>Page view</strong> in
                    the toolbar to switch to an A4-sized paper layout with realistic margins — ideal for essay writing
                    practice.
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
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Students visit the essay URL or enter the submission code in the Student Portal. After an optional
                    email verification gate, they write and submit. Drafts are auto-saved to localStorage every few
                    seconds. After submission, teachers open the linked rubric's grading view and click{' '}
                    <strong>Import Essay</strong> to pull the submission from the database (or paste the student's
                    submission code if no database is connected) — the essay text is then added as an attachment,
                    visible in both the normal and comparative grading views.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    If an assignment requires Safe Exam Browser and the student opens the link outside of SEB,
                    submission is blocked and a banner offers a <strong>Download .seb config</strong> button so the
                    student can get the right config file and reopen the assignment inside SEB.
                </p>
            </FeatureSection>
        </div>
    );
}

function AnalyticsTab() {
    return (
        <div>
            <FeatureSection icon={BookOpen} title="Student portfolio view" color="#8b5cf6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Open a student from the <strong>Students</strong> page. The <strong>Portfolio</strong> tab shows a
                    chronological timeline that combines rubric grades, speaking sessions, and self-assessments in one
                    scrollable view. Each entry shows the date, type, rubric name, and score with a direct link to view
                    or edit the full record.
                </p>
            </FeatureSection>

            <FeatureSection icon={BarChart3} title="Statistics dashboard" color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Go to <strong>Statistics</strong> in the sidebar. Filter by class, track, and year. Three views:
                </p>
                <FeatureList
                    items={[
                        'By Rubric — grade distribution, per-criterion averages, score histogram, class trend.',
                        'By Student — per-student rubric history and criterion radar comparison.',
                        'Compare — select up to 4 classes, compare averages, criterion gaps, and trend lines side by side. Collapsible Insights panel flags struggling classes, weak criteria, and divergence between classes.',
                        'Track and year filter dropdowns scope the class selector to Dutch VO tracks (VMBO/HAVO/VWO) and school year.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={BarChart3} title="Activity Dashboard" color="#0ea5e9">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Go to <strong>Activity Dashboard</strong> in the sidebar. Rows are rubrics, tests, and essays;
                    columns are classes. Each cell shows how many students submitted/were graded and a quick action:
                </p>
                <FeatureList
                    items={[
                        'Rubrics — Link/Unlink adds or removes the rubric from a class\'s assignment list.',
                        'Essays — Assign All bulk-creates essay assignments for all unenrolled students in the class.',
                        'Tests — Open navigates to the test builder where you can share the class link.',
                        'Filter by school year and VO track to narrow the column set.',
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
                        "CSV — raw grade data for Excel or your school's gradebook.",
                        'Period report — aggregated CEFR progress report for a class over a date range.',
                    ]}
                />
                <InfoBox color="#10b981">
                    Mail-merge DOCX templates support custom fields. Upload a .docx file with placeholder fields and the
                    app will substitute them with student data.
                </InfoBox>
            </FeatureSection>

            <FeatureSection icon={Languages} title="Vocabulary Profile dashboard" color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    Go to <strong>Vocabulary</strong> in the sidebar (<code>/vocabulary</code>). This dashboard
                    aggregates CEFR vocabulary levels (A1–C2) detected in students' analysed documents.
                </p>
                <FeatureList
                    items={[
                        'Per-class stacked bar chart of vocabulary level distribution, with a class selector.',
                        'Per-student drill-down showing each student’s estimated vocabulary level and profiled word count.',
                        'CSV export of vocabulary words — filter by a single CEFR band (A1–C2) or export all levels — with word, level, definition, and source columns.',
                    ]}
                />
                <InfoBox color="#f59e0b">
                    This dashboard is read-only and derives entirely from existing document analysis results (see
                    Attachments → Analyse) and rubric vocabulary lists — analyse student submissions first to populate
                    it.
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
                        'Conflict resolution: when local and cloud data differ, the newest change wins. Edits made while offline are protected and never overwritten by older cloud data until they have synced.',
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    Stress-test logging
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Admins can build with <code>VITE_STRESS_TEST_LOGGING=true</code> to record diagnostic events
                    (actions, sync results, errors — never essay text, comments, or grades) to a{' '}
                    <code>client_logs</code> table during a pilot. Useful for running a full-class test before rollout.
                    Disable by rebuilding without the flag once the pilot is done.
                </p>
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
                        'Retention tab — set automatic data retention policies per school.',
                        'Audit Log tab — filterable, paginated log of role changes, grade saves, exports, and auth events; admins see all entries, teachers see their own. Entries are retained for 3 years (admin), 1 year (grade), 1 month (export/auth) then automatically purged.',
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Settings} title="Settings" color="#64748b">
                <FeatureList
                    items={[
                        'Theme — dark / light, accent colour picker, 8 quick presets, or choose a named theme bundle (Academy, Nature, Midnight, Warm, Slate, Rose) that sets font, accent, and export colour in one click.',
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
    const tabs = getTabs(t);

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
                            {t('docs.section_title')}
                        </div>
                        {tabs.map(({ id, label, icon: Icon }) => (
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
                    <div className="card" style={{ minHeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                            <LayoutDashboard size={14} style={{ color: 'var(--text-dim)' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Docs</span>
                            <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>
                                {tabs.find((tab) => tab.id === activeTab)?.label}
                            </span>
                        </div>
                        {TAB_CONTENT[activeTab]}
                    </div>
                </div>
            </div>
        </>
    );
}
