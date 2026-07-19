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
    TrendingUp,
    Search,
    Mail,
    Newspaper,
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
    badge?: 'public' | 'student' | 'admin';
}

// ── Route tree ─────────────────────────────────────────────────────────────────

function getRouteTree(t: TFunction): RouteNode[] {
    return [
        {
            path: '/',
            label: t('docs.route_dashboard_label'),
            description: t('docs.route_dashboard_desc'),
            color: '#6366f1',
        },
        {
            path: '/rubrics',
            label: t('docs.route_rubrics_label'),
            description: t('docs.route_rubrics_desc'),
            color: '#3b82f6',
            children: [
                {
                    path: '/rubrics/new',
                    label: t('docs.route_rubrics_new_label'),
                    description: t('docs.route_rubrics_new_desc'),
                    color: '#3b82f6',
                },
                {
                    path: '/rubrics/:id',
                    label: t('docs.route_rubric_builder_label'),
                    description: t('docs.route_rubric_builder_desc'),
                    color: '#3b82f6',
                    children: [
                        {
                            path: '/rubrics/:rubricId/grade/:studentId',
                            label: t('docs.route_grade_student_label'),
                            description: t('docs.route_grade_student_desc'),
                            color: '#8b5cf6',
                        },
                        {
                            path: '/rubrics/:rubricId/peer-review/:studentId',
                            label: t('docs.route_peer_review_label'),
                            description: t('docs.route_peer_review_desc'),
                            color: '#8b5cf6',
                            badge: 'student',
                        },
                        {
                            path: '/peer-analytics/:rubricId',
                            label: t('docs.route_peer_analytics_label'),
                            description: t('docs.route_peer_analytics_desc'),
                            color: '#8b5cf6',
                        },
                        {
                            path: '/rubrics/:rubricId/self-assess/:studentId',
                            label: t('docs.route_self_assess_label'),
                            description: t('docs.route_self_assess_desc'),
                            color: '#8b5cf6',
                            badge: 'student',
                        },
                    ],
                },
                {
                    path: '/grade-comparative/:classId/:rubricId',
                    label: t('docs.route_comparative_grading_label'),
                    description: t('docs.route_comparative_grading_desc'),
                    color: '#06b6d4',
                },
            ],
        },
        {
            path: '/marketplace',
            label: t('docs.route_marketplace_label'),
            description: t('docs.route_marketplace_desc'),
            color: '#3b82f6',
        },
        {
            path: '/tests',
            label: t('docs.route_tests_label'),
            description: t('docs.route_tests_desc'),
            color: '#3b82f6',
            children: [
                {
                    path: '/tests/new',
                    label: t('docs.route_tests_new_label'),
                    description: t('docs.route_tests_new_desc'),
                    color: '#3b82f6',
                },
                {
                    path: '/tests/:id',
                    label: t('docs.route_test_builder_label'),
                    description: t('docs.route_test_builder_desc'),
                    color: '#3b82f6',
                },
                {
                    path: '/tests/:testId/results/:studentTestId',
                    label: t('docs.route_test_results_label'),
                    description: t('docs.route_test_results_desc'),
                    color: '#3b82f6',
                },
                {
                    path: '/tests/:testId/monitor',
                    label: t('docs.route_test_monitor_label'),
                    description: t('docs.route_test_monitor_desc'),
                    color: '#3b82f6',
                },
            ],
        },
        {
            path: '/essays',
            label: t('docs.route_essays_label'),
            description: t('docs.route_essays_desc'),
            color: '#6366f1',
            children: [
                {
                    path: '/essays/new',
                    label: t('docs.route_essays_new_label'),
                    description: t('docs.route_essays_new_desc'),
                    color: '#6366f1',
                },
                {
                    path: '/essays/:teacherKey',
                    label: t('docs.route_essay_builder_label'),
                    description: t('docs.route_essay_builder_desc'),
                    color: '#6366f1',
                    children: [
                        {
                            path: '/essays/:assignmentId/monitor',
                            label: t('docs.route_essay_monitor_label'),
                            description: t('docs.route_essay_monitor_desc'),
                            color: '#8b5cf6',
                        },
                    ],
                },
            ],
        },
        {
            path: '/students',
            label: t('docs.route_students_label'),
            description: t('docs.route_students_desc'),
            color: '#10b981',
            children: [
                {
                    path: '/students/:id',
                    label: t('docs.route_student_profile_label'),
                    description: t('docs.route_student_profile_desc'),
                    color: '#10b981',
                    children: [
                        {
                            path: '/students/:id/cefr-overview',
                            label: t('docs.route_student_cefr_overview_label'),
                            description: t('docs.route_student_cefr_overview_desc'),
                            color: '#10b981',
                        },
                        {
                            path: '/students/:id/learning-path',
                            label: t('docs.route_learning_path_label'),
                            description: t('docs.route_learning_path_desc'),
                            color: '#10b981',
                        },
                    ],
                },
            ],
        },
        {
            path: '/cefr-overview',
            label: t('docs.route_cefr_overview_label'),
            description: t('docs.route_cefr_overview_desc'),
            color: '#f59e0b',
        },
        {
            path: '/vocabulary',
            label: t('docs.route_vocabulary_label'),
            description: t('docs.route_vocabulary_desc'),
            color: '#f59e0b',
        },
        {
            path: '/speaking/:rubricId/:studentId',
            label: t('docs.route_speaking_session_label'),
            description: t('docs.route_speaking_session_desc'),
            color: '#f59e0b',
        },
        {
            path: '/flashcards',
            label: t('docs.route_flashcards_label'),
            description: t('docs.route_flashcards_desc'),
            color: '#f59e0b',
            children: [
                {
                    path: '/flashcards/:id',
                    label: t('docs.route_flashcard_deck_label'),
                    description: t('docs.route_flashcard_deck_desc'),
                    color: '#f59e0b',
                },
            ],
        },
        {
            path: '/news-flashes',
            label: t('docs.route_news_flashes_label'),
            description: t('docs.route_news_flashes_desc'),
            color: '#f59e0b',
        },
        {
            path: '/portal/:studentId',
            label: t('docs.route_student_portal_label'),
            description: t('docs.route_student_portal_desc'),
            color: '#06b6d4',
            badge: 'public',
            children: [
                {
                    path: '/portal/:studentId/flashcards/:deckId',
                    label: t('docs.route_flashcard_study_label'),
                    description: t('docs.route_flashcard_study_desc'),
                    color: '#06b6d4',
                    badge: 'student',
                },
            ],
        },
        {
            path: '/feedback/:code',
            label: t('docs.route_feedback_label'),
            description: t('docs.route_feedback_desc'),
            color: '#06b6d4',
            badge: 'student',
        },
        {
            path: '/preview/:code',
            label: t('docs.route_preview_label'),
            description: t('docs.route_preview_desc'),
            color: '#06b6d4',
            badge: 'public',
        },
        {
            path: '/essay/:code',
            label: t('docs.route_essay_take_label'),
            description: t('docs.route_essay_take_desc'),
            color: '#06b6d4',
            badge: 'student',
        },
        {
            path: '/test/:code',
            label: t('docs.route_take_test_label'),
            description: t('docs.route_take_test_desc'),
            color: '#06b6d4',
            badge: 'student',
        },
        {
            path: '/attachments',
            label: t('docs.route_attachments_label'),
            description: t('docs.route_attachments_desc'),
            color: '#64748b',
        },
        {
            path: '/comments',
            label: t('docs.route_comments_label'),
            description: t('docs.route_comments_desc'),
            color: '#64748b',
        },
        {
            path: '/question-bank',
            label: t('docs.route_question_bank_label'),
            description: t('docs.route_question_bank_desc'),
            color: '#64748b',
        },
        {
            path: '/statistics',
            label: t('docs.route_statistics_label'),
            description: t('docs.route_statistics_desc'),
            color: '#64748b',
        },
        {
            path: '/activity-dashboard',
            label: t('docs.route_activity_dashboard_label'),
            description: t('docs.route_activity_dashboard_desc'),
            color: '#0ea5e9',
        },
        {
            path: '/moderation',
            label: t('docs.route_moderation_label'),
            description: t('docs.route_moderation_desc'),
            color: '#f59e0b',
        },
        {
            path: '/messages',
            label: t('docs.route_messages_label'),
            description: t('docs.route_messages_desc'),
            color: '#f59e0b',
        },
        {
            path: '/export',
            label: t('docs.route_export_label'),
            description: t('docs.route_export_desc'),
            color: '#64748b',
        },
        {
            path: '/settings',
            label: t('docs.route_settings_label'),
            description: t('docs.route_settings_desc'),
            color: '#64748b',
        },
        {
            path: '/admin',
            label: t('docs.route_admin_label'),
            description: t('docs.route_admin_desc'),
            color: '#ef4444',
            badge: 'admin',
        },
        {
            path: '/privacy',
            label: t('docs.route_privacy_label'),
            description: t('docs.route_privacy_desc'),
            color: '#94a3b8',
            badge: 'public',
        },
    ];
}

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

