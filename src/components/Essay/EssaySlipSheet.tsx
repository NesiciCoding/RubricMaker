import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { encodeEssayAssignment } from '../../utils/essayShareCode';
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
    return `${window.location.origin}${window.location.pathname}#/essay/${encodeEssayAssignment(a)}`;
}

function SlipItem({ student, assignment }: { student: ClassStudent; assignment: EssayAssignment }) {
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
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>⏱ {assignment.timeLimitMinutes} min</div>
                )}
                {(assignment.minWords || assignment.maxWords) && (
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Words: {assignment.minWords ?? 0}–{assignment.maxWords ?? '∞'}
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
    const [columns, setColumns] = useState<2 | 4>(2);

    const content = (
        <>
            {/* Print styles — overlay is portalled to body so #root is hidden via index.css */}
            <style>{`
                @media print {
                    .slip-sheet-overlay { position: static !important; background: none !important; padding: 0 !important; }
                    .slip-sheet-controls { display: none !important; }
                    .slip-sheet-container { box-shadow: none !important; border-radius: 0 !important; max-height: none !important; overflow: visible !important; }
                    .slip-sheet-grid { grid-template-columns: repeat(${columns}, 1fr) !important; }
                    .slip-item { break-inside: avoid; }
                }
                .slip-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    border: 1px dashed #cbd5e1;
                    border-radius: 6px;
                    background: #fff;
                }
            `}</style>

            <div
                className="slip-sheet-overlay"
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: 24,
                    overflowY: 'auto',
                }}
            >
                <div
                    className="slip-sheet-container"
                    style={{
                        background: '#f8fafc',
                        borderRadius: 14,
                        width: '100%',
                        maxWidth: 860,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                        maxHeight: '90vh',
                        overflow: 'auto',
                    }}
                >
                    {/* Controls bar */}
                    <div
                        className="slip-sheet-controls"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 20px',
                            borderBottom: '1px solid #e2e8f0',
                            background: '#fff',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                Class slips — {students.length} students
                            </span>
                            <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                                <button
                                    onClick={() => setColumns(2)}
                                    className={`btn btn-sm ${columns === 2 ? 'btn-primary' : 'btn-secondary'}`}
                                >
                                    2 columns
                                </button>
                                <button
                                    onClick={() => setColumns(4)}
                                    className={`btn btn-sm ${columns === 4 ? 'btn-primary' : 'btn-secondary'}`}
                                >
                                    4 columns
                                </button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
                                <Printer size={14} /> Print
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={onClose}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Slip grid */}
                    <div
                        className="slip-sheet-grid"
                        style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8, padding: 20 }}
                    >
                        {students.map((s) => (
                            <SlipItem key={s.id} student={s} assignment={baseAssignment} />
                        ))}
                    </div>
                </div>
            </div>
        </>
    );

    return ReactDOM.createPortal(content, document.body);
}
