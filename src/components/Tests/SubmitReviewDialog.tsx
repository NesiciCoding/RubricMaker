import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';

interface Props {
    /** 0-based positions of unanswered questions, in the order the student sees them */
    unanswered: number[];
    /** 0-based positions of questions the student flagged for review */
    flagged: number[];
    onJump: (index: number) => void;
    onSubmit: () => void;
    onClose: () => void;
}

/** Shown when a student submits with unanswered or flagged questions, so nothing is handed in by accident. */
export default function SubmitReviewDialog({ unanswered, flagged, onJump, onSubmit, onClose }: Props) {
    const { t } = useTranslation();
    const group = (key: string, indices: number[]) =>
        indices.length > 0 && (
            <div>
                <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{t(key, { count: indices.length })}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {indices.map((index) => (
                        <button
                            key={index}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-label={t('tests.taking.review_go_to', { number: index + 1 })}
                            onClick={() => onJump(index)}
                        >
                            {index + 1}
                        </button>
                    ))}
                </div>
            </div>
        );
    return (
        <Modal titleId="submit-review-title" onClose={onClose} maxWidth={460}>
            <div className="modal-header">
                <h3 id="submit-review-title" style={{ margin: 0 }}>
                    {t('tests.taking.review_title')}
                </h3>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('tests.taking.review_body')}</p>
                {group('tests.taking.review_unanswered', unanswered)}
                {group('tests.taking.review_flagged', flagged)}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                    {t('tests.taking.review_keep_working')}
                </button>
                <button type="button" className="btn btn-primary" onClick={onSubmit}>
                    {t('tests.taking.review_submit_anyway')}
                </button>
            </div>
        </Modal>
    );
}
