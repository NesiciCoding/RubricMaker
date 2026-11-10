import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import SlipSheet from '../ui/SlipSheet';
import type { Student } from '../../types';

type SlipStudent = Pick<Student, 'id' | 'name'>;

interface Props {
    students: SlipStudent[];
    testName: string;
    durationMinutes?: number;
    buildUrl: (studentId: string) => string;
    onClose: () => void;
}

function SlipItem({
    student,
    testName,
    durationMinutes,
    url,
}: {
    student: SlipStudent;
    testName: string;
    durationMinutes?: number;
    url: string;
}) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, url, { width: 96, margin: 0 }).catch((e) => {
            console.error('[qr] canvas generation failed', e);
        });
    }, [url]);

    return (
        <div className="slip-item">
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: 4 }}>
                    {student.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 4 }}>{testName}</div>
                {durationMinutes && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        ⏱ {t('slip_sheet.minutes', { count: durationMinutes })}
                    </div>
                )}
                <div
                    title={url}
                    className="slip-test-url"
                    style={{
                        marginTop: 6,
                        fontSize: '0.65rem',
                        color: '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                    }}
                >
                    {url}
                </div>
            </div>
            <canvas ref={canvasRef} style={{ flexShrink: 0 }} />
        </div>
    );
}

export default function TestSlipSheet({ students, testName, durationMinutes, buildUrl, onClose }: Props) {
    const { t } = useTranslation();
    const [columns, setColumns] = useState<2 | 4>(2);

    return (
        <SlipSheet
            qrToggleLabel={t('slip_sheet.show_qr')}
            title={t('slip_sheet.class_slips', { count: students.length })}
            columns={columns}
            onColumnsChange={setColumns}
            onClose={onClose}
        >
            {students.map((s) => (
                <SlipItem
                    key={s.id}
                    student={s}
                    testName={testName}
                    durationMinutes={durationMinutes}
                    url={buildUrl(s.id)}
                />
            ))}
        </SlipSheet>
    );
}
