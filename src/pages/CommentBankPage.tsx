import React from 'react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import CommentBankManager from '../components/Comments/CommentBankManager';

export default function CommentBankPage() {
    const { t } = useTranslation();

    return (
        <>
            <Topbar title={t('commentBank.title')} />
            <div className="page-content fade-in">
                <CommentBankManager />
            </div>
        </>
    );
}
