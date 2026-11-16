import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import type { TestSettingsTab } from './TestSettingsDrawer';

export interface QuickJumpQuestion {
    id: string;
    /** The number the card and the outline show. */
    number: number;
    label: string;
    sectionTitle?: string;
}

interface Props {
    questions: QuickJumpQuestion[];
    sections: { id: string; title: string }[];
    onPickSection: (id: string) => void;
    settingsTabs: { tab: TestSettingsTab; label: string }[];
    onPickQuestion: (id: string) => void;
    onPickSettings: (tab: TestSettingsTab) => void;
    onClose: () => void;
}

interface Row {
    key: string;
    label: string;
    hint: string;
    pick: () => void;
}

/** Ctrl+K: type a number, a prompt or a section, or a settings tab, and go there. */
export default function BuilderQuickJump({
    questions,
    sections,
    settingsTabs,
    onPickQuestion,
    onPickSection,
    onPickSettings,
    onClose,
}: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const needle = query.trim().toLowerCase();

    const rows: Row[] = useMemo(() => {
        const matches = (text: string) => !needle || text.toLowerCase().includes(needle);
        const questionRows = questions
            .filter(
                (question) =>
                    matches(question.label) ||
                    matches(question.sectionTitle ?? '') ||
                    String(question.number) === needle
            )
            .map<Row>((question) => ({
                key: `question-${question.id}`,
                label: `${question.number}. ${question.label}`,
                hint: question.sectionTitle ?? '',
                pick: () => onPickQuestion(question.id),
            }));
        const sectionRows = sections
            .filter((section) => matches(section.title))
            .map<Row>((section) => ({
                key: `section-${section.id}`,
                label: section.title,
                hint: t('tests.quick_jump_section'),
                pick: () => onPickSection(section.id),
            }));
        const settingsRows = settingsTabs
            .filter((tab) => matches(tab.label) || matches(t('tests.settings_title')))
            .map<Row>((tab) => ({
                key: `settings-${tab.tab}`,
                label: tab.label,
                hint: t('tests.settings_title'),
                pick: () => onPickSettings(tab.tab),
            }));
        return [...questionRows, ...sectionRows, ...settingsRows];
    }, [questions, sections, settingsTabs, needle, onPickQuestion, onPickSection, onPickSettings, t]);

    const bounded = Math.min(active, Math.max(rows.length - 1, 0));
    const listRef = useRef<HTMLUListElement>(null);
    // Focus stays in the search box while the arrows move the highlight, so keep it on screen.
    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
    }, [bounded, rows.length]);

    function handleKeyDown(event: React.KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => (rows.length === 0 ? 0 : (current + 1) % rows.length));
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => (rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length));
            return;
        }
        // On a focused result Enter is that button's own click; only the search box needs the highlighted row.
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            const row = rows[bounded];
            if (row) row.pick();
        }
    }

    return (
        <Modal titleId="quick-jump-title" onClose={onClose} maxWidth={520}>
            <div className="modal-header">
                <h3 id="quick-jump-title">{t('tests.quick_jump_title')}</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                    {t('common.close')}
                </button>
            </div>
            <div className="modal-body" onKeyDown={handleKeyDown}>
                <input
                    type="search"
                    autoFocus
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActive(0);
                    }}
                    placeholder={t('tests.quick_jump_placeholder')}
                    aria-label={t('tests.quick_jump_placeholder')}
                    data-testid="quick-jump-input"
                    style={{ width: '100%', marginBottom: 12 }}
                />
                {rows.length === 0 ? (
                    <p className="text-muted text-xs" style={{ margin: 0 }}>
                        {t('tests.quick_jump_empty')}
                    </p>
                ) : (
                    <ul
                        ref={listRef}
                        role="listbox"
                        aria-label={t('tests.quick_jump_title')}
                        style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '50vh', overflowY: 'auto' }}
                    >
                        {rows.map((row, index) => (
                            <li key={row.key} role="none">
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={index === bounded}
                                    data-testid={row.key}
                                    onClick={row.pick}
                                    onMouseEnter={() => setActive(index)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        width: '100%',
                                        padding: '6px 8px',
                                        border: 'none',
                                        borderRadius: 6,
                                        background:
                                            index === bounded
                                                ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                                                : 'none',
                                        color: 'var(--text)',
                                        font: 'inherit',
                                        fontSize: '0.85rem',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span
                                        style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            flex: 1,
                                        }}
                                    >
                                        {row.label}
                                    </span>
                                    {row.hint && (
                                        <span className="text-muted text-xs" style={{ flexShrink: 0 }}>
                                            {row.hint}
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
