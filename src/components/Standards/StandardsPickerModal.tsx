import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, Link2, AlertCircle, Loader, BookOpen, Star } from 'lucide-react';
import {
    fetchJurisdictions, fetchStandardSets, fetchStandardSetDetail, flattenStandards,
    type CspJurisdiction, type CspStandardSet, type CspStandard,
} from '../../services/standardsApi';
import type { LinkedStandard } from '../../types';
import { useApp } from '../../context/AppContext';

interface Props {
    apiKey: string;
    onSelect: (std: LinkedStandard) => void;
    onClose: () => void;
}

type Step = 'jurisdiction' | 'set' | 'standard';
type View = 'browse' | 'favorites';

export default function StandardsPickerModal({ apiKey, onSelect, onClose }: Props) {
    const { favoriteStandards, addFavoriteStandard, removeFavoriteStandard, isFavoriteStandard } = useApp();

    const [view, setView] = useState<View>('browse');
    const [step, setStep] = useState<Step>('jurisdiction');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [jurisdictions, setJurisdictions] = useState<CspJurisdiction[]>([]);
    const [selectedJurisdiction, setSelectedJurisdiction] = useState<CspJurisdiction | null>(null);

    const [standardSets, setStandardSets] = useState<CspStandardSet[]>([]);
    const [selectedSet, setSelectedSet] = useState<CspStandardSet | null>(null);

    const [standards, setStandards] = useState<CspStandard[]>([]);
    const [search, setSearch] = useState('');

    // Load jurisdictions on mount
    useEffect(() => {
        if (view === 'browse' && step === 'jurisdiction' && jurisdictions.length === 0) {
            setLoading(true);
            fetchJurisdictions(apiKey)
                .then(data => { setJurisdictions(data); setLoading(false); })
                .catch(e => { setError(e.message); setLoading(false); });
        }
    }, [apiKey, view, step, jurisdictions.length]);

    async function selectJurisdiction(j: CspJurisdiction) {
        setSelectedJurisdiction(j);
        setStep('set');
        setLoading(true);
        setError('');
        try {
            const sets = await fetchStandardSets(apiKey, j.id);
            setStandardSets(sets);
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    async function selectSet(s: CspStandardSet) {
        setSelectedSet(s);
        setStep('standard');
        setLoading(true);
        setError('');
        try {
            const detail = await fetchStandardSetDetail(apiKey, s.id);
            setStandards(flattenStandards(detail.standards));
        } catch (e: any) {
            setError(e.message);
        }
        setLoading(false);
    }

    function pickLinkedStandard(std: LinkedStandard) {
        onSelect(std);
        onClose();
    }

    function pickCspStandard(std: CspStandard) {
        const linked: LinkedStandard = {
            guid: std.id,
            statementNotation: std.statementNotation,
            description: std.description,
            standardSetTitle: selectedSet?.title ?? '',
            jurisdictionTitle: selectedJurisdiction?.title ?? '',
        };
        onSelect(linked);
        onClose();
    }

    function toggleFav(std: CspStandard, e: React.MouseEvent) {
        e.stopPropagation();
        if (isFavoriteStandard(std.id)) {
            removeFavoriteStandard(std.id);
        } else {
            addFavoriteStandard({
                guid: std.id,
                statementNotation: std.statementNotation,
                description: std.description,
                standardSetTitle: selectedSet?.title ?? '',
                jurisdictionTitle: selectedJurisdiction?.title ?? '',
                ancestorIds: std.ancestorIds,
                depth: std.depth,
            });
        }
    }

    const filteredBrowse = useMemo(() =>
        search.trim()
            ? standards.filter(s =>
                s.description.toLowerCase().includes(search.toLowerCase()) ||
                (s.statementNotation ?? '').toLowerCase().includes(search.toLowerCase())
            )
            : standards,
        [standards, search]
    );

    const filteredFavorites = useMemo(() =>
        search.trim()
            ? favoriteStandards.filter(s =>
                s.description.toLowerCase().includes(search.toLowerCase()) ||
                (s.statementNotation ?? '').toLowerCase().includes(search.toLowerCase())
            )
            : favoriteStandards,
        [favoriteStandards, search]
    );

    const sortedFavorites = useMemo(() => {
        if (filteredFavorites.length === 0) return [];
        // Adapt LinkedStandard to CspStandard structure for sorting
        const map: Record<string, CspStandard> = {};
        filteredFavorites.forEach(f => {
            map[f.guid] = {
                id: f.guid,
                description: f.description,
                statementNotation: f.statementNotation,
                depth: f.depth ?? 0,
                ancestorIds: f.ancestorIds ?? [],
            };
        });
        const sortedCsp = flattenStandards(map);
        const favMap = new Map(filteredFavorites.map(f => [f.guid, f]));
        return sortedCsp.map(s => favMap.get(s.id)!).filter(Boolean);
    }, [filteredFavorites]);

    // Breadcrumb step title
    const steps: { key: Step; label: string }[] = [
        { key: 'jurisdiction', label: selectedJurisdiction?.title ?? 'Jurisdiction' },
        { key: 'set', label: selectedSet?.title ?? 'Standard Set' },
        { key: 'standard', label: 'Pick Standard' },
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ width: 800, height: '85vh', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BookOpen size={20} style={{ color: 'var(--accent)' }} />
                            <h3>Link Standard</h3>
                        </div>
                        {/* View Toggles */}
                        <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 6, padding: 2, marginLeft: 16 }}>
                            <button
                                className={`btn btn-sm ${view === 'browse' ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                onClick={() => setView('browse')}
                                style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                                Browse
                            </button>
                            <button
                                className={`btn btn-sm ${view === 'favorites' ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                onClick={() => setView('favorites')}
                                style={{ fontSize: '0.8rem', padding: '4px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
                                <Star size={12} fill={view === 'favorites' ? 'var(--yellow)' : 'none'} color={view === 'favorites' ? 'var(--yellow)' : 'currentColor'} />
                                Favorites ({favoriteStandards.length})
                            </button>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                {/* Browse Breadcrumb */}
                {view === 'browse' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '10px 20px', background: 'var(--bg-elevated)', flexShrink: 0, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                        {steps.map((s, i) => (
                            <React.Fragment key={s.key}>
                                {i > 0 && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                                <button
                                    className={`btn btn-ghost btn-sm ${s.key === step ? '' : 'text-muted'}`}
                                    style={{ padding: '2px 6px', fontSize: '0.8rem', opacity: i < steps.findIndex(x => x.key === step) ? 1 : 0.5 }}
                                    disabled={i >= steps.findIndex(x => x.key === step)}
                                    onClick={() => {
                                        if (i === 0) { setStep('jurisdiction'); setSelectedSet(null); setSelectedJurisdiction(null); }
                                        if (i === 1 && selectedJurisdiction) setStep('set');
                                    }}
                                >
                                    {s.label}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* Search Bar (shared for favorites or standard list) */}
                {((view === 'browse' && step === 'standard') || view === 'favorites') && (
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" placeholder={view === 'favorites' ? "Search favorites..." : "Search in current set..."}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ paddingLeft: 32, width: '100%' }} />
                        </div>
                    </div>
                )}

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                    {error && (
                        <div style={{ padding: 20 }}>
                            <div style={{ background: 'var(--red-subtle)', border: '1px solid var(--red)', borderRadius: 8, padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <AlertCircle size={16} style={{ color: 'var(--red)', marginTop: 1, flexShrink: 0 }} />
                                <div className="text-sm">
                                    <strong>API Error:</strong> {error}
                                    {error.includes('403') || error.includes('401')
                                        ? <div style={{ marginTop: 4 }}>Check your API key in Settings, and make sure your origin is added to the <a href="https://commonstandardsproject.com/developers" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>CSP CORS allowlist</a>.</div>
                                        : null}
                                </div>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                            <Loader size={24} className="spin" style={{ color: 'var(--accent)' }} />
                        </div>
                    )}

                    {/* VIEW: FAVORITES */}
                    {!loading && view === 'favorites' && (
                        <div style={{ padding: '10px 0' }}>
                            {favoriteStandards.length === 0 && (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                    <Star size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                                    <p>No favorites yet.</p>
                                    <p className="text-sm" style={{ marginTop: 8 }}>Star standards in the Browse tab to save them here.</p>
                                </div>
                            )}
                            {filteredFavorites.length === 0 && favoriteStandards.length > 0 && (
                                <div className="text-muted text-sm" style={{ padding: 20, textAlign: 'center' }}>No favorites match your search.</div>
                            )}
                            {sortedFavorites.map(std => (
                                <div key={std.guid} className="standard-row" style={{
                                    padding: `12px 20px 12px ${20 + (std.depth ?? 0) * 20}px`,
                                    borderBottom: '1px solid var(--border)',
                                    display: 'flex', gap: 12, alignItems: 'flex-start',
                                    background: 'var(--bg-card)'
                                }}>
                                    <button className="btn btn-ghost btn-icon btn-sm"
                                        onClick={() => removeFavoriteStandard(std.guid)}
                                        style={{ flexShrink: 0, marginTop: 2, color: 'var(--yellow)' }}>
                                        <Star size={16} fill="currentColor" />
                                    </button>
                                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => pickLinkedStandard(std)}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                {std.statementNotation && (
                                                    <span className="badge badge-blue" style={{ flexShrink: 0, color: 'var(--accent)' }}>{std.statementNotation}</span>
                                                )}
                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    {std.jurisdictionTitle} › {std.standardSetTitle}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'normal', color: 'var(--text)' }}>
                                                {std.description}
                                            </div>
                                        </div>
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={() => pickLinkedStandard(std)}>
                                        Select
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* VIEW: BROWSE */}
                    {!loading && view === 'browse' && (
                        <>
                            {/* Step 1: Jurisdiction */}
                            {step === 'jurisdiction' && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: 20 }}>
                                    {jurisdictions.map(j => (
                                        <button key={j.id} className="card-hover"
                                            style={{
                                                textAlign: 'left', padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)',
                                                display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.2s', cursor: 'pointer'
                                            }}
                                            onClick={() => selectJurisdiction(j)}>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{j.title}</div>
                                            <div className="text-xs text-muted">{j.type}</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Step 2: Standard Sets */}
                            {step === 'set' && (
                                <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0' }}>
                                    {standardSets.map(s => (
                                        <button key={s.id} className="btn btn-ghost"
                                            style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '14px 20px', height: 'auto', borderBottom: '1px solid var(--border-subtle)' }}
                                            onClick={() => selectSet(s)}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.title}</div>
                                                <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                                                    {s.subject}{s.educationLevels?.length ? ` · ${s.educationLevels.join(', ')}` : ''}
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-muted" style={{ marginLeft: 'auto' }} />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Step 3: Standards list */}
                            {step === 'standard' && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {filteredBrowse.map(std => {
                                        const isFav = isFavoriteStandard(std.id);
                                        return (
                                            <div key={std.id} style={{
                                                padding: `12px 20px 12px ${20 + std.depth * 20}px`,
                                                borderBottom: '1px solid var(--border-subtle)',
                                                display: 'flex', gap: 12, alignItems: 'flex-start',
                                                background: 'var(--bg-card)'
                                            }}>
                                                <button className="btn btn-ghost btn-icon btn-sm"
                                                    onClick={(e) => toggleFav(std, e)}
                                                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                                                    style={{ flexShrink: 0, marginTop: 2, color: isFav ? 'var(--yellow)' : 'var(--text-dim)' }}>
                                                    <Star size={16} fill={isFav ? "currentColor" : "none"} />
                                                </button>

                                                <div style={{ flex: 1, cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}
                                                    onClick={() => pickCspStandard(std)}>

                                                    {std.statementNotation && (
                                                        <span className="badge badge-blue" style={{ flexShrink: 0, marginTop: 1, fontSize: '0.75rem' }}>
                                                            {std.statementNotation}
                                                        </span>
                                                    )}

                                                    <span style={{ fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'normal', color: 'var(--text)' }}>
                                                        {std.description}
                                                    </span>
                                                </div>

                                                <button className="btn btn-ghost btn-icon btn-sm text-accent"
                                                    onClick={() => pickCspStandard(std)}>
                                                    <Link2 size={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {filteredBrowse.length === 0 && !loading && (
                                        <div className="text-muted text-sm" style={{ padding: 20, textAlign: 'center' }}>No standards match your search.</div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
