import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import SlipSheet from '../ui/SlipSheet';

export interface PasswordSlip {
    id: string;
    name: string;
    email: string;
    password?: string;
    error?: string;
}

interface Props {
    slips: PasswordSlip[];
    onClose: () => void;
}

function SlipItem({ slip }: { slip: PasswordSlip }) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current || !slip.password) return;
        QRCode.toCanvas(canvasRef.current, window.location.origin, { width: 80, margin: 0 }).catch((e) => {
            console.error('[qr] canvas generation failed', e);
        });
    }, [slip.password]);

    return (
        <div className="slip-item">
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: 4 }}>{slip.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 6, wordBreak: 'break-all' }}>
                    {slip.email}
                </div>
                {slip.password ? (
                    <div
                        style={{
                            fontFamily: 'monospace',
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            color: '#0f172a',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: 4,
                            padding: '4px 8px',
                            display: 'inline-block',
                        }}
                    >
                        {slip.password}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>
                        {t('studentsPage.password_slip_item_error')}
                    </div>
                )}
            </div>
            {slip.password && <canvas ref={canvasRef} style={{ flexShrink: 0 }} />}
        </div>
    );
}

export default function StudentPasswordSlipSheet({ slips, onClose }: Props) {
    const { t } = useTranslation();
    const [columns, setColumns] = useState<2 | 4>(2);

    return (
        <SlipSheet
            title={t('studentsPage.password_slip_title', { count: slips.length })}
            columns={columns}
            onColumnsChange={setColumns}
            onClose={onClose}
        >
            {slips.map((slip) => (
                <SlipItem key={slip.id} slip={slip} />
            ))}
        </SlipSheet>
    );
}
