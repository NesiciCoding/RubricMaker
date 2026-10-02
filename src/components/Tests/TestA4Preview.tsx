import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, ZoomIn, ZoomOut } from 'lucide-react';
import type { Test } from '../../types';
import TiptapEditor from '../Editor/TiptapEditor';
import {
    DEFAULT_TEST_PREVIEW_OPTIONS,
    buildTestPreviewHtml,
    buildTestPreviewSections,
    type TestPreviewOptions,
} from '../../utils/testExamExportHtml';
import { withoutBrowserPrintChrome } from '../../utils/pdfExport';
import { EXAM_PAGE_MM } from '../../utils/testExamContent';

export type PrintTextFields = Pick<Test, 'printHeader' | 'printIntro' | 'printFooter'>;

interface Props {
    test: Test;
    onChange: (patch: PrintTextFields) => void;
}

const MM_TO_PX = 96 / 25.4;
const PAGE_WIDTH_PX = Math.round(EXAM_PAGE_MM.width * MM_TO_PX);
const PAGE_HEIGHT_PX = Math.round(EXAM_PAGE_MM.height * MM_TO_PX);
const PAGE_PADDING_PX = Math.round(15 * MM_TO_PX);
const RENDER_DEBOUNCE_MS = 250;

function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

/** Scale that makes the A4 page fit the pane width, never enlarging past 100%. */
function useFitScale(ref: React.RefObject<HTMLElement | null>): number {
    const [scale, setScale] = useState(1);
    useEffect(() => {
        const el = ref.current;
        /* v8 ignore next -- ResizeObserver is missing in the jsdom test environment */
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 24) / PAGE_WIDTH_PX)));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return scale;
}

export default function TestA4Preview({ test, onChange }: Props) {
    const { t } = useTranslation();
    const [options, setOptions] = useState<TestPreviewOptions>(DEFAULT_TEST_PREVIEW_OPTIONS);
    const [zoomStep, setZoomStep] = useState(0);
    const viewportRef = useRef<HTMLDivElement>(null);
    const fit = useFitScale(viewportRef);
    const scale = Math.min(1.5, Math.max(0.3, fit + zoomStep * 0.1));

    const settled = useDebounced(test, RENDER_DEBOUNCE_MS);
    const sections = useMemo(() => buildTestPreviewSections(settled, options), [settled, options]);

    const print = async () => {
        const { printHtml } = await import('../../utils/pdfExport');
        await printHtml(
            withoutBrowserPrintChrome(buildTestPreviewHtml(test, options)),
            'portrait',
            undefined,
            undefined,
            { hideBrowserChrome: true, waitForPrintDialog: true }
        );
    };

    const editor = (label: string, field: keyof PrintTextFields, placeholder: string) => (
        <div className="a4-preview-editable" data-testid={`a4-${field}`}>
            <span className="a4-preview-editable-label">{label}</span>
            <TiptapEditor
                content={test[field] ?? ''}
                onChange={(html) => onChange({ [field]: html === '<p></p>' ? undefined : html })}
                placeholder={placeholder}
            />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <strong style={{ marginRight: 'auto' }}>{t('tests.a4_preview_title')}</strong>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                    <input
                        type="checkbox"
                        checked={options.answerKey}
                        onChange={(e) => setOptions((o) => ({ ...o, answerKey: e.target.checked }))}
                    />
                    {t('tests.a4_answer_key')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                    <input
                        type="checkbox"
                        checked={options.showPoints}
                        onChange={(e) => setOptions((o) => ({ ...o, showPoints: e.target.checked }))}
                    />
                    {t('tests.a4_show_points')}
                </label>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={t('tests.a4_zoom_out')}
                    onClick={() => setZoomStep((z) => z - 1)}
                >
                    <ZoomOut size={14} />
                </button>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={t('tests.a4_zoom_in')}
                    onClick={() => setZoomStep((z) => z + 1)}
                >
                    <ZoomIn size={14} />
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={print}>
                    <Printer size={14} /> {t('tests.a4_print')}
                </button>
            </div>
            <div
                ref={viewportRef}
                style={{
                    overflow: 'auto',
                    maxHeight: 'calc(100vh - 170px)',
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                }}
            >
                <style>{`
                    .a4-page {
                        box-sizing: border-box;
                        width: ${PAGE_WIDTH_PX}px;
                        min-height: ${PAGE_HEIGHT_PX}px;
                        padding: ${PAGE_PADDING_PX}px;
                        margin: 0 auto;
                        background-color: #fff;
                        background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${PAGE_HEIGHT_PX - 2}px, #cbd5e1 ${PAGE_HEIGHT_PX - 2}px, #cbd5e1 ${PAGE_HEIGHT_PX}px);
                        color: #1e293b;
                        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
                        font-size: 13px;
                    }
                    .a4-preview-editable { position: relative; margin: 6px 0; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 4px 6px; }
                    .a4-preview-editable:focus-within { border-color: var(--accent); }
                    .a4-preview-editable-label { position: absolute; top: -9px; left: 8px; padding: 0 4px; background: #fff; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
                    .a4-page .tiptap-editor-content { color: #1e293b; min-height: 28px; padding: 6px 8px; font-size: 13px; }
                `}</style>
                <div style={{ width: PAGE_WIDTH_PX * scale, margin: '0 auto' }}>
                    <div className="a4-page" data-testid="a4-page" style={{ zoom: scale }}>
                        {editor(t('tests.a4_header_label'), 'printHeader', t('tests.a4_header_placeholder'))}
                        <div dangerouslySetInnerHTML={{ __html: sections.top }} />
                        {editor(t('tests.a4_intro_label'), 'printIntro', t('tests.a4_intro_placeholder'))}
                        <div dangerouslySetInnerHTML={{ __html: sections.questions }} />
                        {editor(t('tests.a4_footer_label'), 'printFooter', t('tests.a4_footer_placeholder'))}
                    </div>
                </div>
            </div>
            <p className="text-muted text-xs" style={{ margin: 0 }}>
                {t('tests.a4_preview_hint')}
            </p>
        </div>
    );
}
