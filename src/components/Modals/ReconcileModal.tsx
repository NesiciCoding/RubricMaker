import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import type { ModerationQueueItem } from '../../utils/coGradingModerationQueue';

interface Props {
    item: ModerationQueueItem;
    onConfirm: () => void;
    onClose: () => void;
}

export default function ReconcileModal({ item, onConfirm, onClose }: Props) {
    const { t } = useTranslation();

    return (
        <Modal titleId="reconcile-title" onClose={onClose} maxWidth={520}>
            <div className="modal-header">
                <h3 id="reconcile-title">{t('coGrading.reconcile_modal_title')}</h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={t('common.close')}
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>
            <div className="modal-body">
                <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                    {t('coGrading.reconcile_modal_desc')}
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                    <thead>
                        <tr style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('coGrading.col_criterion')}</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>{t('coGrading.col_baseline')}</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>
                                {t('coGrading.col_second_marker')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>{t('coGrading.col_reconciled')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {item.criteria.map((c) => (
                            <tr key={c.criterionId} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '4px 8px', fontSize: '0.85rem' }}>{c.title}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: '0.85rem' }}>
                                    {c.baselinePoints}
                                </td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: '0.85rem' }}>
                                    {c.secondMarkerPoints}
                                </td>
                                <td
                                    style={{
                                        padding: '4px 8px',
                                        textAlign: 'right',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: 'var(--accent)',
                                    }}
                                >
                                    {((c.baselinePoints + c.secondMarkerPoints) / 2).toFixed(1)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm}>
                        {t('coGrading.action_confirm_reconcile')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
