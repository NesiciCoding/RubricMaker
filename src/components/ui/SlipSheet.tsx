import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
    title: string;
    columns: 2 | 4;
    onColumnsChange: (columns: 2 | 4) => void;
    onClose: () => void;
    children: React.ReactNode;
    /**
     * When provided, renders a "QR codes" checkbox in the controls bar (most students work
     * from a laptop, so the QR is often dead weight). Hiding is CSS-based (`canvas` display
     * none), so it applies to the printed output too and both slip sheets inherit it.
     */
    qrToggleLabel?: string;
}

export default function SlipSheet({ title, columns, onColumnsChange, onClose, children, qrToggleLabel }: Props) {
    const { t } = useTranslation();
    const [showQR, setShowQR] = useState(true);
    const overlayRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    // Capture the opener so focus can be restored when the sheet closes.
    useEffect(() => {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => {
            const opener = openerRef.current;
            openerRef.current = null;
            if (opener?.isConnected) opener.focus();
        };
    }, []);

    // Escape-to-close + modal focus containment (Tab/Shift+Tab wrap), matching
    // the shared Modal behaviour. Initial focus stays on the Close button via autoFocus.
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;
            const root = overlayRef.current;
            if (!root) return;
            const focusables = Array.from(
                root.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => el.offsetParent !== null || el === document.activeElement);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const content = (
        <>
            {/* Print styles — overlay is portalled to body so #root is hidden via index.css */}
            <style>{`
                @media print {
                    .slip-sheet-overlay { position: static !important; background: none !important; padding: 0 !important; }
                    .slip-sheet-controls { display: none !important; }
                    .slip-sheet-container { background: #fff !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; max-height: none !important; overflow: visible !important; }
                    .slip-sheet-grid { grid-template-columns: repeat(${columns}, 1fr) !important; }
                    .slip-item { break-inside: avoid; }
                }
                .slip-sheet-grid.hide-qr canvas { display: none; }
                /* Keep the test URL usable when QR codes are hidden: the compact
                   ellipsis would otherwise remove the path from print (no tooltip
                   on paper). */
                .slip-sheet-grid.hide-qr .slip-test-url {
                    white-space: normal !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                    overflow-wrap: anywhere !important;
                }
                @media print {
                    .slip-sheet-grid.hide-qr .slip-test-url {
                        white-space: normal !important;
                        overflow: visible !important;
                    }
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
                ref={overlayRef}
                className="slip-sheet-overlay"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
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
                        // Screen preview follows the app theme (dark mode no longer flashes a light
                        // panel); the print block above forces paper-white, and .slip-item stays
                        // paper-white in both so slips always read as print output.
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
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
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--bg-elevated)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</span>
                            {qrToggleLabel && (
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontSize: '0.8rem',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        marginLeft: 4,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={showQR}
                                        onChange={(e) => setShowQR(e.target.checked)}
                                    />
                                    {qrToggleLabel}
                                </label>
                            )}
                            <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                                {([2, 4] as const).map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => onColumnsChange(n)}
                                        className={`btn btn-sm ${columns === n ? 'btn-primary' : 'btn-secondary'}`}
                                    >
                                        {n} {t('slip_sheet.columns')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
                                <Printer size={14} /> {t('common.print')}
                            </button>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('common.close')}
                                onClick={onClose}
                                autoFocus
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Slip grid */}
                    <div
                        className={`slip-sheet-grid${showQR ? '' : ' hide-qr'}`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${columns}, 1fr)`,
                            gap: 12,
                            padding: 20,
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </>
    );

    return ReactDOM.createPortal(content, document.body);
}