const BADGE_LABEL_KEYS: Record<NonNullable<RouteNode['badge']>, string> = {
    public: 'docs.badge_public',
    student: 'docs.badge_student',
    admin: 'docs.badge_admin',
};

function RouteCard({ node, depth = 0 }: { node: RouteNode; depth?: number }) {
    const { t } = useTranslation();
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
                                        node.badge === 'admin'
                                            ? '#fee2e2'
                                            : node.badge === 'student'
                                              ? '#d1fae5'
                                              : '#dbeafe',
                                    color:
                                        node.badge === 'admin'
                                            ? '#dc2626'
                                            : node.badge === 'student'
                                              ? '#065f46'
                                              : '#1d4ed8',
                                    fontWeight: 600,
                                }}
                            >
                                {t(BADGE_LABEL_KEYS[node.badge])}
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
    const { t } = useTranslation();
    const routeTree = getRouteTree(t);
    return (
        <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem', lineHeight: 1.6 }}>
                {t('docs.route_map_intro')}{' '}
                <strong style={{ color: '#1d4ed8' }}>{t('docs.route_map_intro_public')}</strong>{' '}
                {t('docs.route_map_intro_middle')}{' '}
                <strong style={{ color: '#dc2626' }}>{t('docs.route_map_intro_admin')}</strong>{' '}
                {t('docs.route_map_intro_suffix')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {routeTree.map((node) => (
                    <RouteCard key={node.path} node={node} />
                ))}
            </div>
        </div>
    );
}

function GettingStartedTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={CheckCircle} title={t('docs.gs_quick_start_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>
                    {t('docs.gs_quick_start_intro')}
                </p>
                <Step number={1} title={t('docs.gs_step1_title')}>
                    {t('docs.gs_step1_body_prefix')} <strong>{t('docs.gs_step1_body_continue_offline')}</strong>{' '}
                    {t('docs.gs_step1_body_middle')} <strong>{t('docs.gs_step1_body_teacher_login')}</strong>{' '}
                    {t('docs.gs_step1_body_suffix')}
                </Step>
                <Step number={2} title={t('docs.gs_step2_title')}>
                    {t('docs.gs_step2_body_prefix')} <strong>{t('docs.gs_step2_body_nav')}</strong>.{' '}
                    {t('docs.gs_step2_body_suffix')} <strong>{t('docs.gs_step2_body_save')}</strong>
                    {t('docs.gs_step2_body_end')}
                </Step>
                <Step number={3} title={t('docs.gs_step3_title')}>
                    {t('docs.gs_step3_body_prefix')} <strong>{t('docs.gs_step3_body_students')}</strong>.{' '}
                    <strong>{t('docs.gs_step3_body_add')}</strong> {t('docs.gs_step3_body_rest')}
                </Step>
                <Step number={4} title={t('docs.gs_step4_title')}>
                    {t('docs.gs_step4_body_prefix')} <strong>{t('docs.gs_step4_body_save_next')}</strong>
                    {t('docs.gs_step4_body_end')}
                </Step>
                <Step number={5} title={t('docs.gs_step5_title')}>
                    {t('docs.gs_step5_body')}
                </Step>

                <InfoBox>
                    <strong>{t('docs.gs_guided_tour_label')}</strong> {t('docs.gs_guided_tour_body')}{' '}
                    <strong>{t('docs.gs_guided_tour_settings_path')}</strong>
                    {t('docs.gs_guided_tour_end')} {t('docs.guided_tour_page_tours_prefix')}{' '}
                    <strong>&ldquo;{t('tutorial.rb_tour_button')}&rdquo;</strong>{' '}
                    {t('docs.guided_tour_page_tours_suffix')}
                </InfoBox>
            </FeatureSection>

            <FeatureSection icon={Layers} title={t('docs.gs_modes_title')} color="#6366f1">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    {[
                        {
                            title: t('docs.gs_mode_offline_title'),
                            desc: t('docs.gs_mode_offline_desc'),
                            color: '#64748b',
                        },
                        {
                            title: t('docs.gs_mode_cloud_title'),
                            desc: t('docs.gs_mode_cloud_desc'),
                            color: '#6366f1',
                        },
                        {
                            title: t('docs.gs_mode_docker_title'),
                            desc: t('docs.gs_mode_docker_desc'),
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

            <FeatureSection icon={Settings} title={t('docs.gs_themes_title')} color="#ec4899">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 12 }}>
                    {t('docs.gs_themes_intro_prefix')} <strong>{t('docs.gs_themes_intro_path')}</strong>
                    {t('docs.gs_themes_intro_end')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gs_themes_item_accent'),
                        t('docs.gs_themes_item_font'),
                        t('docs.gs_themes_item_bundles'),
                        t('docs.gs_themes_item_export_font'),
                        t('docs.gs_themes_item_dyslexia'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={GraduationCap} title={t('docs.gs_classes_title')} color="#14b8a6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 12 }}>
                    {t('docs.gs_classes_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gs_classes_item_year'),
                        t('docs.gs_classes_item_track'),
                        t('docs.gs_classes_item_student_track'),
                        t('docs.gs_classes_item_color'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Download} title={t('docs.gs_install_title')} color="#0ea5e9">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gs_install_body')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Search} title={t('docs.gs_search_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 12 }}>
                    {t('docs.gs_search_intro_prefix')} <strong>{t('docs.gs_search_intro_hotkey')}</strong>{' '}
                    {t('docs.gs_search_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gs_search_item_types'),
                        t('docs.gs_search_item_filters'),
                        t('docs.gs_search_item_year_track'),
                        t('docs.gs_search_item_grade_shortcut'),
                        t('docs.gs_search_item_active_class'),
                        t('docs.gs_search_item_portal'),
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

function RubricsTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={BookOpen} title={t('docs.rb_builder_title')} color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.rb_builder_intro')}
                </p>
                <InfoBox>
                    {t('docs.rb_builder_views_prefix')} <strong>{t('docs.rb_builder_views_form')}</strong>{' '}
                    {t('docs.rb_builder_views_form_desc')} {t('docs.rb_builder_views_and')}{' '}
                    <strong>{t('docs.rb_builder_views_designer')}</strong> {t('docs.rb_builder_views_designer_desc')}{' '}
                    {t('docs.rb_builder_views_suffix')}
                </InfoBox>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_scoring_modes_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.rb_scoring_modes_item_total'),
                        t('docs.rb_scoring_modes_item_weighted'),
                        t('docs.rb_scoring_modes_item_single'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_level_options_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.rb_level_options_item_checklist'),
                        t('docs.rb_level_options_item_ranges'),
                        t('docs.rb_level_options_item_modifiers'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_standards_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.rb_standards_item_cefr'),
                        t('docs.rb_standards_item_ib'),
                        t('docs.rb_standards_item_ccss'),
                        t('docs.rb_standards_item_grammar'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_version_history_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.rb_version_history_body_prefix')}{' '}
                    <strong>{t('docs.rb_version_history_body_button')}</strong> {t('docs.rb_version_history_body_mid')}{' '}
                    <strong>{t('docs.rb_version_history_body_compare')}</strong>{' '}
                    {t('docs.rb_version_history_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_save_template_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.rb_save_template_body_prefix')} <strong>{t('docs.rb_save_template_body_button')}</strong>{' '}
                    {t('docs.rb_save_template_body_mid')} <em>{t('docs.rb_save_template_body_my_templates')}</em>{' '}
                    {t('docs.rb_save_template_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_import_export_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.rb_import_export_item_import'),
                        t('docs.rb_import_export_item_export'),
                        t('docs.rb_import_export_item_share_code'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_marketplace_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.rb_marketplace_body_prefix')} <strong>{t('docs.rb_marketplace_body_name')}</strong>{' '}
                    {t('docs.rb_marketplace_body_suffix')} {t('docs.rb_marketplace_cefr_tags_body')}{' '}
                    {t('docs.rb_marketplace_kinds_note')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_department_sharing_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.rb_department_sharing_body_prefix')}{' '}
                    <strong>{t('docs.rb_department_sharing_body_checkbox')}</strong>{' '}
                    {t('docs.rb_department_sharing_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_reorder_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.rb_reorder_body')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_cohort_filtering_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.rb_cohort_filtering_body')}
                </p>
            </FeatureSection>

            <FeatureSection icon={ClipboardCheck} title={t('docs.rb_tests_title')} color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.rb_tests_intro')} <strong>{t('docs.rb_tests_intro_page')}</strong>{' '}
                    {t('docs.rb_tests_intro_body')} <strong>{t('docs.rb_tests_intro_help_icon')}</strong>{' '}
                    {t('docs.rb_tests_intro_suffix')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>{t('docs.rb_tests_fillgap_label')}</strong> {t('docs.rb_tests_fillgap_uses')}{' '}
                    <code>{'{{...}}'}</code> {t('docs.rb_tests_fillgap_markers')} <code>{'{{Paris}}'}</code>{' '}
                    {t('docs.rb_tests_fillgap_blank')} <code>{'{{Paris|City of Paris}}'}</code>.{' '}
                    {t('docs.rb_tests_fillgap_dropdown_intro')}{' '}
                    <strong>{t('docs.rb_tests_fillgap_dropdown_type')}</strong>{' '}
                    {t('docs.rb_tests_fillgap_dropdown_list')} <code>{'{{Paris|London|Berlin}}'}</code>{' '}
                    {t('docs.rb_tests_fillgap_body_suffix')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>{t('docs.rb_tests_matching_label')}</strong> {t('docs.rb_tests_matching_body')}{' '}
                    <strong>{t('docs.rb_tests_matching_word')}</strong>
                    {t('docs.rb_tests_matching_body2')} <strong>{t('docs.rb_tests_ordering_word')}</strong>
                    {t('docs.rb_tests_ordering_body')} <strong>{t('docs.rb_tests_categorize_word')}</strong>
                    {t('docs.rb_tests_categorize_body')} <strong>{t('docs.rb_tests_partial_credit_label')}</strong>{' '}
                    {t('docs.rb_tests_partial_credit_body')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    <strong>{t('docs.rb_tests_hottext_label')}</strong> {t('docs.rb_tests_hottext_body')}{' '}
                    <code>{t('docs.rb_tests_hottext_example')}</code> {t('docs.rb_tests_hottext_body2')}
                    <strong> {t('docs.rb_tests_hottext_body3')}</strong> {t('docs.rb_tests_hottext_body4')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.rb_tests_due_date_body')}
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.rb_tests_student_view_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.rb_tests_student_view_item_seb'),
                        t('docs.rb_tests_student_view_item_timer'),
                        t('docs.rb_tests_student_view_item_autosave'),
                        t('docs.rb_tests_student_view_item_submit'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Radio} title={t('docs.rb_live_monitor_title')} color="#ef4444">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.rb_live_monitor_intro_prefix')} <strong>{t('docs.rb_live_monitor_button')}</strong>{' '}
                    {t('docs.rb_live_monitor_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.rb_live_monitor_item_presence'),
                        t('docs.rb_live_monitor_item_grid'),
                        t('docs.rb_live_monitor_item_draft'),
                        t('docs.rb_live_monitor_item_hide_names'),
                        t('docs.rb_live_monitor_item_proctoring'),
                        t('docs.rb_live_monitor_item_nudge'),
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

function GradingTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={PenLine} title={t('docs.gr_interface_title')} color="#8b5cf6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.gr_interface_intro_prefix')} <strong>{t('docs.gr_interface_save_next')}</strong>{' '}
                    {t('docs.gr_interface_intro_suffix')}
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_scoring_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.gr_scoring_item_select'),
                        t('docs.gr_scoring_item_slider'),
                        t('docs.gr_scoring_item_subitems'),
                        t('docs.gr_scoring_item_modifiers'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_mobile_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_mobile_body_prefix')} <strong>{t('docs.gr_mobile_stepper')}</strong>{' '}
                    {t('docs.gr_mobile_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_feedback_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.gr_feedback_item_comment_bank'),
                        t('docs.gr_feedback_item_voice'),
                        t('docs.gr_feedback_item_notes'),
                        t('docs.gr_feedback_item_attachments'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_document_view_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_document_view_body')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_comparative_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_comparative_body_prefix')} <strong>{t('docs.gr_comparative_button')}</strong>{' '}
                    {t('docs.gr_comparative_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_group_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_group_body_prefix')} <strong>{t('docs.gr_group_button')}</strong>{' '}
                    {t('docs.gr_group_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_delete_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_delete_body')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_peer_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.gr_peer_item_peer_review'),
                        t('docs.gr_peer_item_self_assess'),
                        t('docs.gr_peer_item_analytics'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_cograding_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_cograding_body_prefix')} <strong>{t('docs.gr_cograding_button')}</strong>{' '}
                    {t('docs.gr_cograding_body_mid')} <strong>{t('docs.gr_cograding_moderation')}</strong>{' '}
                    {t('docs.gr_cograding_body_suffix')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gr_cograding_reconcile_body_prefix')}{' '}
                    <strong>{t('docs.gr_cograding_reconcile_button')}</strong>{' '}
                    {t('docs.gr_cograding_reconcile_body_suffix')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 8 }}>
                    {t('docs.gr_cograding_pending_note')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 8 }}>
                    {t('docs.gr_cograding_digest_note')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Mail} title={t('docs.gr_messages_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_messages_body_prefix')} <code>/messages</code> {t('docs.gr_messages_body_suffix')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gr_messages_scope_note')}
                </p>
            </FeatureSection>

            <FeatureSection icon={MessageSquare} title={t('docs.gr_comment_bank_title')} color="#06b6d4">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_comment_bank_body_prefix')} <strong>{t('docs.gr_comment_bank_nav')}</strong>{' '}
                    {t('docs.gr_comment_bank_body')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gr_comment_bank_suggested_note')}
                </p>
            </FeatureSection>

            <FeatureSection icon={ClipboardCheck} title={t('docs.gr_test_results_title')} color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.gr_test_results_intro_prefix')} <strong>{t('docs.gr_test_results_intro_tests')}</strong>{' '}
                    {t('docs.gr_test_results_intro_mid')} <strong>{t('docs.gr_test_results_intro_button')}</strong>{' '}
                    {t('docs.gr_test_results_intro_suffix')} <code>/tests/:testId/results/:studentTestId</code>.
                </p>
                <FeatureList
                    items={[
                        t('docs.gr_test_results_item_autoscore'),
                        t('docs.gr_test_results_item_open'),
                        t('docs.gr_test_results_item_grade'),
                        t('docs.gr_test_results_item_standards'),
                        t('docs.gr_test_results_item_integrity'),
                        t('docs.gr_test_results_item_audio_response'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_question_bank_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_question_bank_body_prefix')} <code>/question-bank</code>{' '}
                    {t('docs.gr_question_bank_body_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gr_question_bank_item_cefr'),
                        t('docs.gr_question_bank_item_bundle_save'),
                        t('docs.gr_question_bank_item_bundle_insert'),
                    ]}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 8 }}>
                    {t('docs.gr_question_bank_import_body')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_generate_test_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_generate_test_body')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gr_generate_test_item_criteria'),
                        t('docs.gr_generate_test_item_organize'),
                        t('docs.gr_generate_test_item_review'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_test_mode_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_test_mode_body')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gr_test_mode_item_practice'),
                        t('docs.gr_test_mode_item_cefr'),
                        t('docs.gr_test_mode_item_audio'),
                        t('docs.gr_test_mode_item_retake'),
                        t('docs.gr_test_mode_item_grammar'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_test_rich_authoring_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_test_rich_authoring_body')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gr_test_rich_authoring_item_prompt'),
                        t('docs.gr_test_rich_authoring_item_passage'),
                        t('docs.gr_test_rich_authoring_item_option_image'),
                        t('docs.gr_test_rich_authoring_item_cloze_gap'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_placement_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_placement_body')}
                </p>
                <FeatureList
                    items={[
                        t('docs.gr_placement_item_routing'),
                        t('docs.gr_placement_item_staircase'),
                        t('docs.gr_placement_item_taking'),
                        t('docs.gr_placement_item_results'),
                        t('docs.gr_placement_item_provisional'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_class_avg_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gr_class_avg_body_prefix')} <strong>{t('docs.gr_class_avg_body_results')}</strong>{' '}
                    {t('docs.gr_class_avg_body_suffix')} <strong>{t('docs.gr_class_avg_apply')}</strong>
                    {t('docs.gr_class_avg_body2')} <strong>{t('docs.gr_class_avg_revert')}</strong>
                    {t('docs.gr_class_avg_body3')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_item_analysis_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gr_item_analysis_body')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_import_offline_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.gr_import_offline_body_prefix')} <strong>{t('docs.gr_import_offline_button')}</strong>{' '}
                    {t('docs.gr_import_offline_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_test_summary_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_test_summary_body_prefix')} <strong>{t('docs.gr_test_summary_body_results')}</strong>{' '}
                    {t('docs.gr_test_summary_body_suffix')} <strong>{t('docs.gr_test_summary_export_panel')}</strong>{' '}
                    {t('docs.gr_test_summary_body2')}
                </p>
            </FeatureSection>

            <FeatureSection icon={LayoutDashboard} title={t('docs.gr_portal_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.gr_portal_intro_prefix')} <strong>{t('docs.gr_portal_intro_button')}</strong>{' '}
                    {t('docs.gr_portal_intro_suffix')} <code>/portal/:studentId</code>.
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_portal_work_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_portal_work_body')}
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_portal_progress_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.gr_portal_progress_body')}
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.gr_portal_messages_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.gr_portal_messages_body')}
                </p>
            </FeatureSection>
        </div>
    );
}

function CefrTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={GraduationCap} title={t('docs.ce_overview_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_overview_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.ce_overview_item_whole_class'),
                        t('docs.ce_overview_item_per_student'),
                        t('docs.ce_overview_item_progress'),
                        t('docs.ce_overview_item_evidence'),
                    ]}
                />
                <InfoBox color="#f59e0b">{t('docs.ce_overview_info')}</InfoBox>
            </FeatureSection>

            <FeatureSection icon={Award} title={t('docs.ce_mastery_targets_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_mastery_targets_intro')}
                </p>
                <FeatureList
                    items={[t('docs.ce_mastery_targets_item_config'), t('docs.ce_mastery_targets_item_status')]}
                />
            </FeatureSection>

            <FeatureSection icon={TrendingUp} title={t('docs.ce_learning_paths_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_learning_paths_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.ce_learning_paths_item_recs'),
                        t('docs.ce_learning_paths_item_flags'),
                        t('docs.ce_learning_paths_item_computed'),
                        t('docs.ce_learning_paths_item_grammar'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={BarChart3} title={t('docs.ce_mastery_profile_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.ce_mastery_profile_body')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Mic} title={t('docs.ce_speaking_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_speaking_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.ce_speaking_item_profile'),
                        t('docs.ce_speaking_item_rubrics'),
                        t('docs.ce_speaking_item_past'),
                        t('docs.ce_speaking_item_inside'),
                        t('docs.ce_speaking_item_results'),
                        t('docs.ce_speaking_item_recording'),
                        t('docs.ce_speaking_item_practice_mode'),
                    ]}
                />
                <InfoBox color="#f59e0b">{t('docs.ce_speaking_info')}</InfoBox>
            </FeatureSection>

            <FeatureSection icon={Globe} title={t('docs.ce_self_assess_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.ce_self_assess_body')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Layers} title={t('docs.ce_flashcards_title')} color="#8b5cf6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_flashcards_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.ce_flashcards_item_create'),
                        t('docs.ce_flashcards_item_import'),
                        t('docs.ce_flashcards_item_assign'),
                        t('docs.ce_flashcards_item_study'),
                        t('docs.ce_flashcards_item_insights'),
                        t('docs.ce_flashcards_item_grammar'),
                    ]}
                />
                <InfoBox color="#8b5cf6">{t('docs.ce_flashcards_info')}</InfoBox>
            </FeatureSection>

            <FeatureSection icon={Newspaper} title={t('docs.ce_news_flashes_title')} color="#8b5cf6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_news_flashes_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.ce_news_flashes_item_create'),
                        t('docs.ce_news_flashes_item_content'),
                        t('docs.ce_news_flashes_item_link'),
                        t('docs.ce_news_flashes_item_timeline'),
                        t('docs.ce_news_flashes_item_read_receipts'),
                    ]}
                />
                <InfoBox color="#8b5cf6">{t('docs.ce_news_flashes_info')}</InfoBox>
            </FeatureSection>

            <FeatureSection icon={Award} title={t('docs.ce_cambridge_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.ce_cambridge_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.ce_cambridge_item_lookup'),
                        t('docs.ce_cambridge_item_fill'),
                        t('docs.ce_cambridge_item_offline'),
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

function EssaysTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={FileText} title={t('docs.es_workspace_title')} color="#6366f1">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.es_workspace_intro_prefix')} <strong>{t('docs.es_workspace_intro_name')}</strong>{' '}
                    {t('docs.es_workspace_intro_suffix')}
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.es_creating_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.es_creating_item_new'),
                        t('docs.es_creating_item_rubric'),
                        t('docs.es_creating_item_readonly'),
                        t('docs.es_creating_item_seb'),
                        t('docs.es_creating_item_assign'),
                        t('docs.es_creating_item_status'),
                        t('docs.es_creating_item_import'),
                        t('docs.es_creating_item_monitor'),
                        t('docs.es_creating_item_save_config'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.es_editor_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.es_editor_body_prefix')} <strong>{t('docs.es_editor_page_view')}</strong>{' '}
                    {t('docs.es_editor_body_suffix')}
                </p>

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.es_doc_analysis_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.es_doc_analysis_item_upload'),
                        t('docs.es_doc_analysis_item_ocr'),
                        t('docs.es_doc_analysis_item_grammar_check'),
                        t('docs.es_doc_analysis_item_grammar_qual'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={FileSearch} title={t('docs.es_submission_title')} color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.es_submission_body1')} <strong>{t('docs.es_submission_import_button')}</strong>{' '}
                    {t('docs.es_submission_body2')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.es_submission_body3_prefix')} <strong>{t('docs.es_submission_download_button')}</strong>{' '}
                    {t('docs.es_submission_body3_suffix')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Download} title={t('docs.es_export_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.es_export_intro_prefix')} <strong>{t('docs.es_export_nav')}</strong>{' '}
                    {t('docs.es_export_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.es_export_item_formats'),
                        t('docs.es_export_item_batch'),
                        t('docs.es_export_item_combined'),
                        t('docs.es_export_item_ics'),
                        t('docs.es_export_item_styling'),
                    ]}
                />
            </FeatureSection>
        </div>
    );
}

function AnalyticsTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={BookOpen} title={t('docs.an_portfolio_title')} color="#8b5cf6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.an_portfolio_body_prefix')} <strong>{t('docs.an_portfolio_students_nav')}</strong>{' '}
                    {t('docs.an_portfolio_body_mid')} <strong>{t('docs.an_portfolio_tab_name')}</strong>{' '}
                    {t('docs.an_portfolio_body_suffix')}
                </p>
            </FeatureSection>

            <FeatureSection icon={BarChart3} title={t('docs.an_stats_title')} color="#3b82f6">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.an_stats_intro_prefix')} <strong>{t('docs.an_stats_nav')}</strong>{' '}
                    {t('docs.an_stats_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.an_stats_item_by_rubric'),
                        t('docs.an_stats_item_by_student'),
                        t('docs.an_stats_item_compare'),
                        t('docs.an_stats_item_filters'),
                        t('docs.an_stats_item_custom_views'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={BarChart3} title={t('docs.an_activity_title')} color="#0ea5e9">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.an_activity_intro_prefix')} <strong>{t('docs.an_activity_nav')}</strong>{' '}
                    {t('docs.an_activity_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.an_activity_item_rubrics'),
                        t('docs.an_activity_item_essays'),
                        t('docs.an_activity_item_tests'),
                        t('docs.an_activity_item_filter'),
                        t('docs.an_activity_item_coverage'),
                        t('docs.an_activity_item_reorder'),
                    ]}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 8 }}>
                    {t('docs.an_activity_pending')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Download} title={t('docs.an_export_title')} color="#10b981">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.an_export_intro_prefix')} <strong>{t('docs.an_export_nav')}</strong>{' '}
                    {t('docs.an_export_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.an_export_item_pdf'),
                        t('docs.an_export_item_docx', { interpolation: { prefix: '⟦', suffix: '⟧' } }),
                        t('docs.an_export_item_csv'),
                        t('docs.an_export_item_csv_presets'),
                        t('docs.an_export_item_period'),
                        t('docs.an_export_item_report_cards'),
                    ]}
                />
                <InfoBox color="#10b981">{t('docs.an_export_info')}</InfoBox>
            </FeatureSection>

            <FeatureSection icon={ClipboardCheck} title={t('docs.an_report_cards_title')} color="#0ea5e9">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.an_report_cards_intro')}
                </p>
                <FeatureList
                    items={[
                        t('docs.an_report_cards_item_toggle'),
                        t('docs.an_report_cards_item_export'),
                        t('docs.an_report_cards_item_summary'),
                        t('docs.an_report_cards_item_chart'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Languages} title={t('docs.an_vocab_title')} color="#f59e0b">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.an_vocab_intro_prefix')}
                    <code>/vocabulary</code>
                    {t('docs.an_vocab_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.an_vocab_item_chart'),
                        t('docs.an_vocab_item_drilldown'),
                        t('docs.an_vocab_item_csv'),
                    ]}
                />
                <InfoBox color="#f59e0b">{t('docs.an_vocab_info')}</InfoBox>
            </FeatureSection>
        </div>
    );
}

function DataTab() {
    const { t } = useTranslation();
    return (
        <div>
            <FeatureSection icon={Database} title={t('docs.da_management_title')} color="#6366f1">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {t('docs.da_management_intro')}
                </p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.da_backup_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.da_backup_item_export'),
                        t('docs.da_backup_item_restore'),
                        t('docs.da_backup_item_docker'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.da_sync_title')}
                </h3>
                <FeatureList
                    items={[
                        t('docs.da_sync_item_env'),
                        t('docs.da_sync_item_source'),
                        t('docs.da_sync_item_collab'),
                        t('docs.da_sync_item_otp'),
                        t('docs.da_sync_item_student_password'),
                        t('docs.da_sync_item_conflict'),
                    ]}
                />

                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)', margin: '16px 0 8px' }}>
                    {t('docs.da_stress_title')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {t('docs.da_stress_body_prefix')} <code>VITE_STRESS_TEST_LOGGING=true</code>{' '}
                    {t('docs.da_stress_body_mid')} <code>client_logs</code> {t('docs.da_stress_body_suffix')}
                </p>
            </FeatureSection>

            <FeatureSection icon={Shield} title={t('docs.da_admin_title')} color="#ef4444">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 8 }}>
                    {t('docs.da_admin_intro_prefix')} <code>/admin</code> {t('docs.da_admin_intro_suffix')}
                </p>
                <FeatureList
                    items={[
                        t('docs.da_admin_item_users'),
                        t('docs.da_admin_item_schools'),
                        t('docs.da_admin_item_database'),
                        t('docs.da_admin_item_integrations'),
                        t('docs.da_admin_item_data'),
                        t('docs.da_admin_item_retention'),
                        t('docs.da_admin_item_audit'),
                    ]}
                />
            </FeatureSection>

            <FeatureSection icon={Settings} title={t('docs.da_settings_title')} color="#64748b">
                <FeatureList
                    items={[
                        t('docs.da_settings_item_theme'),
                        t('docs.da_settings_item_scales'),
                        t('docs.da_settings_item_lang'),
                        t('docs.da_settings_item_tour'),
                        t('docs.da_settings_item_backup'),
                        t('docs.da_settings_item_export_templates'),
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
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                {t('navigation.docs')}
                            </span>
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
