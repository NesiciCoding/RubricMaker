import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
const SelfAssessPage = lazy(() => import('./pages/SelfAssessPage'));
const SpeakingSession = lazy(() => import('./pages/SpeakingSession'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const StudentCefrOverviewPage = lazy(() => import('./pages/StudentCefrOverviewPage'));
const CefrOverviewPage = lazy(() => import('./pages/CefrOverviewPage'));
const StudentPortalPage = lazy(() => import('./pages/StudentPortalPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

// Forces GradeStudent to remount when studentId changes so useState re-initialises.
function GradeStudentRoute() {
    const { studentId } = useParams();
    return <GradeStudent key={studentId} />;
}

const Spinner = () => {
    return (
        <div
            role="status"
            aria-label="Loading"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}
        >
            <Loader className="spin" size={24} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
        </div>
    );
};

export default function App() {
    const { settings, students, updateSettings, showLanding, isCheckingSession, signOutFromDatabase } = useApp();
    const { t, i18n } = useTranslation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const steps = useMemo(() => getTutorialSteps(t), [t, i18n.language]);

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
            <Suspense fallback={<Spinner />}>
                <OnboardingPage />
            </Suspense>
        );
    }

    if (settings.userRole === 'student') {
        const linkedStudent = settings.userEmail
            ? students.find((s) => s.email?.toLowerCase() === settings.userEmail!.toLowerCase())
            : null;

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
                <Suspense fallback={<Spinner />}>
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
                    Skip to main content
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
                <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
                <div className="main-area" id="main-content">
                    <ErrorBoundary>
                        <Suspense fallback={<Spinner />}>
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/rubrics" element={<RubricList />} />
                                <Route path="/rubrics/new" element={<RubricBuilder />} />
                                <Route path="/rubrics/:id" element={<RubricBuilder />} />
                                <Route path="/rubrics/:rubricId/grade/:studentId" element={<GradeStudentRoute />} />
                                <Route path="/rubrics/:rubricId/peer-review/:studentId" element={<PeerReviewView />} />
                                <Route path="/rubrics/:rubricId/self-assess/:studentId" element={<SelfAssessPage />} />
                                <Route path="/speaking/:rubricId/:studentId" element={<SpeakingSession />} />
                                <Route path="/grade-comparative/:classId/:rubricId" element={<ComparativeGrading />} />
                                <Route path="/students" element={<StudentsPage />} />
                                <Route path="/students/:id" element={<StudentProfilePage />} />
                                <Route path="/students/:id/cefr-overview" element={<StudentCefrOverviewPage />} />
                                <Route path="/cefr-overview" element={<CefrOverviewPage />} />
                                <Route path="/portal/:studentId" element={<StudentPortalPage />} />
                                <Route path="/attachments" element={<AttachmentsPage />} />
                                <Route path="/export" element={<ExportPage />} />
                                <Route path="/statistics" element={<StatisticsPage />} />
                                <Route path="/comments" element={<CommentBankPage />} />
                                <Route path="/settings" element={<SettingsPage />} />
                                <Route path="/admin" element={
                                    settings.userRole === 'admin'
                                        ? <AdminPage />
                                        : <Navigate to="/" replace />
                                } />
                                <Route path="/privacy" element={<PrivacyPage />} />
                                <Route path="*" element={<NotFoundPage />} />
                            </Routes>
                        </Suspense>
                    </ErrorBoundary>
                </div>
            </div>
        </MobileMenuContext.Provider>
    );
}
