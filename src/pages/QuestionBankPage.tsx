import React from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import QuestionBankManager from '../components/Tests/QuestionBankManager';

export default function QuestionBankPage() {
    const { t } = useTranslation();

    return (
        <>
            <Topbar title={t('questionBank.title')} />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
                <p className="text-muted text-xs" style={{ marginBottom: 16 }}>
                    {t('questionBank.page_intro')}
                </p>
                <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <QuestionBankManager />
                </div>
            </div>
        </>
    );
}
