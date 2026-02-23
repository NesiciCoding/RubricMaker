import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Plus, Trash2, GripVertical, Save, ChevronUp, ChevronDown,
    Settings, Eye, ArrowLeft, Link2, BookOpen, X, ChevronRight, FileDown, FileText,
    Wand2, AlignLeft, AlignCenter, AlignRight, LayoutGrid, Rows3, CheckSquare, Square,
    MoveLeft, MoveRight
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
    const [showMarkdownHint, setShowMarkdownHint] = useState(false);
    const [viewMode, setViewMode] = useState<'form' | 'designer'>('form');
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

    const handleExport = async (type: 'pdf' | 'docx' | 'json') => {
        setShowExportMenu(false);
        const rubric = getRubricData();
        if (type === 'pdf') {
            await exportRubricGridPdf(rubric);
        } else if (type === 'docx') {
            await exportRubricToDocx(rubric);
        } else {
            const json = JSON.stringify(rubric, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${rubric.name.replace(/[^a-z0-9]/gi, '_')}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
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
                        <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, marginRight: 8 }}>
                            <button className={`btn btn-sm ${viewMode === 'form' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setViewMode('form')} style={{ border: 'none' }}>Form</button>
                            <button className={`btn btn-sm ${viewMode === 'designer' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setViewMode('designer')} style={{ border: 'none' }}>Designer</button>
                        </div>
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
                                        <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => handleExport('json')}>
                                            <FileText size={14} /> Export JSON
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
                <div style={{ display: 'grid', gridTemplateColumns: showFormat ? '1fr 300px' : '1fr', gap: 24, alignItems: 'start' }}>
                    <div style={{ display: viewMode === 'form' ? 'block' : 'none' }}>
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

                    {/* Designer View */}
                    {viewMode === 'designer' && (
                        <div style={{ overflowX: 'auto', paddingBottom: 24 }}>
                            <RubricWysiwygEditor
                                name={name}
                                setName={setName}
                                criteria={criteria}
                                format={format}
                                updateCriterion={updateCriterion}
                                updateLevel={updateLevel}
                                addCriterion={() => setCriteria(c => [...c, newCriterion()])}
                                addCriterionLevel={(cid) => addLevel(cid)}
                                criteriaSetter={setCriteria}
                                totalMaxPoints={totalMaxPoints}
                                scoringMode={scoringMode}
                                onShowMarkdownHint={() => setShowMarkdownHint(true)}
                            />
                        </div>
                    )}

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
                                    <label>Font Family</label>
                                    <select value={format.fontFamily} onChange={e => setFormat(f => ({ ...f, fontFamily: e.target.value }))}>
                                        <option value="Inter, system-ui, sans-serif">Sans Serif (Inter)</option>
                                        <option value="Arial, Helvetica, sans-serif">Arial</option>
                                        <option value='"Times New Roman", Times, serif'>Times New Roman</option>
                                        <option value="Georgia, serif">Georgia</option>
                                        <option value='"Courier New", Courier, monospace'>Monospace (Courier)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Level Order</label>
                                    <select value={format.levelOrder}
                                        onChange={e => setFormat(f => ({ ...f, levelOrder: e.target.value as 'best-first' | 'worst-first' }))}>
                                        <option value="best-first">Best → Worst (left to right)</option>
                                        <option value="worst-first">Worst → Best (left to right)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                                    <div className="form-group">
                                        <label>Header Alignment</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {(['left', 'center', 'right'] as const).map(align => (
                                                <button key={align}
                                                    className={`btn btn-sm ${format.headerTextAlign === align ? 'btn-secondary' : 'btn-ghost'}`}
                                                    onClick={() => setFormat(f => ({ ...f, headerTextAlign: align }))}
                                                    style={{ flex: 1, textTransform: 'capitalize' }}>
                                                    {align === 'left' ? <AlignLeft size={14} /> : align === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {[
                                        { label: 'Show criterion weights', key: 'showWeights' as keyof RubricFormat },
                                        { label: 'Show point values', key: 'showPoints' as keyof RubricFormat },
                                        { label: 'Show borders / grid lines', key: 'showBorders' as keyof RubricFormat, icon: <LayoutGrid size={14} /> },
                                        { label: 'Alternate row colors (striping)', key: 'rowStriping' as keyof RubricFormat, icon: <Rows3 size={14} /> },
                                    ].map(({ label, key, icon }) => (
                                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, paddingLeft: 2 }}>
                                            <div style={{ color: format[key] ? 'var(--accent)' : 'var(--text-muted)' }} onClick={() => setFormat(f => ({ ...f, [key]: !f[key] }))}>
                                                {format[key] ? <CheckSquare size={16} /> : <Square size={16} />}
                                            </div>
                                            {icon && <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{icon}</span>}
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

                {/* Markdown Hint Modal */}
                {showMarkdownHint && (
                    <div className="modal-overlay" onClick={() => setShowMarkdownHint(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                            <div className="modal-header">
                                <h3>Markdown Formatting</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowMarkdownHint(false)}>✕</button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16 }}>You can use simple Markdown tags to format text in descriptions:</p>
                                <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
                                    <li><code>**bold**</code> for <strong>bold text</strong></li>
                                    <li><code>*italic*</code> for <em>italic text</em></li>
                                </ul>
                                <p style={{ marginTop: 16, fontSize: '0.9em', color: 'var(--text-muted)' }}>
                                    Just type the asterisks around your words. The formatting will apply as soon as you click outside the text box!
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-primary" onClick={() => setShowMarkdownHint(false)}>Got it</button>
                            </div>
                        </div>
                    </div>
                )}
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
                        <th style={{ width: format.criterionColWidth, textAlign: 'left', border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}>Criterion</th>
                        {headers.map(h => (
                            <th key={h.id} style={{ width: format.levelColWidth, textAlign: format.headerTextAlign, border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}>
                                {h.label}
                                {format.showPoints ? ` (${h.minPoints}${h.minPoints !== h.maxPoints ? `–${h.maxPoints}` : ''}pts)` : ''}
                            </th>
                        ))}
                        {format.showWeights && <th style={{ width: 80, border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}>Weight</th>}
                    </tr>
                </thead>
                <tbody>
                    {criteria.map((c, i) => (
                        <tr key={c.id} style={{ background: format.rowStriping && i % 2 !== 0 ? 'var(--bg-elevated)' : 'transparent' }}>
                            <td className="criterion-cell" style={{ border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}>
                                <div style={{ fontWeight: 600 }}>{c.title}</div>
                                {c.description && <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 4 }}>{c.description}</div>}
                                {c.linkedStandard && (
                                    <div style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}>
                                        📌 {c.linkedStandard.statementNotation ?? c.linkedStandard.guid}
                                    </div>
                                )}
                            </td>
                            {c.levels.map(l => (
                                <td key={l.id} className="level-cell" style={{ border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}>
                                    {l.description || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                    {l.subItems.length > 0 && (
                                        <ul style={{ margin: '6px 0 0', padding: '0 0 0 14px', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                            {l.subItems.map(si => <li key={si.id}>{si.label} ({si.points}pts)</li>)}
                                        </ul>
                                    )}
                                </td>
                            ))}
                            {format.showWeights && <td style={{ textAlign: 'center', border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}>{c.weight}%</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// WYSIWYG Editor
interface WYSIWYGProps {
    name: string;
    setName: (n: string) => void;
    criteria: RubricCriterion[];
    format: RubricFormat;
    updateCriterion: (cid: string, patch: Partial<RubricCriterion>) => void;
    updateLevel: (cid: string, lid: string, patch: Partial<RubricLevel>) => void;
    addCriterion: () => void;
    addCriterionLevel: (cid: string) => void;
    criteriaSetter: React.Dispatch<React.SetStateAction<RubricCriterion[]>>;
    totalMaxPoints: number;
    scoringMode: 'weighted-percentage' | 'total-points';
    onShowMarkdownHint: () => void;
}

// Very basic Markdown parser
function MarkdownRender({ text, style, className, onClick }: { text: string; style?: React.CSSProperties; className?: string; onClick?: () => void }) {
    if (!text) return <div style={style} className={className} onClick={onClick}><span style={{ opacity: 0.5 }}>Click to edit...</span></div>;

    // Very naive markdown parsing for bold and italics
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

    return (
        <div style={{ ...style, whiteSpace: 'pre-wrap', minHeight: 18 }} className={className} onClick={onClick}>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i}>{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('*') && part.endsWith('*')) {
                    return <em key={i}>{part.slice(1, -1)}</em>;
                }
                return <span key={i}>{part}</span>;
            })}
        </div>
    );
}

const RUBRIC_BANK = [
    { title: 'Grammar & Spelling', desc: 'Correct usage of punctuation, spelling, and grammar.' },
    { title: 'Formatting & Layout', desc: 'Document follows required formatting rules and spacing.' },
    { title: 'Clarity of Expression', desc: 'Ideas are expressed clearly and logically.' },
    { title: 'Evidence & Support', desc: 'Claims are backed by solid evidence or citations.' },
    { title: 'Creativity & Originality', desc: 'Work shows unique thought and goes beyond basics.' },
];

function RubricWysiwygEditor({ name, setName, criteria, format, updateCriterion, updateLevel, addCriterion, addCriterionLevel, criteriaSetter, scoringMode, totalMaxPoints, onShowMarkdownHint }: WYSIWYGProps) {
    const headers = criteria[0]?.levels ?? [];
    const [editingCell, setEditingCell] = useState<string | null>(null);

    // Auto-resize textarea
    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
        const target = e.target as HTMLTextAreaElement;
        target.style.height = 'auto';
        target.style.height = `${target.scrollHeight}px`;
    };

    const textareaStyle: React.CSSProperties = {
        width: '100%',
        background: 'transparent',
        border: '1px solid transparent',
        resize: 'none',
        overflow: 'hidden',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        color: 'inherit',
        padding: 4,
        margin: -4,
        borderRadius: 4,
        fontWeight: 'inherit',
        textAlign: 'inherit'
    };

    const inputStyle: React.CSSProperties = {
        ...textareaStyle,
        display: 'inline-block',
        width: 'auto',
    };

    function moveLevel(lIdx: number, dir: -1 | 1) {
        criteriaSetter(prev => prev.map(c => {
            const nextL = [...c.levels];
            const swap = lIdx + dir;
            if (swap < 0 || swap >= nextL.length) return c;
            [nextL[lIdx], nextL[swap]] = [nextL[swap], nextL[lIdx]];
            return { ...c, levels: nextL };
        }));
    }

    function moveCriterion(cIdx: number, dir: -1 | 1) {
        criteriaSetter(prev => {
            const next = [...prev];
            const swap = cIdx + dir;
            if (swap < 0 || swap >= next.length) return prev;
            [next[cIdx], next[swap]] = [next[swap], next[cIdx]];
            return next;
        });
    }

    function balanceWeights() {
        if (!criteria.length) return;
        // Don't modify if user has already perfectly balanced it or if there are none
        const baseWeight = Math.floor(100 / criteria.length);
        const remainder = 100 % criteria.length;

        criteriaSetter(prev => prev.map((c, i) => ({
            ...c,
            weight: baseWeight + (i === 0 ? remainder : 0) // Give remainder to first item
        })));
    }

    function smartAllocatePoints() {
        if (!criteria.length || headers.length < 2) return;

        criteriaSetter(prev => prev.map(c => {
            const nextLevels = [...c.levels];
            // Find max and min points from first and last level (assuming order)
            const pts1 = nextLevels[0].maxPoints;
            const pts2 = nextLevels[nextLevels.length - 1].maxPoints;

            const maxPts = Math.max(pts1, pts2);
            const minPts = Math.min(pts1, pts2);

            // Distribute evenly
            const step = (maxPts - minPts) / (nextLevels.length - 1);

            // Re-apply to all levels linearly
            return {
                ...c,
                levels: nextLevels.map((l, i) => {
                    // if it's highest to lowest
                    const rawScore = pts1 > pts2 ? pts1 - (step * i) : pts1 + (step * i);
                    const roundedScore = Math.round(rawScore * 10) / 10;
                    return { ...l, minPoints: roundedScore, maxPoints: roundedScore };
                })
            };
        }));
    }

    function insertFromBank(item: { title: string, desc: string }) {
        criteriaSetter(c => {
            const nc = newCriterion();
            nc.title = item.title;
            nc.description = item.desc;
            // Match the level headers of the active rubric if they exist
            if (c.length > 0 && c[0].levels.length > 0) {
                nc.levels = c[0].levels.map(l => ({
                    id: nanoid(),
                    label: l.label,
                    minPoints: l.minPoints,
                    maxPoints: l.maxPoints,
                    description: '',
                    subItems: []
                }));
            }
            return [...c, nc];
        });
    }

    return (
        <div style={{ fontFamily: format.fontFamily, fontSize: format.fontSize, background: 'var(--bg-card)', padding: 24, borderRadius: 12, border: '1px solid var(--border)', minHeight: 400 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={onShowMarkdownHint} title="How to format text" style={{ marginRight: 'auto', color: 'var(--text-muted)' }}>
                    <BookOpen size={13} style={{ marginRight: 4 }} /> Formatting Help
                </button>
                <button className="btn btn-secondary btn-sm" onClick={smartAllocatePoints} title="Linearly distribute points across levels">
                    <Wand2 size={13} /> Smart Allocate Points
                    {scoringMode === 'total-points' && <span style={{ opacity: 0.5, fontSize: '0.9em' }}>({totalMaxPoints} max)</span>}
                </button>
                {format.showWeights && (
                    <button className="btn btn-secondary btn-sm" onClick={balanceWeights} title="Evenly distribute 100% across rows">
                        <Wand2 size={13} /> Balance Weights
                    </button>
                )}
            </div>

            <textarea
                value={name}
                onChange={e => setName(e.target.value)}
                onInput={handleInput}
                placeholder="Rubric Title..."
                style={{ ...textareaStyle, fontSize: '1.8em', fontWeight: 700, marginBottom: 16, width: '100%' }}
                className="hover-border"
            />
            <table className="rubric-grid" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                    <tr style={{ background: format.headerColor, color: format.headerTextColor }}>
                        <th style={{ width: format.criterionColWidth, textAlign: 'left', border: format.showBorders ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ padding: '12px 14px' }}>Criterion</div>
                        </th>
                        {headers.map((h, i) => (
                            <th key={h.id} style={{ width: format.levelColWidth, border: format.showBorders ? '1px solid var(--border)' : 'none', position: 'relative' }} className="designer-th">
                                <div style={{ display: 'flex', gap: 4, position: 'absolute', top: 4, right: 4, opacity: 0 }} className="th-actions">
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveLevel(i, -1)} disabled={i === 0} style={{ padding: 2, height: 20, width: 20, color: 'inherit' }}><MoveLeft size={12} /></button>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveLevel(i, 1)} disabled={i === headers.length - 1} style={{ padding: 2, height: 20, width: 20, color: 'inherit' }}><MoveRight size={12} /></button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: format.headerTextAlign === 'left' ? 'flex-start' : format.headerTextAlign === 'right' ? 'flex-end' : 'center', padding: '12px 14px' }}>
                                    <textarea
                                        value={h.label}
                                        onChange={e => {
                                            // Update this level's label across all criteria to keep them synced
                                            criteria.forEach(c => updateLevel(c.id, c.levels[i].id, { label: e.target.value }));
                                        }}
                                        onInput={handleInput}
                                        placeholder="Level..."
                                        style={{ ...textareaStyle, textAlign: 'center', fontWeight: 'bold' }}
                                        className="hover-border"
                                    />
                                    {format.showPoints && (
                                        <div style={{ fontSize: '0.85em', opacity: 0.8, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                            (<input type="number"
                                                value={h.minPoints}
                                                onChange={e => {
                                                    criteria.forEach(c => updateLevel(c.id, c.levels[i].id, { minPoints: Number(e.target.value) }));
                                                }}
                                                style={{ ...inputStyle, width: 30, textAlign: 'center', padding: 0, margin: 0 }}
                                                className="hover-border"
                                            />
                                            {h.minPoints !== h.maxPoints && (
                                                <>
                                                    -
                                                    <input type="number"
                                                        value={h.maxPoints}
                                                        onChange={e => {
                                                            criteria.forEach(c => updateLevel(c.id, c.levels[i].id, { maxPoints: Number(e.target.value) }));
                                                        }}
                                                        style={{ ...inputStyle, width: 30, textAlign: 'center', padding: 0, margin: 0 }}
                                                        className="hover-border"
                                                    />
                                                </>
                                            )}pts)
                                        </div>
                                    )}
                                </div>
                            </th>
                        ))}
                        {format.showWeights && <th style={{ width: 80, textAlign: 'center', border: format.showBorders ? '1px solid var(--border)' : 'none', padding: '12px 14px' }}>Weight</th>}
                    </tr>
                </thead>
                <tbody>
                    {criteria.map((c, cIdx) => (
                        <tr key={c.id} style={{ background: format.rowStriping && cIdx % 2 !== 0 ? 'var(--bg-elevated)' : 'transparent' }}>
                            <td className="criterion-cell designer-td" style={{ position: 'relative', border: format.showBorders ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'absolute', top: 4, right: 4, opacity: 0 }} className="td-actions">
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveCriterion(cIdx, -1)} disabled={cIdx === 0} style={{ padding: 2, height: 20, width: 20 }}><ChevronUp size={14} /></button>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveCriterion(cIdx, 1)} disabled={cIdx === criteria.length - 1} style={{ padding: 2, height: 20, width: 20 }}><ChevronDown size={14} /></button>
                                </div>
                                <div style={{ padding: '10px 12px', paddingRight: 30 }}>
                                    <textarea
                                        value={c.title}
                                        onChange={e => updateCriterion(c.id, { title: e.target.value })}
                                        onInput={handleInput}
                                        placeholder="Criterion Name"
                                        style={{ ...textareaStyle, fontWeight: 600 }}
                                        className="hover-border"
                                    />
                                    {editingCell === `${c.id}_desc` ? (
                                        <textarea
                                            autoFocus
                                            value={c.description}
                                            onChange={e => updateCriterion(c.id, { description: e.target.value })}
                                            onBlur={() => setEditingCell(null)}
                                            onInput={handleInput}
                                            placeholder="Description (optional)"
                                            style={{ ...textareaStyle, fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 4, minHeight: 40 }}
                                            className="hover-border"
                                        />
                                    ) : (
                                        <MarkdownRender
                                            text={c.description}
                                            onClick={() => setEditingCell(`${c.id}_desc`)}
                                            style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 4, cursor: 'text' }}
                                            className="hover-border"
                                        />
                                    )}
                                    {c.linkedStandard && (
                                        <div style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}>
                                            📌 {c.linkedStandard.statementNotation ?? c.linkedStandard.guid}
                                        </div>
                                    )}
                                </div>
                            </td>
                            {c.levels.map(l => (
                                <td key={l.id} className="level-cell" style={{ verticalAlign: 'top', border: format.showBorders ? '1px solid var(--border)' : 'none' }}>
                                    <div style={{ padding: '10px 12px' }}>
                                        {editingCell === `${c.id}_${l.id}` ? (
                                            <textarea
                                                autoFocus
                                                value={l.description}
                                                onChange={e => updateLevel(c.id, l.id, { description: e.target.value })}
                                                onBlur={() => setEditingCell(null)}
                                                onInput={handleInput}
                                                placeholder="Level description..."
                                                style={{ ...textareaStyle, minHeight: 60 }}
                                                className="hover-border"
                                            />
                                        ) : (
                                            <MarkdownRender
                                                text={l.description}
                                                onClick={() => setEditingCell(`${c.id}_${l.id}`)}
                                                style={{ cursor: 'text' }}
                                                className="hover-border"
                                            />
                                        )}
                                        {l.subItems.length > 0 && (
                                            <ul style={{ margin: '6px 0 0', padding: '0 0 0 14px', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                                {l.subItems.map(si => <li key={si.id}>{si.label} ({si.points}pts)</li>)}
                                            </ul>
                                        )}
                                    </div>
                                </td>
                            ))}
                            {format.showWeights && (
                                <td style={{ textAlign: 'center', verticalAlign: 'middle', border: format.showBorders ? '1px solid var(--border)' : 'none', padding: '10px 12px' }}>
                                    <input type="number"
                                        value={c.weight}
                                        onChange={e => updateCriterion(c.id, { weight: Number(e.target.value) })}
                                        style={{ ...inputStyle, width: 44, textAlign: 'center' }}
                                        className="hover-border"
                                    />%
                                </td>
                            )}
                        </tr>
                    ))}
                    <tr>
                        <td colSpan={(format.showWeights ? 2 : 1) + headers.length} style={{ padding: 12, textAlign: 'center', border: '1px dashed var(--border)', background: 'transparent' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={addCriterion}>
                                    <Plus size={14} /> Add Row
                                </button>
                                <select
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '0 8px', maxWidth: 160 }}
                                    onChange={e => {
                                        if (!e.target.value) return;
                                        const item = RUBRIC_BANK.find(i => i.title === e.target.value);
                                        if (item) insertFromBank(item);
                                        e.target.value = ''; // reset
                                    }}
                                >
                                    <option value="" disabled selected>Insert from bank...</option>
                                    {RUBRIC_BANK.map(item => (
                                        <option key={item.title} value={item.title}>{item.title}</option>
                                    ))}
                                </select>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => addCriterionLevel(criteria[0]?.id)} disabled={!criteria.length}>
                    <Plus size={14} /> Add Column (Level)
                </button>
            </div>

            <style>{`
                .designer-th:hover .th-actions, .designer-td:hover .td-actions { opacity: 1 !important; }
                .hover-border { padding: 4px; margin: -4px; border-radius: 4px; transition: border-color 0.2s, background 0.2s; }
                .hover-border:hover { border-color: var(--border); background: var(--bg-elevated); }
                .hover-border:focus { border-color: var(--accent); background: var(--bg-elevated); outline: none; }
                .designer-td, .designer-th { transition: opacity 0.2s; }
                .md-hint { position: absolute; right: 8px; bottom: 8px; font-size: 0.7em; color: var(--text-dim); opacity: 0; transition: opacity 0.2s; pointer-events: none; }
                td:focus-within .md-hint { opacity: 1; }
            `}</style>
        </div>
    );
}
