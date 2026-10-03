import React from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import QuestionBankManager from '../components/Tests/QuestionBankManager';

export default function QuestionBankPage() {
    const { t } = useTranslation();
    const tour = usePageTourState('questions');

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={t('questionBank.title')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                        {t('tutorial.page_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
                <p className="text-muted text-xs" style={{ marginBottom: 16 }}>
                    {t('questionBank.page_intro')}
                </p>
                <div
                    data-tour="qb-manager"
                    className="card"
                    style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1 }}
                >
                    <QuestionBankManager />
                </div>
            </div>
        </>
    );
}
