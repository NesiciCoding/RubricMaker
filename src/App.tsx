import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useApp } from './context/AppContext';
import { tutorialSteps } from './components/TutorialSteps';
import { Loader } from 'lucide-react';

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

const Spinner = () => {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
            <Loader className="spin" size={24} style={{ color: 'var(--text-muted)' }} />
        </div>
    );
};

export default function App() {
    const { settings, updateSettings } = useApp();

    const handleJoyrideCallback = (data: CallBackProps) => {
        const { status } = data;
        const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
        if (finishedStatuses.includes(status)) {
            updateSettings({ hasSeenTutorial: true });
        }
    };

    return (
        <div className="app-layout">
            <Joyride
                steps={tutorialSteps}
                run={!settings.hasSeenTutorial}
                continuous
                showSkipButton
                showProgress
                hideCloseButton
                callback={handleJoyrideCallback}
                styles={{
                    options: {
                        primaryColor: 'var(--accent)',
                        backgroundColor: 'var(--bg-elevated)',
                        textColor: 'var(--text)',
                        arrowColor: 'var(--bg-elevated)',
                        overlayColor: 'rgba(0, 0, 0, 0.6)'
                    },
                    tooltipContainer: {
                        textAlign: 'left'
                    }
                }}
            />
            <Sidebar />
            <div className="main-area">
                <Suspense fallback={<Spinner />}>
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/rubrics" element={<RubricList />} />
                        <Route path="/rubrics/new" element={<RubricBuilder />} />
                        <Route path="/rubrics/:id" element={<RubricBuilder />} />
                        <Route path="/rubrics/:rubricId/grade/:studentId" element={<GradeStudent />} />
                        <Route path="/grade-comparative/:classId/:rubricId" element={<ComparativeGrading />} />
                        <Route path="/students" element={<StudentsPage />} />
                        <Route path="/students/:id" element={<StudentProfilePage />} />
                        <Route path="/attachments" element={<AttachmentsPage />} />
                        <Route path="/export" element={<ExportPage />} />
                        <Route path="/statistics" element={<StatisticsPage />} />
                        <Route path="/comments" element={<CommentBankPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </div>
        </div>
    );
}
