import { useTranslation } from 'react-i18next';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';
import { ListTree } from 'lucide-react';

interface TableOfContentsSidebarProps {
    data: TableOfContentData;
}

/** Read-only heading outline for long-form documents (essays, reading passages) — roadmap Phase 26.4. */
export default function TableOfContentsSidebar({ data }: TableOfContentsSidebarProps) {
    const { t } = useTranslation();
    if (data.length === 0) return null;

    return (
        <div
            style={{
                width: 200,
                flexShrink: 0,
                borderLeft: '1px solid var(--border)',
                padding: '10px 12px',
                fontSize: '0.8rem',
                maxHeight: 420,
                overflowY: 'auto',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    letterSpacing: '0.03em',
                }}
            >
                <ListTree size={13} /> {t('editor.tableOfContents')}
            </div>
            {data.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => item.dom.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '3px 0',
                        paddingLeft: (item.level - 1) * 10,
                        color: item.isActive ? 'var(--accent)' : 'var(--text)',
                        fontWeight: item.isActive ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                    title={item.textContent}
                >
                    {item.textContent || t('editor.untitledHeading')}
                </button>
            ))}
        </div>
    );
}
