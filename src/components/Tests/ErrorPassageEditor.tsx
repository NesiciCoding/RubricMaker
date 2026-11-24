import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent } from '@tiptap/react';
import { Check, X } from 'lucide-react';
import {
    ERROR_PILL_CLASS,
    ErrorFragment,
    countFragmentsMissingCorrection,
    errorContentToPassage,
    passageToErrorContent,
} from '../Editor/ErrorFragmentExtension';
import { FLAT_PILL_STARTER_KIT, FlatPillEditorFrame } from '../Editor/flatPillEditor';

interface Props {
    passage: string;
    onChange: (passage: string) => void;
}

export default function ErrorPassageEditor({ passage, onChange }: Props) {
    const { t } = useTranslation();
    const [missing, setMissing] = useState(0);
    const extensions = useMemo(
        () => [
            FLAT_PILL_STARTER_KIT,
            ErrorFragment.configure({
                textLabel: t('tests.error_fragment_text_label'),
                isErrorLabel: t('tests.error_fragment_is_error'),
                correctionsLabel: t('tests.error_fragment_corrections_label'),
                addCorrectionLabel: t('tests.error_fragment_add_correction'),
                removeCorrectionLabel: t('tests.error_fragment_remove_correction'),
                saveLabel: t('tests.cloze_gap_save'),
                cancelLabel: t('tests.cloze_gap_cancel'),
                pillLabel: t('tests.error_fragment_pill_label'),
            }),
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    const editor = useEditor({
        extensions,
        content: passageToErrorContent(passage),
        onUpdate: ({ editor }) => {
            setMissing(countFragmentsMissingCorrection(editor));
            onChange(errorContentToPassage(editor));
        },
        editorProps: {
            attributes: { class: 'error-passage-editor-content', 'aria-label': t('tests.error_passage_label') },
        },
    });

    useEffect(() => {
        /* v8 ignore next -- useEditor initializes synchronously in this environment */
        if (!editor) return;
        if (errorContentToPassage(editor) === passage) return;
        editor.commands.setContent(passageToErrorContent(passage));
    }, [editor, passage]);

    /* v8 ignore next -- useEditor initializes synchronously in this environment */
    if (!editor) return null;

    const mark = (isError: boolean) => {
        editor.chain().focus().markSelectionAsErrorFragment(isError).run();
        if (!isError) return;
        // The selection lands just after the new pill; open its popover so the correction is entered at once.
        const pill = editor.view.nodeDOM(editor.state.selection.from - 1);
        if (pill instanceof HTMLElement) pill.click();
    };

    return (
        <FlatPillEditorFrame
            toolbar={
                <>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        // Keeps the selection: a blur on mousedown would make the mark wrap the wrong text.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => mark(true)}
                    >
                        <X size={14} /> {t('tests.error_mark_error')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => mark(false)}
                    >
                        <Check size={14} /> {t('tests.error_mark_correct')}
                    </button>
                </>
            }
            footer={
                <>
                    {missing > 0 && (
                        <p
                            role="alert"
                            className="text-xs"
                            style={{ margin: 0, padding: '0 10px 8px', color: 'var(--red-text)' }}
                        >
                            {t('tests.error_missing_corrections', { count: missing })}
                        </p>
                    )}
                </>
            }
            css={`
                .error-passage-editor-content {
                    outline: none;
                    min-height: 3em;
                    line-height: 1.9;
                    white-space: pre-wrap;
                }
                .${ERROR_PILL_CLASS} {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 1px 8px;
                    margin: 0 1px;
                    border-radius: 999px;
                    font-weight: 600;
                    cursor: pointer;
                    user-select: none;
                }
                .${ERROR_PILL_CLASS}.error {
                    background: color-mix(in srgb, var(--red) 16%, transparent);
                    color: var(--red);
                }
                .${ERROR_PILL_CLASS}.error.missing {
                    outline: 2px dashed var(--red);
                }
                .${ERROR_PILL_CLASS}.fine {
                    background: color-mix(in srgb, var(--green) 18%, transparent);
                    color: var(--green);
                }
                .error-fragment-hint {
                    font-weight: 500;
                    font-size: 0.8em;
                    opacity: 0.85;
                }
                .error-fragment-popover-section,
                .error-fragment-popover-list {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .error-fragment-popover-row {
                    display: flex;
                    gap: 6px;
                }
                .error-fragment-popover-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .error-fragment-popover-input {
                    box-sizing: border-box;
                    flex: 1;
                    width: 100%;
                    padding: 6px 8px;
                    font-size: 0.85rem;
                    color: var(--text);
                    background: var(--bg);
                    border: 1px solid var(--border);
                    border-radius: 6px;
                }
                .error-fragment-popover-checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    color: var(--text);
                    cursor: pointer;
                }
                .error-fragment-popover-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 6px;
                }
                .error-fragment-popover button {
                    padding: 4px 10px;
                    font-size: 0.8rem;
                    color: var(--text);
                    background: var(--bg-panel);
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    cursor: pointer;
                }
                .error-fragment-popover-save {
                    background: var(--accent) !important;
                    border-color: var(--accent) !important;
                    color: #fff !important;
                }
            `}
        >
            <EditorContent editor={editor} />
        </FlatPillEditorFrame>
    );
}
