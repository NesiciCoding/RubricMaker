import React, { Suspense, lazy, useMemo, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { useApp } from './context/AppContext';
import { MobileMenuContext } from './context/MobileMenuContext';
import { getTutorialSteps } from './data/TutorialSteps';
import { useTranslation } from 'react-i18next';
import { Loader, GraduationCap } from 'lucide-react';
import LandingPage from './pages/LandingPage';
import MigrationPrompt from './components/auth/MigrationPrompt';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import NotFoundPage from './pages/NotFoundPage';
import RouteSkeleton from './components/ui/RouteSkeleton';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const RubricList = lazy(() => import('./pages/RubricList'));
const RubricBuilder = lazy(() => import('./pages/RubricBuilder'));
const GradeStudent = lazy(() => import('./pages/GradeStudent'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const AttachmentsPage = lazy(() => import('./pages/AttachmentsPage'));
const ExportPage = lazy(() => import('./pages/ExportPage'));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'));
const CommentBankPage = lazy(() => import('./pages/CommentBankPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage'));
const ComparativeGrading = lazy(() => import('./pages/ComparativeGrading'));
const PeerReviewView = lazy(() => import('./pages/PeerReviewView'));
const PeerReviewAnalyticsPage = lazy(() => import('./pages/PeerReviewAnalyticsPage'));
const SelfAssessPage = lazy(() => import('./pages/SelfAssessPage'));
const SpeakingSession = lazy(() => import('./pages/SpeakingSession'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const StudentCefrOverviewPage = lazy(() => import('./pages/StudentCefrOverviewPage'));
const StudentLearningPathPage = lazy(() => import('./pages/StudentLearningPathPage'));
const CefrOverviewPage = lazy(() => import('./pages/CefrOverviewPage'));
const VocabularyDashboardPage = lazy(() => import('./pages/VocabularyDashboardPage'));
const TestListPage = lazy(() => import('./pages/TestListPage'));
const TestBuilderPage = lazy(() => import('./pages/TestBuilderPage'));
const EssayListPage = lazy(() => import('./pages/EssayListPage'));
const EssayBuilderPage = lazy(() => import('./pages/EssayBuilderPage'));
const TestResultsPage = lazy(() => import('./pages/TestResultsPage'));
const LiveMonitorPage = lazy(() => import('./pages/LiveMonitorPage'));
const StudentPortalPage = lazy(() => import('./pages/StudentPortalPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const ActivityDashboardPage = lazy(() => import('./pages/ActivityDashboardPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const ModerationQueuePage = lazy(() => import('./pages/ModerationQueuePage'));

// Forces GradeStudent to remount when studentId changes so useState re-initialises.
function GradeStudentRoute() {
    const { studentId } = useParams();
    return <GradeStudent key={studentId} />;
}

function RouteAnnouncer() {
    const location = useLocation();
    const [msg, setMsg] = useState('');
    useEffect(() => {
        const id = setTimeout(() => setMsg(document.title), 50);
        return () => clearTimeout(id);
    }, [location.pathname]);
    return (
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {msg}
        </span>
    );
}

export default function App() {
    const { settings, students, updateSettings, showLanding, isCheckingSession, signOutFromDatabase } = useApp();
    const { t } = useTranslation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const steps = useMemo(() => getTutorialSteps(t), [t]);

    if (isCheckingSession) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <Loader className="spin" size={28} style={{ color: '#94a3b8' }} />
            </div>
        );
    }

    if (showLanding) return <LandingPage />;

    if (settings.needsOnboarding) {
        return (
            <Suspense fallback={<RouteSkeleton />}>
                <OnboardingPage />
            </Suspense>
        );
    }

    // Resolve student link regardless of role so new sign-ups (default role='user')
    // are auto-detected without requiring a manual admin role change.
    const linkedStudent = settings.userEmail
        ? students.find((s) => s.email?.toLowerCase() === settings.userEmail!.toLowerCase())
        : null;

    // Student portal: explicit 'student' role OR email matches a student record for any
    // non-admin user (handles first-time sign-ins before the DB trigger can assign the role).
    if (settings.userRole === 'student' || (linkedStudent !== null && settings.userRole !== 'admin')) {
        if (!linkedStudent) {
            return (
                <div
                    style={{
                        minHeight: '100vh',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg)',
                        flexDirection: 'column',
                        gap: 16,
                        padding: 24,
                        textAlign: 'center',
                    }}
                >
                    <GraduationCap size={40} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>
                        {t('studentPortal.no_linked_account')}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: 360 }}>
                        {t('studentPortal.no_linked_account_detail')}
                    </p>
                    <button className="btn btn-secondary btn-sm" onClick={signOutFromDatabase}>
                        {t('studentPortal.sign_out')}
                    </button>
                </div>
            );
        }

        return (
            <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                    <Routes>
                        <Route path="/portal/:studentId" element={<StudentPortalPage />} />
                        <Route path="/privacy" element={<PrivacyPage />} />
                        <Route path="*" element={<Navigate to={`/portal/${linkedStudent.id}`} replace />} />
                    </Routes>
                </Suspense>
            </ErrorBoundary>
        );
    }

    const handleJoyrideCallback = (data: EventData) => {
        if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
            updateSettings({ hasSeenTutorial: true });
        }
    };

    return (
        <MobileMenuContext.Provider value={{ open: () => setMobileMenuOpen(true) }}>
            <MigrationPrompt />
            <div className="app-layout">
                <a href="#main-content" className="skip-nav">
                    {t('a11y.skip_to_content')}
                </a>
                <Joyride
                    steps={steps}
                    run={!settings.hasSeenTutorial}
                    continuous
                    onEvent={handleJoyrideCallback}
                    options={{
                        showProgress: true,
                        buttons: ['back', 'skip', 'primary'],
                        primaryColor: 'var(--accent)',
                        backgroundColor: 'var(--bg-elevated)',
                        textColor: 'var(--text)',
                        arrowColor: 'var(--bg-elevated)',
                        overlayColor: 'rgba(0, 0, 0, 0.6)',
                    }}
                    styles={{
                        tooltipContainer: {
                            textAlign: 'left',
                        },
                    }}
                />
                <RouteAnnouncer />
                <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
                <main className="main-area" id="main-content">
                    <ErrorBoundary>
                        <Suspense fallback={<RouteSkeleton />}>
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/rubrics" element={<RubricList />} />
                                <Route path="/rubrics/new" element={<RubricBuilder />} />
                                <Route path="/rubrics/:id" element={<RubricBuilder />} />
                                <Route path="/rubrics/:rubricId/grade/:studentId" element={<GradeStudentRoute />} />
                                <Route path="/rubrics/:rubricId/peer-review/:studentId" element={<PeerReviewView />} />
                                <Route path="/peer-analytics/:rubricId" element={<PeerReviewAnalyticsPage />} />
                                <Route path="/rubrics/:rubricId/self-assess/:studentId" element={<SelfAssessPage />} />
                                <Route path="/speaking/:rubricId/:studentId" element={<SpeakingSession />} />
                                <Route path="/grade-comparative/:classId/:rubricId" element={<ComparativeGrading />} />
                                <Route path="/students" element={<StudentsPage />} />
                                <Route path="/students/:id" element={<StudentProfilePage />} />
                                <Route path="/students/:id/cefr-overview" element={<StudentCefrOverviewPage />} />
                                <Route path="/students/:id/learning-path" element={<StudentLearningPathPage />} />
                                <Route path="/cefr-overview" element={<CefrOverviewPage />} />
                                <Route path="/vocabulary" element={<VocabularyDashboardPage />} />
                                <Route path="/tests" element={<TestListPage />} />
                                <Route path="/tests/new" element={<TestBuilderPage />} />
                                <Route path="/tests/:id" element={<TestBuilderPage />} />
                                <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                                <Route path="/tests/:testId/monitor" element={<LiveMonitorPage kind="test" />} />
                                <Route path="/essays" element={<EssayListPage />} />
                                <Route path="/essays/new" element={<EssayBuilderPage />} />
                                <Route path="/essays/:teacherKey" element={<EssayBuilderPage />} />
                                <Route
                                    path="/essays/:assignmentId/monitor"
                                    element={<LiveMonitorPage kind="essay" />}
                                />
                                <Route path="/portal/:studentId" element={<StudentPortalPage />} />
                                <Route path="/attachments" element={<AttachmentsPage />} />
                                <Route path="/export" element={<ExportPage />} />
                                <Route path="/statistics" element={<StatisticsPage />} />
                                <Route path="/activity-dashboard" element={<ActivityDashboardPage />} />
                                <Route path="/moderation" element={<ModerationQueuePage />} />
                                <Route path="/comments" element={<CommentBankPage />} />
                                <Route path="/marketplace" element={<MarketplacePage />} />
                                <Route path="/settings" element={<SettingsPage />} />
                                <Route
                                    path="/admin"
                                    element={
                                        settings.userRole === 'admin' ? <AdminPage /> : <Navigate to="/" replace />
                                    }
                                />
                                <Route path="/docs" element={<DocsPage />} />
                                <Route path="/privacy" element={<PrivacyPage />} />
                                <Route path="*" element={<NotFoundPage />} />
                            </Routes>
                        </Suspense>
                    </ErrorBoundary>
                </main>
            </div>
        </MobileMenuContext.Provider>
    );
}
