import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import SlipSheet from '../ui/SlipSheet';
import { encodeEssayAssignment, buildShareUrl } from '../../utils/shareCode';
import type { EssayAssignment } from '../../types';

interface ClassStudent {
    id: string;
    name: string;
}

interface Props {
    baseAssignment: EssayAssignment;
    students: ClassStudent[];
    onClose: () => void;
}

function buildUrl(assignment: EssayAssignment, studentId: string): string {
    const a: EssayAssignment = { ...assignment, studentId };
    return buildShareUrl('essay', encodeEssayAssignment(a));
}

function SlipItem({ student, assignment }: { student: ClassStudent; assignment: EssayAssignment }) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const url = buildUrl(assignment, student.id);

    useEffect(() => {
        if (!canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, url, { width: 80, margin: 0 }).catch((e) => {
            console.error('[qr] canvas generation failed', e);
        });
    }, [url]);

    return (
        <div className="slip-item">
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: 4 }}>
                    {student.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 4 }}>{assignment.title}</div>
                {assignment.timeLimitMinutes && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        ⏱ {t('slip_sheet.minutes', { count: assignment.timeLimitMinutes })}
                    </div>
                )}
                {(assignment.minWords || assignment.maxWords) && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {t('slip_sheet.words')}: {assignment.minWords ?? 0}–{assignment.maxWords ?? '∞'}
                    </div>
                )}
                <div
                    style={{
                        marginTop: 6,
                        fontSize: '0.65rem',
                        color: '#94a3b8',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                    }}
                >
                    {url.slice(0, 60)}
                    {url.length > 60 ? '…' : ''}
                </div>
            </div>
            <canvas ref={canvasRef} style={{ flexShrink: 0 }} />
        </div>
    );
}

export default function EssaySlipSheet({ baseAssignment, students, onClose }: Props) {
    const { t } = useTranslation();
    const [columns, setColumns] = useState<2 | 4>(2);

    return (
        <SlipSheet
            title={t('slip_sheet.class_slips', { count: students.length })}
            columns={columns}
            onColumnsChange={setColumns}
            onClose={onClose}
        >
            {students.map((s) => (
                <SlipItem key={s.id} student={s} assignment={baseAssignment} />
            ))}
        </SlipSheet>
    );
}
