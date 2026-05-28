import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import { Joyride, STATUS } from 'react-joyride';
import { useApp } from './context/AppContext';
import { MobileMenuContext } from './context/MobileMenuContext';
import { getTutorialSteps } from './data/TutorialSteps';
import { useTranslation } from 'react-i18next';
import { Loader } from 'lucide-react';
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
    const { settings, updateSettings, showLanding, isCheckingSession } = useApp();
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

    const handleJoyrideCallback = (data: { status: string }) => {
        const { status } = data;
        const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
        if (finishedStatuses.includes(status)) {
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
                        primaryColor: 'var(--accent)',
                        backgroundColor: 'var(--bg-elevated)',
                        textColor: 'var(--text)',
                        arrowColor: 'var(--bg-elevated)',
                        overlayColor: 'rgba(0, 0, 0, 0.6)',
                        showProgress: true,
                        buttons: ['back', 'skip', 'primary'],
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
                                <Route path="/attachments" element={<AttachmentsPage />} />
                                <Route path="/export" element={<ExportPage />} />
                                <Route path="/statistics" element={<StatisticsPage />} />
                                <Route path="/comments" element={<CommentBankPage />} />
                                <Route path="/settings" element={<SettingsPage />} />
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
