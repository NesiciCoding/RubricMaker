import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Plus, Trash2, GripVertical, Save, ChevronUp, ChevronDown,
    Settings, Eye, ArrowLeft, Link2, BookOpen, X, ChevronRight, FileDown, FileText,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import type {
    Rubric, RubricCriterion, RubricLevel, RubricFormat, SubItem,
    LinkedStandard, ScoringMode,
} from '../types';
import { DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';
import StandardsPickerModal from '../components/Standards/StandardsPickerModal';
import { exportRubricGridPdf } from '../utils/pdfExport';
import { exportRubricToDocx } from '../utils/docxExport';

function newLevel(min = 0, max = 0, label = ''): RubricLevel {
    return {
        id: nanoid(), label, minPoints: min, maxPoints: max, description: '', subItems: [],
    };
}

function newCriterion(): RubricCriterion {
    return {
        id: nanoid(),
        title: 'New Criterion',
        description: '',
        weight: 25,
        levels: [
            { id: nanoid(), label: 'Excellent', minPoints: 4, maxPoints: 4, description: '', subItems: [] },
            { id: nanoid(), label: 'Good', minPoints: 3, maxPoints: 3, description: '', subItems: [] },
            { id: nanoid(), label: 'Adequate', minPoints: 2, maxPoints: 2, description: '', subItems: [] },
            { id: nanoid(), label: 'Poor', minPoints: 1, maxPoints: 1, description: '', subItems: [] },
        ],
    };
}

export default function RubricBuilder() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { rubrics, addRubric, updateRubric, gradeScales, settings } = useApp();

    const existing = id ? rubrics.find(r => r.id === id) : undefined;

    const [name, setName] = useState(existing?.name ?? '');
    const [subject, setSubject] = useState(existing?.subject ?? '');
    const [description, setDescription] = useState(existing?.description ?? '');
    const [criteria, setCriteria] = useState<RubricCriterion[]>(existing?.criteria ?? [newCriterion()]);
    const [gradeScaleId, setGradeScaleId] = useState(existing?.gradeScaleId ?? settings.defaultGradeScaleId);
    const [format, setFormat] = useState<RubricFormat>(existing?.format ?? DEFAULT_FORMAT);
    const [scoringMode, setScoringMode] = useState<ScoringMode>(existing?.scoringMode ?? 'weighted-percentage');
    const [totalMaxPoints, setTotalMaxPoints] = useState(existing?.totalMaxPoints ?? 100);
    const [showFormat, setShowFormat] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expandedSubItems, setExpandedSubItems] = useState<Set<string>>(new Set());
    const [pickingStandardFor, setPickingStandardFor] = useState<string | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const getRubricData = useCallback((): Rubric => ({
        id: existing?.id ?? 'temp',
        name: name || 'Untitled Rubric',
        subject, description, criteria, gradeScaleId, format,
        scoringMode, totalMaxPoints,
        attachmentIds: existing?.attachmentIds ?? [],
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }), [existing, name, subject, description, criteria, gradeScaleId, format, scoringMode, totalMaxPoints]);

    const handleExport = async (type: 'pdf' | 'docx') => {
        setShowExportMenu(false);
        const rubric = getRubricData();
        if (type === 'pdf') {
            await exportRubricGridPdf(rubric);
        } else {
            await exportRubricToDocx(rubric);
        }
    };

    const handleSave = useCallback(() => {
        const rubricData = {
            name: name || 'Untitled Rubric',
            subject, description, criteria, gradeScaleId, format,
            scoringMode, totalMaxPoints,
            attachmentIds: existing?.attachmentIds ?? [],
        };
        if (existing) {
            updateRubric({ ...existing, ...rubricData });
        } else {
            const newR = addRubric(rubricData);
            navigate(`/rubrics/${newR.id}`, { replace: true });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [name, subject, description, criteria, gradeScaleId, format, scoringMode, totalMaxPoints,
        existing, addRubric, updateRubric, navigate]);

    // ── Criterion operations ────────────────────────────────────────────────────
    function moveCriterion(idx: number, dir: -1 | 1) {
        const next = [...criteria];
        const swap = idx + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setCriteria(next);
    }
    function deleteCriterion(cid: string) { setCriteria(c => c.filter(x => x.id !== cid)); }
    function updateCriterion(cid: string, patch: Partial<RubricCriterion>) {
        setCriteria(c => c.map(x => x.id === cid ? { ...x, ...patch } : x));
    }

    // ── Level operations ────────────────────────────────────────────────────────
    function addLevel(cid: string) {
        setCriteria(c => c.map(x => x.id === cid
            ? { ...x, levels: [...x.levels, newLevel(0, 0, 'New Level')] }
            : x
        ));
    }
    function deleteLevel(cid: string, lid: string) {
        setCriteria(c => c.map(x => x.id === cid
            ? { ...x, levels: x.levels.filter(l => l.id !== lid) }
            : x
        ));
    }
    function updateLevel(cid: string, lid: string, patch: Partial<RubricLevel>) {
        setCriteria(c => c.map(x => x.id === cid
            ? { ...x, levels: x.levels.map(l => l.id === lid ? { ...l, ...patch } : l) }
            : x
        ));
    }

    // ── Sub-item operations ─────────────────────────────────────────────────────
    function addSubItem(cid: string, lid: string) {
        setCriteria(c => c.map(x => x.id === cid
            ? {
                ...x, levels: x.levels.map(l => l.id === lid
                    ? { ...l, subItems: [...l.subItems, { id: nanoid(), label: '', points: 1 }] }
                    : l
                )
            }
            : x
        ));
    }
    function updateSubItem(cid: string, lid: string, sid: string, patch: Partial<SubItem>) {
        setCriteria(c => c.map(x => x.id === cid
            ? {
                ...x, levels: x.levels.map(l => l.id === lid
                    ? { ...l, subItems: l.subItems.map(s => s.id === sid ? { ...s, ...patch } : s) }
                    : l
                )
            }
            : x
        ));
    }
    function deleteSubItem(cid: string, lid: string, sid: string) {
        setCriteria(c => c.map(x => x.id === cid
            ? {
                ...x, levels: x.levels.map(l => l.id === lid
                    ? { ...l, subItems: l.subItems.filter(s => s.id !== sid) }
                    : l
                )
            }
            : x
        ));
    }

    function toggleSubItems(levelKey: string) {
        setExpandedSubItems(prev => {
            const next = new Set(prev);
            next.has(levelKey) ? next.delete(levelKey) : next.add(levelKey);
            return next;
        });
    }

    // ── Standards linking ───────────────────────────────────────────────────────
    function linkStandard(cid: string, std: LinkedStandard) {
        updateCriterion(cid, { linkedStandard: std });
    }
    function unlinkStandard(cid: string) {
        setCriteria(c => c.map(x => {
            if (x.id !== cid) return x;
            const { linkedStandard, ...rest } = x;
            return rest;
        }));
    }

    return (
        <>
            <Topbar
                title={id ? 'Edit Rubric' : 'New Rubric'}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rubrics')}>
                            <ArrowLeft size={15} /> Back
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowFormat(!showFormat)}>
                            <Settings size={15} /> Format
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(!showPreview)}>
                            <Eye size={15} /> Preview
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowExportMenu(!showExportMenu)}>
                                <FileDown size={15} /> Export
                            </button>
                            {showExportMenu && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setShowExportMenu(false)} />
                                    <div className="card" style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                        padding: 4, minWidth: 160, zIndex: 10,
                                        display: 'flex', flexDirection: 'column', gap: 2
                                    }}>
                                        <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => handleExport('pdf')}>
                                            <FileText size={14} /> Export PDF
                                        </button>
                                        <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => handleExport('docx')}>
                                            <FileText size={14} /> Export Word
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} /> {saved ? 'Saved!' : 'Save'}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: showFormat ? '1fr 300px' : '1fr', gap: 24 }}>
                    <div>
                        {/* Rubric Meta */}
                        <div className="card" style={{ marginBottom: 20 }}>
                            <h3 style={{ marginBottom: 16 }}>Rubric Details</h3>
                            <div className="grid-2" style={{ gap: 12 }}>
                                <div className="form-group">
                                    <label>Rubric Name *</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Essay Rubric" />
                                </div>
                                <div className="form-group">
                                    <label>Subject</label>
                                    <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. English Literature" />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: 12 }}>
                                <label>Description</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description…" rows={2} />
                            </div>
                            <div className="grid-2" style={{ gap: 12, marginTop: 12 }}>
                                <div className="form-group">
                                    <label>Grade Scale</label>
                                    <select value={gradeScaleId} onChange={e => setGradeScaleId(e.target.value)}>
                                        {gradeScales.map(gs => <option key={gs.id} value={gs.id}>{gs.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* ── Scoring mode ── */}
                            <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginTop: 16, border: '1px solid var(--border)' }}>
                                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text)' }}>Scoring Mode</h4>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {(['weighted-percentage', 'total-points'] as ScoringMode[]).map(mode => (
                                        <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: scoringMode === mode ? 600 : 400 }}>
                                            <input type="radio" name="scoringMode" value={mode} checked={scoringMode === mode} onChange={() => setScoringMode(mode)} />
                                            {mode === 'weighted-percentage' ? 'Weighted Percentage (auto)' : 'Fixed Total Points'}
                                        </label>
                                    ))}
                                </div>
                                {scoringMode === 'total-points' && (
                                    <div className="form-group" style={{ marginTop: 12, maxWidth: 200 }}>
                                        <label>Total Max Points</label>
                                        <input type="number" min={1} value={totalMaxPoints}
                                            onChange={e => setTotalMaxPoints(Number(e.target.value))}
                                            placeholder="e.g. 100" />
                                        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                                            Grade = rawScore / {totalMaxPoints} × 100%
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Criteria */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <h2>Criteria</h2>
                            <button className="btn btn-primary btn-sm" onClick={() => setCriteria(c => [...c, newCriterion()])}>
                                <Plus size={15} /> Add Criterion
                            </button>
                        </div>

                        {criteria.map((criterion, cIdx) => (
                            <div key={criterion.id} className="card" style={{ marginBottom: 16 }}>
                                {/* Criterion header */}
                                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveCriterion(cIdx, -1)} disabled={cIdx === 0}><ChevronUp size={14} /></button>
                                        <GripVertical size={16} style={{ color: 'var(--text-dim)', alignSelf: 'center' }} />
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveCriterion(cIdx, 1)} disabled={cIdx === criteria.length - 1}><ChevronDown size={14} /></button>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div className="grid-2" style={{ gap: 10, gridTemplateColumns: '1fr 1fr auto' }}>
                                            <div className="form-group">
                                                <label>Criterion Title</label>
                                                <input type="text" value={criterion.title}
                                                    onChange={e => updateCriterion(criterion.id, { title: e.target.value })}
                                                    placeholder="e.g. Content Quality" />
                                            </div>
                                            <div className="form-group">
                                                <label>Description (optional)</label>
                                                <input type="text" value={criterion.description}
                                                    onChange={e => updateCriterion(criterion.id, { description: e.target.value })}
                                                    placeholder="Additional details…" />
                                            </div>
                                            <div className="form-group">
                                                <label>Weight %</label>
                                                <input type="number" value={criterion.weight} min={0} max={100}
                                                    onChange={e => updateCriterion(criterion.id, { weight: Number(e.target.value) })}
                                                    style={{ width: 70 }} />
                                            </div>
                                        </div>

                                        {/* Standard link */}
                                        <div style={{ marginTop: 8 }}>
                                            {criterion.linkedStandard ? (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem' }}>
                                                    <BookOpen size={13} style={{ color: 'var(--accent)' }} />
                                                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                                        {criterion.linkedStandard.statementNotation ?? criterion.linkedStandard.guid}
                                                    </span>
                                                    <span style={{ color: 'var(--text)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {criterion.linkedStandard.description}
                                                    </span>
                                                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--text-muted)', padding: 2 }}
                                                        onClick={() => unlinkStandard(criterion.id)}>
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}
                                                    onClick={() => setPickingStandardFor(criterion.id)}>
                                                    <Link2 size={13} /> Link Standard
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)', marginTop: 20 }}
                                        onClick={() => deleteCriterion(criterion.id)}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>

                                {/* Levels */}
                                <div style={{ overflowX: 'auto' }}>
                                    <div style={{ display: 'flex', gap: 10, minWidth: 'max-content', paddingBottom: 4 }}>
                                        {criterion.levels.map((level) => {
                                            const levelKey = `${criterion.id}_${level.id}`;
                                            const subExpanded = expandedSubItems.has(levelKey);
                                            return (
                                                <div key={level.id} style={{
                                                    width: 210, flexShrink: 0, background: 'var(--bg-elevated)',
                                                    border: '1px solid var(--border)', borderRadius: 8, padding: 12,
                                                }}>
                                                    {/* Level label + delete */}
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                                        <input type="text" value={level.label}
                                                            onChange={e => updateLevel(criterion.id, level.id, { label: e.target.value })}
                                                            style={{ flex: 1, fontWeight: 600 }} placeholder="Level name" />
                                                        {criterion.levels.length > 1 && (
                                                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                                                onClick={() => deleteLevel(criterion.id, level.id)}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Min/Max points */}
                                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Min pts</div>
                                                            <input type="number" value={level.minPoints} min={0}
                                                                onChange={e => updateLevel(criterion.id, level.id, { minPoints: Number(e.target.value) })} />
                                                        </div>
                                                        <span style={{ color: 'var(--text-muted)', paddingTop: 16 }}>–</span>
                                                        <div style={{ flex: 1 }}>
                                                            <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Max pts</div>
                                                            <input type="number" value={level.maxPoints} min={0}
                                                                onChange={e => updateLevel(criterion.id, level.id, { maxPoints: Number(e.target.value) })} />
                                                        </div>
                                                    </div>

                                                    {/* Description */}
                                                    <textarea value={level.description}
                                                        onChange={e => updateLevel(criterion.id, level.id, { description: e.target.value })}
                                                        placeholder="Describe this level…"
                                                        rows={3}
                                                        style={{ fontSize: '0.8rem', width: '100%', marginBottom: 8 }} />

                                                    {/* Sub-items toggle */}
                                                    <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'space-between' }}
                                                        onClick={() => toggleSubItems(levelKey)}>
                                                        <span style={{ fontSize: '0.78rem' }}>
                                                            Sub-items ({level.subItems.length})
                                                        </span>
                                                        <ChevronRight size={13} style={{ transform: subExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                                    </button>

                                                    {subExpanded && (
                                                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {level.subItems.map(si => (
                                                                <div key={si.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                                    <input type="text" value={si.label}
                                                                        onChange={e => updateSubItem(criterion.id, level.id, si.id, { label: e.target.value })}
                                                                        placeholder="Sub-item label…"
                                                                        style={{ flex: 1, fontSize: '0.78rem' }} />
                                                                    <input type="number" value={si.points} min={0}
                                                                        onChange={e => updateSubItem(criterion.id, level.id, si.id, { points: Number(e.target.value) })}
                                                                        style={{ width: 46, fontSize: '0.78rem' }}
                                                                        title="Points for this sub-item" />
                                                                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }}
                                                                        onClick={() => deleteSubItem(criterion.id, level.id, si.id)}>
                                                                        <Trash2 size={11} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }}
                                                                onClick={() => addSubItem(criterion.id, level.id)}>
                                                                <Plus size={12} /> Add Sub-item
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <div style={{ width: 210, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => addLevel(criterion.id)}>
                                                <Plus size={14} /> Add Level
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {criteria.length === 0 && (
                            <div className="empty-state">
                                <p>No criteria added yet.</p>
                                <button className="btn btn-primary" onClick={() => setCriteria([newCriterion()])}>
                                    <Plus size={16} /> Add First Criterion
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Format Panel */}
                    {showFormat && (
                        <div className="card" style={{ height: 'fit-content', position: 'sticky', top: 0 }}>
                            <h3 style={{ marginBottom: 16 }}>Formatting</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {[
                                    { label: 'Criterion Col Width (px)', key: 'criterionColWidth', min: 120, max: 400 },
                                    { label: 'Level Col Width (px)', key: 'levelColWidth', min: 100, max: 400 },
                                    { label: 'Font Size (px)', key: 'fontSize', min: 10, max: 20 },
                                ].map(({ label, key, min, max }) => (
                                    <div className="form-group" key={key}>
                                        <label>{label}</label>
                                        <input type="number" value={(format as any)[key]} min={min} max={max}
                                            onChange={e => setFormat(f => ({ ...f, [key]: Number(e.target.value) }))} />
                                    </div>
                                ))}
                                {[
                                    { label: 'Header Background', key: 'headerColor' },
                                    { label: 'Header Text Color', key: 'headerTextColor' },
                                    { label: 'Accent / Selected Color', key: 'accentColor' },
                                ].map(({ label, key }) => (
                                    <div className="form-group" key={key}>
                                        <label>{label}</label>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input type="color" value={(format as any)[key]}
                                                onChange={e => setFormat(f => ({ ...f, [key]: e.target.value }))}
                                                style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6 }} />
                                            <input type="text" value={(format as any)[key]}
                                                onChange={e => setFormat(f => ({ ...f, [key]: e.target.value }))}
                                                style={{ flex: 1 }} />
                                        </div>
                                    </div>
                                ))}
                                <div className="form-group">
                                    <label>Level Order</label>
                                    <select value={format.levelOrder}
                                        onChange={e => setFormat(f => ({ ...f, levelOrder: e.target.value as 'best-first' | 'worst-first' }))}>
                                        <option value="best-first">Best → Worst (left to right)</option>
                                        <option value="worst-first">Worst → Best (left to right)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {[
                                        { label: 'Show criterion weights', key: 'showWeights' },
                                        { label: 'Show point values', key: 'showPoints' },
                                    ].map(({ label, key }) => (
                                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                                            <input type="checkbox" checked={(format as any)[key]}
                                                onChange={e => setFormat(f => ({ ...f, [key]: e.target.checked }))} />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={() => setFormat(DEFAULT_FORMAT)}>
                                    Reset to Defaults
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Modal */}
                {showPreview && (
                    <div className="modal-overlay" onClick={() => setShowPreview(false)}>
                        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3>Rubric Preview</h3>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview(false)}>✕ Close</button>
                            </div>
                            <RubricPreviewTable name={name || 'Untitled'} criteria={criteria} format={format} />
                        </div>
                    </div>
                )}

                {/* Standards Picker Modal */}
                {pickingStandardFor && settings.standardsApiKey ? (
                    <StandardsPickerModal
                        apiKey={settings.standardsApiKey}
                        onSelect={(std) => { linkStandard(pickingStandardFor, std); setPickingStandardFor(null); }}
                        onClose={() => setPickingStandardFor(null)}
                    />
                ) : pickingStandardFor && !settings.standardsApiKey ? (
                    <div className="modal-overlay" onClick={() => setPickingStandardFor(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                            <div className="modal-header">
                                <h3><BookOpen size={16} /> Standards Integration</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setPickingStandardFor(null)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 12 }}>To link academic standards you need a <strong>Common Standards Project API key</strong>.</p>
                                <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: '0.9rem' }}>
                                    <li>Register at <a href="https://commonstandardsproject.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>commonstandardsproject.com</a></li>
                                    <li>Copy your API key from the developer dashboard</li>
                                    <li>Add your app URL to the <strong>CORS Allowed Origins</strong> list</li>
                                    <li>Paste the key in <strong>Settings → Standards Integration</strong></li>
                                </ol>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setPickingStandardFor(null)}>Close</button>
                                <button className="btn btn-primary" onClick={() => { setPickingStandardFor(null); navigate('/settings'); }}>
                                    Open Settings
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );
}

function RubricPreviewTable({ name, criteria, format }: { name: string; criteria: RubricCriterion[]; format: RubricFormat }) {
    const headers = criteria[0]?.levels ?? [];
    return (
        <div style={{ fontFamily: format.fontFamily, fontSize: format.fontSize }}>
            <h2 style={{ marginBottom: 12 }}>{name}</h2>
            <table className="rubric-grid" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr style={{ background: format.headerColor, color: format.headerTextColor }}>
                        <th style={{ width: format.criterionColWidth, textAlign: 'left' }}>Criterion</th>
                        {headers.map(h => (
                            <th key={h.id} style={{ width: format.levelColWidth }}>
                                {h.label}
                                {format.showPoints ? ` (${h.minPoints}${h.minPoints !== h.maxPoints ? `–${h.maxPoints}` : ''}pts)` : ''}
                            </th>
                        ))}
                        {format.showWeights && <th style={{ width: 80 }}>Weight</th>}
                    </tr>
                </thead>
                <tbody>
                    {criteria.map(c => (
                        <tr key={c.id}>
                            <td className="criterion-cell">
                                <div style={{ fontWeight: 600 }}>{c.title}</div>
                                {c.description && <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 4 }}>{c.description}</div>}
                                {c.linkedStandard && (
                                    <div style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}>
                                        📌 {c.linkedStandard.statementNotation ?? c.linkedStandard.guid}
                                    </div>
                                )}
                            </td>
                            {c.levels.map(l => (
                                <td key={l.id} className="level-cell">
                                    {l.description || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                    {l.subItems.length > 0 && (
                                        <ul style={{ margin: '6px 0 0', padding: '0 0 0 14px', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                            {l.subItems.map(si => <li key={si.id}>{si.label} ({si.points}pts)</li>)}
                                        </ul>
                                    )}
                                </td>
                            ))}
                            {format.showWeights && <td style={{ textAlign: 'center' }}>{c.weight}%</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
