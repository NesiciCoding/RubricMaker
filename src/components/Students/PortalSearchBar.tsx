import React from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PortalSearchResult } from '../../utils/portalSearch';

interface Props {
    query: string;
    onQueryChange: (value: string) => void;
    results: PortalSearchResult[];
    onSelect: (result: PortalSearchResult) => void;
}

export default function PortalSearchBar({ query, onQueryChange, results, onSelect }: Props) {
    const { t } = useTranslation();

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'relative' }}>
                <Search
                    size={15}
                    style={{
                        position: 'absolute',
                        left: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                    }}
                    aria-hidden="true"
                />
                <input
                    className="input"
                    style={{ paddingLeft: 32, width: '100%' }}
                    placeholder={t('studentPortal.search_placeholder')}
                    aria-label={t('studentPortal.search_placeholder')}
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                />
            </div>
            {query.trim() !== '' && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                        maxHeight: 260,
                        overflowY: 'auto',
                        zIndex: 20,
                    }}
                >
                    {results.length === 0 ? (
                        <div className="text-muted text-sm" style={{ padding: '12px 14px' }}>
                            {t('search.no_results')}
                        </div>
                    ) : (
                        results.map((result) => (
                            <button
                                key={`${result.type}-${result.id}`}
                                type="button"
                                onClick={() => onSelect(result)}
                                style={{
                                    width: '100%',
                                    display: 'block',
                                    textAlign: 'left',
                                    padding: '8px 14px',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    color: 'var(--text)',
                                }}
                            >
                                {result.label}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
