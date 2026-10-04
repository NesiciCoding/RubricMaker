import React from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import CommentBankManager from '../components/Comments/CommentBankManager';

export default function CommentBankPage() {
    const { t } = useTranslation();
    const tour = usePageTourState('comments');

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={t('commentBank.title')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                        {t('tutorial.page_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in" data-tour="cb-manager">
                <CommentBankManager fullPage />
            </div>
        </>
    );
}
