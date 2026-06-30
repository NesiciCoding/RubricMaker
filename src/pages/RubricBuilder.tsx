import React, { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
    Plus,
    Trash2,
    GripVertical,
    Save,
    ChevronUp,
    ChevronDown,
    Settings,
    Eye,
    ArrowLeft,
    Link2,
    BookOpen,
    X,
    ChevronRight,
    FileDown,
    FileText,
    Wand2,
    AlignLeft,
    AlignCenter,
    AlignRight,
    LayoutGrid,
    Rows3,
    CheckSquare,
    Square,
    MoveLeft,
    MoveRight,
    Copy,
    Files,
    Layers,
    GripHorizontal,
    Clock,
    RotateCcw,
    GitCompare,
    Printer,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useTranslation, Trans } from 'react-i18next';
import type {
    Rubric,
    RubricCriterion,
    RubricLevel,
    RubricFormat,
    SubItem,
    LinkedStandard,
    ScoringMode,
    CefrLevel,
    CefrSkill,
    LinkedCefrDescriptor,
    LinkedFrameworkDescriptor,
} from '../types';
import { DEFAULT_FORMAT } from '../types';
import { saveCriterionClipboard, loadCriterionClipboard, loadUserTemplates, saveUserTemplates } from '../store/storage';
import { nanoid } from '../utils/nanoid';
import StandardsPickerModal from '../components/Standards/StandardsPickerModal';
import RubricVersionDiffModal from '../components/Modals/RubricVersionDiffModal';
import CefrPickerModal from '../components/CEFR/CefrPickerModal';
import Modal from '../components/ui/Modal';
import VocabularyListEditor from '../components/Vocabulary/VocabularyListEditor';
import { CEFR_LEVELS, CEFR_SKILLS, CEFR_SKILL_LABELS, CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';
import { exportRubricGridPdf } from '../utils/pdfExport';
import { exportRubricToDocx } from '../utils/docxExport';
import { logAuditEvent } from '../services/database/AuditLogger';
import { getSpeakingDimensions } from '../data/speakingDimensions';
import { useToast } from '../hooks/useToast';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { getRubricBuilderTourSteps } from '../data/TutorialSteps';

function newLevel(min = 0, max = 0, label = ''): RubricLevel {
    return {
        id: nanoid(),
        label,
        minPoints: min,
        maxPoints: max,
        description: '',
        subItems: [],
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
    const location = useLocation();
    const {
        rubrics,
        studentRubrics,
        peerReviews,
        addRubric,
        updateRubric,
        syncRubricSnapshot,
        saveRubricVersion,
        restoreRubricVersion,
        gradeScales,
        settings,
        addVocabularyItem,
        updateVocabularyItem,
        deleteVocabularyItem,
        deleteVocabularyItems,
    } = useApp();

    const existing = id ? rubrics.find((r) => r.id === id) : undefined;
    const template = location.state?.template as Partial<Rubric> | undefined;

    const [name, setName] = useState(existing?.name ?? template?.name ?? '');
    const [nameError, setNameError] = useState('');
    const [subject, setSubject] = useState(existing?.subject ?? template?.subject ?? '');
    const [description, setDescription] = useState(existing?.description ?? template?.description ?? '');
    const [criteria, setCriteria] = useState<RubricCriterion[]>(
        existing?.criteria ?? template?.criteria ?? [newCriterion()]
    );
    const [gradeScaleId, setGradeScaleId] = useState(
        existing?.gradeScaleId ?? template?.gradeScaleId ?? settings.defaultGradeScaleId
    );
    const [format, setFormat] = useState<RubricFormat>(existing?.format ?? template?.format ?? DEFAULT_FORMAT);
    const [scoringMode, setScoringMode] = useState<ScoringMode>(
        existing?.scoringMode ?? template?.scoringMode ?? 'weighted-percentage'
    );
    const [totalMaxPoints, setTotalMaxPoints] = useState(existing?.totalMaxPoints ?? template?.totalMaxPoints ?? 100);
    const [showFormat, setShowFormat] = useState(false);
    const [showVocabulary, setShowVocabulary] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showMarkdownHint, setShowMarkdownHint] = useState(false);
    const [viewMode, setViewMode] = useState<'form' | 'designer'>('form');
    const [saved, setSaved] = useState(false);
    const [expandedSubItems, setExpandedSubItems] = useState<Set<string>>(new Set());

    type StandardTarget =
        | { type: 'criterion'; cid: string }
        | { type: 'subitem'; cid: string; lid: string; sid: string };
    const [pickingStandardFor, setPickingStandardFor] = useState<StandardTarget | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const { t, i18n } = useTranslation();
    const { showToast } = useToast();

    // ── CEFR state ──────────────────────────────────────────────────────────────
    const [cefrTargetLevel, setCefrTargetLevel] = useState<CefrLevel | ''>(existing?.cefrTargetLevel ?? '');
    const [cefrSkill, setCefrSkill] = useState<CefrSkill | ''>(existing?.cefrSkill ?? '');
    const [cefrAchieveThreshold, setCefrAchieveThreshold] = useState<number>(existing?.cefrAchieveThreshold ?? 70);
    const [pickingCefrFor, setPickingCefrFor] = useState<string | null>(null); // criterion id

    // ── Rubric sync dialog state ─────────────────────────────────────────────
    const [syncDialogRubric, setSyncDialogRubric] = useState<Rubric | null>(null);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [versionLabel, setVersionLabel] = useState('');
    const [diffAgainstVersionIndex, setDiffAgainstVersionIndex] = useState<number | null>(null);
    const [showPreviewStdDesc, setShowPreviewStdDesc] = useState(false);
    const [tourRun, setTourRun] = useState(false);

    // ── Collapsible criteria ─────────────────────────────────────────────────
    const [collapsedCriteria, setCollapsedCriteria] = useState<Set<string>>(new Set());
    function toggleCollapseCriterion(id: string) {
        setCollapsedCriteria((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    // ── Unsaved changes tracking ─────────────────────────────────────────────
    const [isDirty, setIsDirty] = useState(false);
    const mountedRef = useRef(false);
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        setIsDirty(true);
    }, [
        name,
        subject,
        description,
        criteria,
        gradeScaleId,
        format,
        scoringMode,
        totalMaxPoints,
        cefrTargetLevel,
        cefrSkill,
        cefrAchieveThreshold,
    ]);
    const { dialogProps: unsavedDialogProps } = useUnsavedChangesGuard(isDirty);

    useEffect(() => {
        const EXPORT_GOOGLE_FONTS: Record<string, string> = {
            'Playfair Display': 'Playfair+Display:wght@400;700',
            Oswald: 'Oswald:wght@400;500;700',
            'Bebas Neue': 'Bebas+Neue',
            'Special Elite': 'Special+Elite',
            'Courier Prime': 'Courier+Prime:wght@400;700',
        };
        const families = Object.keys(EXPORT_GOOGLE_FONTS).filter((name) => format.fontFamily.includes(name));
        if (families.length === 0) return;
        let link = document.getElementById('rubric-export-gfont') as HTMLLinkElement | null;
        if (!link) {
            link = document.createElement('link');
            link.id = 'rubric-export-gfont';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        const familyParams = families.map((name) => `family=${EXPORT_GOOGLE_FONTS[name]}`).join('&');
        link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
    }, [format.fontFamily]);

    const getRubricData = useCallback(
        (): Rubric => ({
            id: existing?.id ?? 'temp',
            name: name || t('rubricBuilder.placeholder_name').replace('...', ''),
            subject,
            description,
            criteria,
            gradeScaleId,
            format,
            scoringMode,
            totalMaxPoints,
            attachmentIds: existing?.attachmentIds ?? [],
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            cefrTargetLevel: cefrTargetLevel || undefined,
            cefrSkill: cefrSkill || undefined,
            cefrAchieveThreshold: cefrTargetLevel ? cefrAchieveThreshold : undefined,
        }),
        [
            existing,
            name,
            subject,
            description,
            criteria,
            gradeScaleId,
            format,
            scoringMode,
            totalMaxPoints,
            t,
            cefrTargetLevel,
            cefrSkill,
            cefrAchieveThreshold,
        ]
    );

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { source, destination } = result;
        const droppableId = destination.droppableId;

        if (droppableId === 'criteria') {
            // Reorder criteria
            const items = Array.from(criteria);
            const [moved] = items.splice(source.index, 1);
            items.splice(destination.index, 0, moved);
            setCriteria(items);
        } else if (droppableId.startsWith('levels-')) {
            // Reorder levels within a criterion
            const cid = droppableId.slice('levels-'.length);
            setCriteria((prev) =>
                prev.map((c) => {
                    if (c.id !== cid) return c;
                    const lvls = Array.from(c.levels);
                    const [moved] = lvls.splice(source.index, 1);
                    lvls.splice(destination.index, 0, moved);
                    return { ...c, levels: lvls };
                })
            );
        }
    };

    const handleExport = async (type: 'pdf' | 'docx' | 'json') => {
        setShowExportMenu(false);
        const rubric = getRubricData();
        if (type === 'pdf') {
            await exportRubricGridPdf(rubric);
            logAuditEvent('export', 'export_pdf', 'rubric', rubric.id);
        } else if (type === 'docx') {
            await exportRubricToDocx(rubric);
            logAuditEvent('export', 'export_docx', 'rubric', rubric.id);
        } else {
            const json = JSON.stringify(rubric, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${rubric.name.replace(/[^a-z0-9]/gi, '_')}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            logAuditEvent('export', 'export_json', 'rubric', rubric.id);
        }
    };

    function handleSaveAsTemplate() {
        const rubric = getRubricData();
        const template = {
            id: rubric.id !== 'temp' ? rubric.id : `tpl_${Date.now()}`,
            name: rubric.name,
            subject: rubric.subject,
            description: rubric.description,
            criteria: rubric.criteria,
            savedAt: new Date().toISOString(),
        };
        try {
            const existing = loadUserTemplates();
            const filtered = existing.filter((tpl) => tpl.id !== template.id);
            saveUserTemplates([template, ...filtered].slice(0, 20));
            showToast(t('rubricBuilder.save_as_template_success', `"${rubric.name}" saved as template`), 'success');
        } catch {
            showToast(t('toast.export_error'), 'error');
        }
    }

    function handlePrint() {
        const orientation = format.orientation || 'portrait';
        const style = document.createElement('style');
        style.textContent = `@page { size: A4 ${orientation}; }`;
        document.head.appendChild(style);
        window.print();
        document.head.removeChild(style);
    }

    const handleSave = useCallback(() => {
        if (!name.trim()) {
            setNameError(t('rubricBuilder.name_required', 'Rubric name is required.'));
            return;
        }
        setNameError('');
        // Warn (non-blocking) if weights are outside a sensible range in weighted mode
        if (scoringMode === 'weighted-percentage' && criteria.length > 0) {
            const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
            if (totalWeight < 85 || totalWeight > 115) {
                showToast(
                    t(
                        'rubricBuilder.weight_total_warning',
                        `Weights total ${totalWeight}% (expected 100%). You can still save — the grade engine normalises them.`
                    ),
                    'warning'
                );
            }
        }
        const rubricData = {
            name: name.trim(),
            subject,
            description,
            criteria,
            gradeScaleId,
            format,
            scoringMode,
            totalMaxPoints,
            attachmentIds: existing?.attachmentIds ?? [],
            cefrTargetLevel: cefrTargetLevel || undefined,
            cefrSkill: cefrSkill || undefined,
            cefrAchieveThreshold: cefrTargetLevel ? cefrAchieveThreshold : undefined,
        };
        if (existing) {
            const savedRubric = { ...existing, ...rubricData };
            updateRubric(savedRubric);
            // Offer to sync rubricSnapshot for all existing graded submissions
            const affectedCount =
                studentRubrics.filter((sr) => sr.rubricId === existing.id).length +
                peerReviews.filter((pr) => pr.rubricId === existing.id).length;
            if (affectedCount > 0) {
                setSyncDialogRubric(savedRubric);
            }
            flushSync(() => setIsDirty(false));
        } else {
            const newR = addRubric(rubricData);
            // Flush only after the create succeeds, and before navigate so
            // useBlocker doesn't see stale isDirty=true.
            flushSync(() => setIsDirty(false));
            navigate(`/rubrics/${newR.id}`, { replace: true });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [
        name,
        subject,
        description,
        criteria,
        gradeScaleId,
        format,
        scoringMode,
        totalMaxPoints,
        existing,
        addRubric,
        updateRubric,
        navigate,
        cefrTargetLevel,
        cefrSkill,
        cefrAchieveThreshold,
        t,
        studentRubrics,
        peerReviews,
    ]);

    // ── Criterion operations ────────────────────────────────────────────────────
    function moveCriterion(idx: number, dir: -1 | 1) {
        const next = [...criteria];
        const swap = idx + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        setCriteria(next);
    }
    function duplicateCriterion(idx: number) {
        setCriteria((prev) => {
            const source = prev[idx];
            const clone: RubricCriterion = {
                ...source,
                id: nanoid(),
                title: `${source.title} (Copy)`,
                levels: source.levels.map((l) => ({
                    ...l,
                    id: nanoid(),
                    subItems: l.subItems.map((si) => ({ ...si, id: nanoid() })),
                })),
            };
            const next = [...prev];
            next.splice(idx + 1, 0, clone);
            return next;
        });
    }
    function deleteCriterion(cid: string) {
        setCriteria((c) => c.filter((x) => x.id !== cid));
    }

    function copyToClipboard(criterion: RubricCriterion) {
        try {
            saveCriterionClipboard(criterion);
        } catch (e) {
            console.error('[rubric] copy criterion failed', e);
            showToast(t('toast.copy_paste_failed'), 'warning');
        }
    }

    function pasteFromClipboard() {
        try {
            const source = loadCriterionClipboard();
            if (!source) return;
            const clone: RubricCriterion = {
                ...source,
                id: nanoid(),
                levels: source.levels.map((l) => ({
                    ...l,
                    id: nanoid(),
                    subItems: l.subItems.map((si) => ({ ...si, id: nanoid() })),
                })),
            };
            setCriteria((c) => [...c, clone]);
        } catch (e) {
            console.error('[rubric] paste criterion failed', e);
            showToast(t('toast.copy_paste_failed'), 'warning');
        }
    }
    function updateCriterion(cid: string, patch: Partial<RubricCriterion>) {
        setCriteria((c) => c.map((x) => (x.id === cid ? { ...x, ...patch } : x)));
    }

    // ── Level operations ────────────────────────────────────────────────────────
    function addLevel(cid: string) {
        setCriteria((c) =>
            c.map((x) => (x.id === cid ? { ...x, levels: [...x.levels, newLevel(0, 0, 'New Level')] } : x))
        );
    }
    function deleteLevel(cid: string, lid: string) {
        setCriteria((c) => c.map((x) => (x.id === cid ? { ...x, levels: x.levels.filter((l) => l.id !== lid) } : x)));
    }
    function updateLevel(cid: string, lid: string, patch: Partial<RubricLevel>) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid ? { ...x, levels: x.levels.map((l) => (l.id === lid ? { ...l, ...patch } : l)) } : x
            )
        );
    }

    // ── Sub-item operations ─────────────────────────────────────────────────────
    function addSubItem(cid: string, lid: string) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid
                    ? {
                          ...x,
                          levels: x.levels.map((l) =>
                              l.id === lid
                                  ? {
                                        ...l,
                                        subItems: [
                                            ...l.subItems,
                                            { id: nanoid(), label: '', points: 1, minPoints: 0, maxPoints: 1 },
                                        ],
                                    }
                                  : l
                          ),
                      }
                    : x
            )
        );
    }
    function updateSubItem(cid: string, lid: string, sid: string, patch: Partial<SubItem>) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid
                    ? {
                          ...x,
                          levels: x.levels.map((l) =>
                              l.id === lid
                                  ? { ...l, subItems: l.subItems.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }
                                  : l
                          ),
                      }
                    : x
            )
        );
    }
    function deleteSubItem(cid: string, lid: string, sid: string) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid
                    ? {
                          ...x,
                          levels: x.levels.map((l) =>
                              l.id === lid ? { ...l, subItems: l.subItems.filter((s) => s.id !== sid) } : l
                          ),
                      }
                    : x
            )
        );
    }

    function toggleSubItems(levelKey: string) {
        setExpandedSubItems((prev) => {
            const next = new Set(prev);
            if (next.has(levelKey)) {
                next.delete(levelKey);
            } else {
                next.add(levelKey);
            }
            return next;
        });
    }

    // ── Standards linking ───────────────────────────────────────────────────────
    function linkStandard(target: StandardTarget, std: LinkedStandard) {
        if (target.type === 'criterion') {
            setCriteria((c) =>
                c.map((x) => (x.id === target.cid ? { ...x, linkedStandards: [...(x.linkedStandards || []), std] } : x))
            );
        } else if (target.type === 'subitem') {
            setCriteria((c) =>
                c.map((x) =>
                    x.id === target.cid
                        ? {
                              ...x,
                              levels: x.levels.map((l) =>
                                  l.id === target.lid
                                      ? {
                                            ...l,
                                            subItems: l.subItems.map((s) =>
                                                s.id === target.sid
                                                    ? { ...s, linkedStandards: [...(s.linkedStandards || []), std] }
                                                    : s
                                            ),
                                        }
                                      : l
                              ),
                          }
                        : x
                )
            );
        }
    }
    function unlinkStandard(target: StandardTarget, stdIndex: number) {
        if (target.type === 'criterion') {
            setCriteria((c) =>
                c.map((x) => {
                    if (x.id !== target.cid) return x;
                    const newStandards = [...(x.linkedStandards || [])];
                    newStandards.splice(stdIndex, 1);
                    return { ...x, linkedStandards: newStandards };
                })
            );
        } else if (target.type === 'subitem') {
            setCriteria((c) =>
                c.map((x) =>
                    x.id === target.cid
                        ? {
                              ...x,
                              levels: x.levels.map((l) =>
                                  l.id === target.lid
                                      ? {
                                            ...l,
                                            subItems: l.subItems.map((s) => {
                                                if (s.id !== target.sid) return s;
                                                const newStandards = [...(s.linkedStandards || [])];
                                                newStandards.splice(stdIndex, 1);
                                                return { ...s, linkedStandards: newStandards };
                                            }),
                                        }
                                      : l
                              ),
                          }
                        : x
                )
            );
        }
    }

    // Legacy support for removing the single linkedStandard if it exists
    function unlinkLegacyStandard(cid: string) {
        setCriteria((c) =>
            c.map((x) => {
                if (x.id !== cid) return x;
                const { linkedStandard: _linkedStandard, ...rest } = x;
                return rest;
            })
        );
    }

    // ── CEFR descriptor operations ──────────────────────────────────────────────
    function addCefrDescriptor(cid: string, descriptor: LinkedCefrDescriptor) {
        setCriteria((c) =>
            c.map((x) => (x.id === cid ? { ...x, cefrDescriptors: [...(x.cefrDescriptors || []), descriptor] } : x))
        );
    }
    function removeCefrDescriptor(cid: string, descriptorId: string) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid
                    ? {
                          ...x,
                          cefrDescriptors: (x.cefrDescriptors || []).filter((d) => d.descriptorId !== descriptorId),
                      }
                    : x
            )
        );
    }

    function addFrameworkDescriptor(cid: string, descriptor: LinkedFrameworkDescriptor) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid ? { ...x, frameworkDescriptors: [...(x.frameworkDescriptors || []), descriptor] } : x
            )
        );
    }
    function removeFrameworkDescriptor(cid: string, descriptorId: string) {
        setCriteria((c) =>
            c.map((x) =>
                x.id === cid
                    ? {
                          ...x,
                          frameworkDescriptors: (x.frameworkDescriptors || []).filter(
                              (d) => d.descriptorId !== descriptorId
                          ),
                      }
                    : x
            )
        );
    }

    return (
        <>
            <Joyride
                steps={getRubricBuilderTourSteps(t)}
                run={tourRun}
                continuous
                onEvent={(data: EventData) => {
                    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
                        setTourRun(false);
                    }
                }}
                options={{
                    showProgress: true,
                    primaryColor: 'var(--accent)',
                    backgroundColor: 'var(--bg-elevated)',
                    textColor: 'var(--text)',
                    arrowColor: 'var(--bg-elevated)',
                    overlayColor: 'rgba(0, 0, 0, 0.6)',
                }}
            />
            <Topbar
                title={id ? t('rubricBuilder.edit_rubric') : t('rubricBuilder.new_rubric')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rubrics')}>
                            <ArrowLeft size={15} /> {t('rubricBuilder.action_back')}
                        </button>
                        <div
                            style={{
                                display: 'flex',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: 2,
                                marginRight: 8,
                            }}
                        >
                            <button
                                className={`btn btn-sm ${viewMode === 'form' ? 'btn-secondary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('form')}
                                style={{ border: 'none' }}
                            >
                                {t('rubricBuilder.action_form_view')}
                            </button>
                            <button
                                className={`btn btn-sm ${viewMode === 'designer' ? 'btn-secondary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('designer')}
                                style={{ border: 'none' }}
                            >
                                {t('rubricBuilder.action_designer_view')}
                            </button>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowFormat(!showFormat)}>
                            <Settings size={15} /> FORMAT
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(!showPreview)}>
                            <Eye size={15} /> {t('rubricBuilder.action_preview')}
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                            >
                                <FileDown size={15} /> {t('rubricBuilder.action_export')}
                            </button>
                            {showExportMenu && (
                                <>
                                    <div
                                        style={{ position: 'fixed', inset: 0, zIndex: 5 }}
                                        onClick={() => setShowExportMenu(false)}
                                    />
                                    <div
                                        className="card"
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            right: 0,
                                            marginTop: 4,
                                            padding: 4,
                                            minWidth: 160,
                                            zIndex: 10,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 2,
                                        }}
                                    >
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ justifyContent: 'flex-start' }}
                                            onClick={() => handleExport('pdf')}
                                        >
                                            <FileText size={14} /> {t('rubricBuilder.action_export_pdf')}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ justifyContent: 'flex-start' }}
                                            onClick={() => handleExport('docx')}
                                        >
                                            <FileText size={14} /> {t('rubricBuilder.action_export_docx')}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ justifyContent: 'flex-start' }}
                                            onClick={() => handleExport('json')}
                                        >
                                            <FileText size={14} /> {t('rubricBuilder.action_download_json')}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ justifyContent: 'flex-start' }}
                                            onClick={() => {
                                                setShowExportMenu(false);
                                                handlePrint();
                                            }}
                                        >
                                            <Printer size={14} /> {t('rubricBuilder.action_print')}
                                        </button>
                                        <hr
                                            style={{
                                                margin: '4px 0',
                                                border: 'none',
                                                borderTop: '1px solid var(--border)',
                                            }}
                                        />
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ justifyContent: 'flex-start' }}
                                            onClick={() => {
                                                setShowExportMenu(false);
                                                handleSaveAsTemplate();
                                            }}
                                        >
                                            <Layers size={14} /> {t('rubricBuilder.action_save_as_template')}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        {id && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowVersionHistory((p) => !p)}
                                title={t('rubricBuilder.version_history')}
                            >
                                <Clock size={15} /> {t('rubricBuilder.version_history')}
                            </button>
                        )}
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                if (viewMode !== 'form') setViewMode('form');
                                setTourRun(true);
                            }}
                        >
                            {t('tutorial.rb_tour_button')}
                        </button>
                        <button data-tour="rb-save" className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} />{' '}
                            {saved ? t('rubricBuilder.action_saved') : t('rubricBuilder.action_save')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div
                    className="rubric-builder-layout"
                    style={{
                        display: 'grid',
                        gridTemplateColumns: showFormat ? '1fr 300px' : '1fr',
                        gap: 24,
                        alignItems: 'start',
                    }}
                >
                    <div style={{ display: viewMode === 'form' ? 'block' : 'none' }}>
                        {/* Rubric Meta */}
                        <div data-tour="rb-meta" className="card" style={{ marginBottom: 20 }}>
                            <h3 style={{ marginBottom: 16 }}>{t('rubricBuilder.section_rubric_details')}</h3>
                            <div className="grid-2" style={{ gap: 12 }}>
                                <div className="form-group">
                                    <label>Rubric Name *</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => {
                                            setName(e.target.value);
                                            if (nameError) setNameError('');
                                        }}
                                        placeholder={t('rubricBuilder.placeholder_name')}
                                        className={nameError ? 'input-error' : undefined}
                                        aria-describedby={nameError ? 'name-error' : undefined}
                                    />
                                    {nameError && (
                                        <span id="name-error" className="field-error" role="alert">
                                            {nameError}
                                        </span>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label>{t('rubricBuilder.label_subject')}</label>
                                    <input
                                        type="text"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        placeholder={t('rubricBuilder.placeholder_subject')}
                                    />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginTop: 12 }}>
                                <label>{t('rubricBuilder.label_description')}</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t('rubricBuilder.placeholder_description')}
                                    rows={2}
                                />
                            </div>
                            <div className="grid-2" style={{ gap: 12, marginTop: 12 }}>
                                <div className="form-group">
                                    <label>{t('rubricBuilder.label_grade_scale')}</label>
                                    <select
                                        aria-label={t('rubricBuilder.label_grade_scale')}
                                        value={gradeScaleId}
                                        onChange={(e) => setGradeScaleId(e.target.value)}
                                    >
                                        <option value="none">{t('rubricBuilder.grade_scale_none')}</option>
                                        {gradeScales.map((gs) => (
                                            <option key={gs.id} value={gs.id}>
                                                {gs.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* ── Scoring mode ── */}
                            <div
                                data-tour="rb-scoring-mode"
                                style={{
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 10,
                                    padding: 16,
                                    marginTop: 16,
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text)' }}>
                                    {t('rubricBuilder.label_scoring_mode')}
                                </h4>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {(['weighted-percentage', 'total-points', 'single-point'] as ScoringMode[]).map(
                                        (mode) => (
                                            <label
                                                key={mode}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    cursor: 'pointer',
                                                    textTransform: 'none',
                                                    letterSpacing: 0,
                                                    fontWeight: scoringMode === mode ? 600 : 400,
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="scoringMode"
                                                    value={mode}
                                                    checked={scoringMode === mode}
                                                    onChange={() => setScoringMode(mode)}
                                                />
                                                {mode === 'weighted-percentage'
                                                    ? t('rubricBuilder.mode_weighted')
                                                    : mode === 'total-points'
                                                      ? t('rubricBuilder.mode_total_points')
                                                      : t('rubricBuilder.mode_single_point')}
                                            </label>
                                        )
                                    )}
                                </div>
                                {scoringMode === 'total-points' && (
                                    <div className="form-group" style={{ marginTop: 12, maxWidth: 200 }}>
                                        <label>{t('rubricBuilder.label_total_max_points')}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={totalMaxPoints}
                                            onChange={(e) => setTotalMaxPoints(Number(e.target.value))}
                                            placeholder="e.g. 100"
                                        />
                                        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                                            Grade = rawScore / {totalMaxPoints} × 100%
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── CEFR / ERK ── */}
                            <div
                                style={{
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 10,
                                    padding: 16,
                                    marginTop: 16,
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <BookOpen size={15} style={{ color: 'var(--accent)' }} />
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
                                        {t('cefr.rubric_section_title')}
                                    </h4>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                                        {t('cefr.rubric_section_subtitle')}
                                    </span>
                                </div>
                                <div className="grid-2" style={{ gap: 12 }}>
                                    <div className="form-group">
                                        <label>{t('cefr.target_level_label')}</label>
                                        <select
                                            aria-label={t('cefr.target_level_label')}
                                            value={cefrTargetLevel}
                                            onChange={(e) => setCefrTargetLevel(e.target.value as CefrLevel | '')}
                                        >
                                            <option value="">{t('cefr.no_level')}</option>
                                            {CEFR_LEVELS.map((lvl) => (
                                                <option key={lvl} value={lvl}>
                                                    {lvl} – {t(`cefr.level_${lvl}`)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>{t('cefr.skill_label')}</label>
                                        <select
                                            aria-label={t('cefr.skill_label')}
                                            value={cefrSkill}
                                            onChange={(e) => setCefrSkill(e.target.value as CefrSkill | '')}
                                        >
                                            <option value="">{t('cefr.no_skill')}</option>
                                            {CEFR_SKILLS.map((skill) => (
                                                <option key={skill} value={skill}>
                                                    {
                                                        CEFR_SKILL_LABELS[skill][
                                                            i18n.language.startsWith('nl') ? 'nl' : 'en'
                                                        ]
                                                    }
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {cefrTargetLevel && (
                                    <>
                                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {t('cefr.target_label')}:
                                            </span>
                                            <span
                                                style={{
                                                    background: CEFR_LEVEL_COLORS[cefrTargetLevel as CefrLevel],
                                                    color: '#fff',
                                                    borderRadius: 5,
                                                    padding: '2px 10px',
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {cefrTargetLevel}
                                            </span>
                                            {cefrSkill && (
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    ·{' '}
                                                    {
                                                        CEFR_SKILL_LABELS[cefrSkill as CefrSkill][
                                                            i18n.language.startsWith('nl') ? 'nl' : 'en'
                                                        ]
                                                    }
                                                </span>
                                            )}
                                        </div>
                                        <div className="form-group" style={{ marginTop: 12 }}>
                                            <label style={{ fontSize: '0.85rem' }}>
                                                {t('cefr.achieve_threshold_label')}
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={100}
                                                    value={cefrAchieveThreshold}
                                                    onChange={(e) =>
                                                        setCefrAchieveThreshold(
                                                            Math.min(100, Math.max(1, Number(e.target.value)))
                                                        )
                                                    }
                                                    style={{ maxWidth: 80 }}
                                                />
                                                <span className="text-muted text-xs">%</span>
                                            </div>
                                            <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                                                {t('cefr.achieve_threshold_help')}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Vocabulary List */}
                        <div
                            style={{
                                background: 'var(--bg-elevated)',
                                borderRadius: 10,
                                padding: 16,
                                marginTop: 16,
                                border: '1px solid var(--border)',
                            }}
                        >
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                                onClick={() => setShowVocabulary((v) => !v)}
                            >
                                <BookOpen size={15} style={{ color: 'var(--accent)' }} />
                                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)', flex: 1 }}>
                                    {t('vocabulary.section_title', 'Vocabulary & Grammar List')}
                                    {existing?.vocabularyItems?.length ? (
                                        <span
                                            style={{
                                                marginLeft: 8,
                                                fontSize: 11,
                                                color: 'var(--text-muted)',
                                                fontWeight: 400,
                                            }}
                                        >
                                            {existing.vocabularyItems.length} {t('vocabulary.items', 'items')}
                                        </span>
                                    ) : null}
                                </h4>
                                <ChevronDown
                                    size={15}
                                    style={{
                                        transform: showVocabulary ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.2s',
                                        color: 'var(--text-muted)',
                                    }}
                                />
                            </div>
                            {showVocabulary && id && (
                                <div style={{ marginTop: 16 }}>
                                    <p className="text-xs text-muted" style={{ marginBottom: 14 }}>
                                        {t(
                                            'vocabulary.section_help',
                                            'Add words, phrases, or grammar structures to detect when analysing student documents. Link items to rubric criteria to auto-check them during grading.'
                                        )}
                                    </p>
                                    <VocabularyListEditor
                                        rubricId={id}
                                        items={existing?.vocabularyItems ?? []}
                                        criteria={criteria}
                                        onAdd={(item) => addVocabularyItem(id, item)}
                                        onUpdate={(item) => updateVocabularyItem(id, item)}
                                        onDelete={(itemId) => deleteVocabularyItem(id, itemId)}
                                        onDeleteMultiple={(itemIds) => deleteVocabularyItems(id, itemIds)}
                                        cambridgeApiKey={settings.cambridgeApiKey}
                                    />
                                </div>
                            )}
                            {showVocabulary && !id && (
                                <p className="text-xs text-muted" style={{ marginTop: 12 }}>
                                    {t('vocabulary.save_first', 'Save the rubric first to manage vocabulary items.')}
                                </p>
                            )}
                        </div>

                        {/* Weight running total (weighted-percentage mode only) */}
                        {scoringMode === 'weighted-percentage' &&
                            criteria.length > 0 &&
                            (() => {
                                const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
                                const ok = totalWeight >= 98 && totalWeight <= 102;
                                const warn = !ok && totalWeight >= 85 && totalWeight <= 115;
                                const color = ok
                                    ? 'var(--green, #10b981)'
                                    : warn
                                      ? 'var(--yellow, #f59e0b)'
                                      : 'var(--red, #ef4444)';
                                return (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            background: ok
                                                ? 'color-mix(in srgb, var(--green, #10b981) 10%, transparent)'
                                                : 'color-mix(in srgb, var(--yellow, #f59e0b) 10%, transparent)',
                                            border: `1px solid ${color}40`,
                                            marginTop: 16,
                                            marginBottom: 4,
                                            fontSize: '0.82rem',
                                        }}
                                    >
                                        <span style={{ color: 'var(--text-muted)' }}>
                                            {t('rubricBuilder.weight_total_label', 'Total weight:')}
                                        </span>
                                        <span style={{ fontWeight: 700, color }}>{totalWeight}%</span>
                                        {!ok && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                {t('rubricBuilder.weight_total_hint', '(should be 100%)')}
                                            </span>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--accent)' }}
                                            onClick={() => {
                                                const even = Math.round(100 / criteria.length);
                                                const remainder = 100 - even * (criteria.length - 1);
                                                setCriteria((prev) =>
                                                    prev.map((c, i) => ({
                                                        ...c,
                                                        weight: i === prev.length - 1 ? remainder : even,
                                                    }))
                                                );
                                            }}
                                            title={t('rubricBuilder.weight_distribute_evenly', 'Distribute evenly')}
                                        >
                                            {t('rubricBuilder.weight_distribute_evenly', 'Distribute evenly')}
                                        </button>
                                    </div>
                                );
                            })()}

                        {/* Criteria */}
                        <div
                            data-tour="rb-criteria-section"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 14,
                                marginTop: 20,
                            }}
                        >
                            <h2>{t('rubricBuilder.label_criterion')}</h2>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {criteria.length > 1 &&
                                    (collapsedCriteria.size === criteria.length ? (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setCollapsedCriteria(new Set())}
                                        >
                                            {t('rubricBuilder.action_expand_all')}
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setCollapsedCriteria(new Set(criteria.map((c) => c.id)))}
                                        >
                                            {t('rubricBuilder.action_collapse_all')}
                                        </button>
                                    ))}
                                {(cefrSkill === 'speaking_production' || cefrSkill === 'speaking_interaction') && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            const msg =
                                                criteria.length > 0 ? t('rubricBuilder.insert_speaking_confirm') : null;
                                            if (!msg || window.confirm(msg)) {
                                                const dims = getSpeakingDimensions('');
                                                setCriteria(criteria.length > 0 ? dims : dims);
                                            }
                                        }}
                                    >
                                        <BookOpen size={14} /> {t('rubricBuilder.insert_speaking_dims')}
                                    </button>
                                )}
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={pasteFromClipboard}
                                    title={t('rubricBuilder.action_paste_criterion')}
                                >
                                    <Plus size={15} /> {t('rubricBuilder.action_paste_criterion')}
                                </button>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setCriteria((c) => [...c, newCriterion()])}
                                >
                                    <Plus size={15} />{' '}
                                    {t('rubricBuilder.action_add_first_criterion').replace('First ', '')}
                                </button>
                            </div>
                        </div>

                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId="criteria">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef}>
                                        {criteria.map((criterion, cIdx) => (
                                            <Draggable key={criterion.id} draggableId={criterion.id} index={cIdx}>
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className="card print-criterion"
                                                        style={{
                                                            marginBottom: 16,
                                                            ...provided.draggableProps.style,
                                                        }}
                                                    >
                                                        {/* Criterion header */}
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: 10,
                                                                alignItems: 'flex-start',
                                                                marginBottom: 14,
                                                            }}
                                                        >
                                                            <div
                                                                {...provided.dragHandleProps}
                                                                aria-label={t('rubricBuilder.drag_reorder_criterion', {
                                                                    name:
                                                                        criterion.title || t('rubricBuilder.untitled'),
                                                                })}
                                                                style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 2,
                                                                    paddingTop: 4,
                                                                    cursor: 'grab',
                                                                }}
                                                            >
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    aria-label={t(
                                                                        'rubricBuilder.action_move_criterion_up'
                                                                    )}
                                                                    onClick={() => moveCriterion(cIdx, -1)}
                                                                    disabled={cIdx === 0}
                                                                >
                                                                    <ChevronUp size={14} />
                                                                </button>
                                                                <GripVertical
                                                                    size={16}
                                                                    style={{
                                                                        color: 'var(--text-dim)',
                                                                        alignSelf: 'center',
                                                                    }}
                                                                    aria-hidden="true"
                                                                />
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    aria-label={t(
                                                                        'rubricBuilder.action_move_criterion_down'
                                                                    )}
                                                                    onClick={() => moveCriterion(cIdx, 1)}
                                                                    disabled={cIdx === criteria.length - 1}
                                                                >
                                                                    <ChevronDown size={14} />
                                                                </button>
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div
                                                                    className="grid-2"
                                                                    style={{
                                                                        gap: 10,
                                                                        gridTemplateColumns: '1fr 1fr auto',
                                                                    }}
                                                                >
                                                                    <div className="form-group">
                                                                        <label>
                                                                            {t('rubricBuilder.label_criterion')}
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            value={criterion.title}
                                                                            onChange={(e) =>
                                                                                updateCriterion(criterion.id, {
                                                                                    title: e.target.value,
                                                                                })
                                                                            }
                                                                            placeholder={t(
                                                                                'rubricBuilder.placeholder_criterion_name'
                                                                            )}
                                                                        />
                                                                    </div>
                                                                    <div className="form-group">
                                                                        <label>
                                                                            {t(
                                                                                'rubricBuilder.placeholder_criterion_description'
                                                                            )}
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            value={criterion.description}
                                                                            onChange={(e) =>
                                                                                updateCriterion(criterion.id, {
                                                                                    description: e.target.value,
                                                                                })
                                                                            }
                                                                            placeholder={t(
                                                                                'rubricBuilder.placeholder_description'
                                                                            )}
                                                                        />
                                                                    </div>
                                                                    <div className="form-group">
                                                                        <label>{t('rubricBuilder.label_weight')}</label>
                                                                        <input
                                                                            type="number"
                                                                            value={criterion.weight}
                                                                            min={0}
                                                                            max={100}
                                                                            onChange={(e) =>
                                                                                updateCriterion(criterion.id, {
                                                                                    weight: Number(e.target.value),
                                                                                })
                                                                            }
                                                                            style={{ width: 70 }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Standard link */}
                                                                <div style={{ marginTop: 8 }}>
                                                                    {(criterion.linkedStandards || []).map(
                                                                        (std, idx) => (
                                                                            <div
                                                                                key={std.guid + idx}
                                                                                style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: 8,
                                                                                    background: 'var(--accent-soft)',
                                                                                    border: '1px solid var(--accent)',
                                                                                    borderRadius: 8,
                                                                                    padding: '6px 12px',
                                                                                    fontSize: '0.8rem',
                                                                                    marginRight: 8,
                                                                                    marginBottom: 8,
                                                                                }}
                                                                            >
                                                                                <BookOpen
                                                                                    size={13}
                                                                                    style={{ color: 'var(--accent)' }}
                                                                                />
                                                                                <span
                                                                                    style={{
                                                                                        color: 'var(--accent)',
                                                                                        fontWeight: 600,
                                                                                    }}
                                                                                >
                                                                                    {std.statementNotation ?? std.guid}
                                                                                </span>
                                                                                <span
                                                                                    style={{
                                                                                        color: 'var(--text)',
                                                                                        maxWidth: 320,
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis',
                                                                                        whiteSpace: 'nowrap',
                                                                                    }}
                                                                                >
                                                                                    {std.description}
                                                                                </span>
                                                                                <button
                                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                                    aria-label={t(
                                                                                        'rubricBuilder.action_unlink_standard'
                                                                                    )}
                                                                                    style={{
                                                                                        color: 'var(--text-muted)',
                                                                                        padding: 2,
                                                                                    }}
                                                                                    onClick={() =>
                                                                                        unlinkStandard(
                                                                                            {
                                                                                                type: 'criterion',
                                                                                                cid: criterion.id,
                                                                                            },
                                                                                            idx
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <X size={12} />
                                                                                </button>
                                                                            </div>
                                                                        )
                                                                    )}
                                                                    {criterion.linkedStandard && (
                                                                        <div
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: 8,
                                                                                background: 'var(--accent-soft)',
                                                                                border: '1px solid var(--accent)',
                                                                                borderRadius: 8,
                                                                                padding: '6px 12px',
                                                                                fontSize: '0.8rem',
                                                                                marginRight: 8,
                                                                                marginBottom: 8,
                                                                            }}
                                                                        >
                                                                            <BookOpen
                                                                                size={13}
                                                                                style={{ color: 'var(--accent)' }}
                                                                            />
                                                                            <span
                                                                                style={{
                                                                                    color: 'var(--accent)',
                                                                                    fontWeight: 600,
                                                                                }}
                                                                            >
                                                                                {criterion.linkedStandard
                                                                                    .statementNotation ??
                                                                                    criterion.linkedStandard.guid}
                                                                            </span>
                                                                            <span
                                                                                style={{
                                                                                    color: 'var(--text)',
                                                                                    maxWidth: 320,
                                                                                    overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis',
                                                                                    whiteSpace: 'nowrap',
                                                                                }}
                                                                            >
                                                                                {criterion.linkedStandard.description}
                                                                            </span>
                                                                            <button
                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                aria-label={t(
                                                                                    'rubricBuilder.action_unlink_standard'
                                                                                )}
                                                                                style={{
                                                                                    color: 'var(--text-muted)',
                                                                                    padding: 2,
                                                                                }}
                                                                                onClick={() =>
                                                                                    unlinkLegacyStandard(criterion.id)
                                                                                }
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        className="btn btn-ghost btn-sm"
                                                                        style={{ color: 'var(--accent)', marginTop: 4 }}
                                                                        onClick={() =>
                                                                            setPickingStandardFor({
                                                                                type: 'criterion',
                                                                                cid: criterion.id,
                                                                            })
                                                                        }
                                                                    >
                                                                        <Link2 size={13} />{' '}
                                                                        {t('rubricBuilder.action_link_standard')}
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-ghost btn-sm"
                                                                        style={{ color: 'var(--accent)', marginTop: 4 }}
                                                                        onClick={() => setPickingCefrFor(criterion.id)}
                                                                    >
                                                                        <BookOpen size={13} />{' '}
                                                                        {t('framework.action_link_descriptor')}
                                                                        {(criterion.cefrDescriptors || []).length +
                                                                            (criterion.frameworkDescriptors || [])
                                                                                .length >
                                                                            0 && (
                                                                            <span
                                                                                style={{
                                                                                    background: 'var(--accent)',
                                                                                    color: '#fff',
                                                                                    borderRadius: 8,
                                                                                    padding: '0px 6px',
                                                                                    fontSize: 10,
                                                                                    fontWeight: 700,
                                                                                    marginLeft: 4,
                                                                                }}
                                                                            >
                                                                                {(criterion.cefrDescriptors || [])
                                                                                    .length +
                                                                                    (
                                                                                        criterion.frameworkDescriptors ||
                                                                                        []
                                                                                    ).length}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                </div>

                                                                {/* Per-criterion CEFR skill override */}
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 8,
                                                                        marginTop: 8,
                                                                    }}
                                                                >
                                                                    <span
                                                                        className="text-xs text-muted"
                                                                        style={{ whiteSpace: 'nowrap' }}
                                                                    >
                                                                        CEFR skill:
                                                                    </span>
                                                                    <select
                                                                        value={criterion.cefrSkill ?? ''}
                                                                        onChange={(e) =>
                                                                            setCriteria((c) =>
                                                                                c.map((x) =>
                                                                                    x.id === criterion.id
                                                                                        ? {
                                                                                              ...x,
                                                                                              cefrSkill:
                                                                                                  (e.target
                                                                                                      .value as CefrSkill) ||
                                                                                                  undefined,
                                                                                          }
                                                                                        : x
                                                                                )
                                                                            )
                                                                        }
                                                                        style={{
                                                                            fontSize: '0.78rem',
                                                                            padding: '2px 6px',
                                                                            borderRadius: 5,
                                                                            border: '1px solid var(--border)',
                                                                            background: 'var(--bg-elevated)',
                                                                            color: 'var(--text)',
                                                                            maxWidth: 180,
                                                                        }}
                                                                    >
                                                                        <option value="">
                                                                            {t('rubricBuilder.cefr_skill_inherit')}
                                                                        </option>
                                                                        {CEFR_SKILLS.map((sk) => (
                                                                            <option key={sk} value={sk}>
                                                                                {i18n.language.startsWith('nl')
                                                                                    ? CEFR_SKILL_LABELS[sk].nl
                                                                                    : CEFR_SKILL_LABELS[sk].en}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>

                                                                {/* CEFR descriptors display */}
                                                                {(criterion.cefrDescriptors || []).length > 0 && (
                                                                    <div
                                                                        style={{
                                                                            marginTop: 8,
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            gap: 6,
                                                                        }}
                                                                    >
                                                                        {criterion.cefrDescriptors!.map((d) => (
                                                                            <div
                                                                                key={d.descriptorId}
                                                                                style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: 6,
                                                                                    background:
                                                                                        'color-mix(in srgb, var(--accent) 8%, transparent)',
                                                                                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                                                                    borderRadius: 8,
                                                                                    padding: '4px 10px',
                                                                                    fontSize: '0.78rem',
                                                                                }}
                                                                            >
                                                                                <span
                                                                                    style={{
                                                                                        background:
                                                                                            CEFR_LEVEL_COLORS[d.level],
                                                                                        color: '#fff',
                                                                                        borderRadius: 4,
                                                                                        padding: '1px 5px',
                                                                                        fontSize: 10,
                                                                                        fontWeight: 700,
                                                                                    }}
                                                                                >
                                                                                    {d.level}
                                                                                </span>
                                                                                <span
                                                                                    style={{
                                                                                        color: 'var(--text)',
                                                                                        maxWidth: 280,
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis',
                                                                                        whiteSpace: 'nowrap',
                                                                                    }}
                                                                                >
                                                                                    {i18n.language.startsWith('nl')
                                                                                        ? d.descriptionNl
                                                                                        : d.descriptionEn}
                                                                                </span>
                                                                                <button
                                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                                    aria-label={t(
                                                                                        'rubricBuilder.action_remove_descriptor'
                                                                                    )}
                                                                                    style={{
                                                                                        color: 'var(--text-muted)',
                                                                                        padding: 2,
                                                                                    }}
                                                                                    onClick={() =>
                                                                                        removeCefrDescriptor(
                                                                                            criterion.id,
                                                                                            d.descriptorId
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <X size={11} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* IB / Bloom's descriptors display */}
                                                                {(criterion.frameworkDescriptors || []).length > 0 && (
                                                                    <div
                                                                        style={{
                                                                            marginTop: 8,
                                                                            display: 'flex',
                                                                            flexWrap: 'wrap',
                                                                            gap: 6,
                                                                        }}
                                                                    >
                                                                        {criterion.frameworkDescriptors!.map((d) => (
                                                                            <div
                                                                                key={d.descriptorId}
                                                                                style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: 6,
                                                                                    background: `color-mix(in srgb, ${d.categoryColor} 8%, transparent)`,
                                                                                    border: `1px solid color-mix(in srgb, ${d.categoryColor} 25%, transparent)`,
                                                                                    borderRadius: 8,
                                                                                    padding: '4px 10px',
                                                                                    fontSize: '0.78rem',
                                                                                }}
                                                                            >
                                                                                <span
                                                                                    style={{
                                                                                        background: d.categoryColor,
                                                                                        color: '#fff',
                                                                                        borderRadius: 4,
                                                                                        padding: '1px 5px',
                                                                                        fontSize: 10,
                                                                                        fontWeight: 700,
                                                                                        whiteSpace: 'nowrap',
                                                                                    }}
                                                                                >
                                                                                    {i18n.language.startsWith('nl')
                                                                                        ? d.categoryLabelNl
                                                                                        : d.categoryLabelEn}
                                                                                </span>
                                                                                <span
                                                                                    style={{
                                                                                        color: 'var(--text)',
                                                                                        maxWidth: 280,
                                                                                        overflow: 'hidden',
                                                                                        textOverflow: 'ellipsis',
                                                                                        whiteSpace: 'nowrap',
                                                                                    }}
                                                                                >
                                                                                    {i18n.language.startsWith('nl')
                                                                                        ? d.descriptionNl
                                                                                        : d.descriptionEn}
                                                                                </span>
                                                                                <button
                                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                                    aria-label={t(
                                                                                        'rubricBuilder.action_remove_descriptor'
                                                                                    )}
                                                                                    style={{
                                                                                        color: 'var(--text-muted)',
                                                                                        padding: 2,
                                                                                    }}
                                                                                    onClick={() =>
                                                                                        removeFrameworkDescriptor(
                                                                                            criterion.id,
                                                                                            d.descriptorId
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <X size={11} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4, marginTop: 20 }}>
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    style={{ color: 'var(--text-dim)' }}
                                                                    onClick={() =>
                                                                        toggleCollapseCriterion(criterion.id)
                                                                    }
                                                                    title={
                                                                        collapsedCriteria.has(criterion.id)
                                                                            ? t('rubricBuilder.action_expand_criterion')
                                                                            : t(
                                                                                  'rubricBuilder.action_collapse_criterion'
                                                                              )
                                                                    }
                                                                    aria-label={
                                                                        collapsedCriteria.has(criterion.id)
                                                                            ? t('rubricBuilder.action_expand_criterion')
                                                                            : t(
                                                                                  'rubricBuilder.action_collapse_criterion'
                                                                              )
                                                                    }
                                                                >
                                                                    {collapsedCriteria.has(criterion.id) ? (
                                                                        <ChevronDown size={15} />
                                                                    ) : (
                                                                        <ChevronUp size={15} />
                                                                    )}
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    style={{ color: 'var(--accent)' }}
                                                                    onClick={() => copyToClipboard(criterion)}
                                                                    title={t('rubricBuilder.action_copy_criterion')}
                                                                    aria-label={t(
                                                                        'rubricBuilder.action_copy_criterion'
                                                                    )}
                                                                >
                                                                    <Copy size={15} />
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    style={{ color: 'var(--text-muted)' }}
                                                                    onClick={() => duplicateCriterion(cIdx)}
                                                                    title={t(
                                                                        'rubricBuilder.action_duplicate_criterion'
                                                                    )}
                                                                    aria-label={t(
                                                                        'rubricBuilder.action_duplicate_criterion'
                                                                    )}
                                                                >
                                                                    <Files size={15} />
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    style={{ color: 'var(--red)' }}
                                                                    onClick={() => deleteCriterion(criterion.id)}
                                                                    title={t('rubricBuilder.action_delete_criterion')}
                                                                    aria-label={t(
                                                                        'rubricBuilder.action_delete_criterion'
                                                                    )}
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Collapsed: level pills summary */}
                                                        {collapsedCriteria.has(criterion.id) && (
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    gap: 6,
                                                                    flexWrap: 'wrap',
                                                                    paddingLeft: 4,
                                                                }}
                                                            >
                                                                {criterion.levels.map((l) => (
                                                                    <span
                                                                        key={l.id}
                                                                        className="badge"
                                                                        style={{ fontSize: '0.75rem' }}
                                                                    >
                                                                        {l.label}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Single-point: simplified proficiency descriptor */}
                                                        {!collapsedCriteria.has(criterion.id) &&
                                                            scoringMode === 'single-point' && (
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        gap: 16,
                                                                        marginTop: 4,
                                                                        alignItems: 'flex-start',
                                                                    }}
                                                                >
                                                                    <div style={{ flex: 1 }}>
                                                                        <div
                                                                            className="text-xs text-muted"
                                                                            style={{
                                                                                marginBottom: 4,
                                                                                textTransform: 'uppercase',
                                                                                fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            {t(
                                                                                'rubricBuilder.single_point_descriptor_label'
                                                                            )}
                                                                        </div>
                                                                        <textarea
                                                                            value={
                                                                                criterion.levels[0]?.description ?? ''
                                                                            }
                                                                            onChange={(e) => {
                                                                                if (!criterion.levels[0]) {
                                                                                    addLevel(criterion.id);
                                                                                }
                                                                                updateLevel(
                                                                                    criterion.id,
                                                                                    criterion.levels[0]?.id ?? '',
                                                                                    { description: e.target.value }
                                                                                );
                                                                            }}
                                                                            placeholder={t(
                                                                                'rubricBuilder.single_point_descriptor_placeholder'
                                                                            )}
                                                                            rows={4}
                                                                            style={{
                                                                                width: '100%',
                                                                                fontSize: '0.85rem',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ width: 120, flexShrink: 0 }}>
                                                                        <div
                                                                            className="text-xs text-muted"
                                                                            style={{
                                                                                marginBottom: 4,
                                                                                textTransform: 'uppercase',
                                                                                fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            {t(
                                                                                'rubricBuilder.single_point_meets_points'
                                                                            )}
                                                                        </div>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            value={criterion.levels[0]?.maxPoints ?? 1}
                                                                            onChange={(e) =>
                                                                                updateLevel(
                                                                                    criterion.id,
                                                                                    criterion.levels[0]?.id ?? '',
                                                                                    {
                                                                                        maxPoints: Number(
                                                                                            e.target.value
                                                                                        ),
                                                                                        minPoints: 0,
                                                                                    }
                                                                                )
                                                                            }
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                        {/* Levels (hidden when collapsed or single-point) */}
                                                        {!collapsedCriteria.has(criterion.id) &&
                                                            scoringMode !== 'single-point' && (
                                                                <div style={{ overflowX: 'auto' }}>
                                                                    <Droppable
                                                                        droppableId={`levels-${criterion.id}`}
                                                                        direction="horizontal"
                                                                    >
                                                                        {(levelProvided) => (
                                                                            <div
                                                                                {...levelProvided.droppableProps}
                                                                                ref={levelProvided.innerRef}
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    flexWrap: 'wrap',
                                                                                    gap: 10,
                                                                                    paddingBottom: 4,
                                                                                }}
                                                                            >
                                                                                {criterion.levels.map(
                                                                                    (level, lvlIdx) => (
                                                                                        <Draggable
                                                                                            key={level.id}
                                                                                            draggableId={`level-${level.id}`}
                                                                                            index={lvlIdx}
                                                                                        >
                                                                                            {(lvlDraggable) => (
                                                                                                <div
                                                                                                    ref={
                                                                                                        lvlDraggable.innerRef
                                                                                                    }
                                                                                                    {...lvlDraggable.draggableProps}
                                                                                                    style={{
                                                                                                        ...lvlDraggable
                                                                                                            .draggableProps
                                                                                                            .style,
                                                                                                    }}
                                                                                                >
                                                                                                    {/* Inner level content — use a closure-wrapper to avoid shadowing */}
                                                                                                    {(() => {
                                                                                                        const levelKey = `${criterion.id}_${level.id}`;
                                                                                                        const subExpanded =
                                                                                                            expandedSubItems.has(
                                                                                                                levelKey
                                                                                                            );
                                                                                                        return (
                                                                                                            <div
                                                                                                                key={
                                                                                                                    level.id
                                                                                                                }
                                                                                                                style={{
                                                                                                                    flex: '1 1 190px',
                                                                                                                    minWidth: 190,
                                                                                                                    background:
                                                                                                                        'var(--bg-elevated)',
                                                                                                                    border: '1px solid var(--border)',
                                                                                                                    borderRadius: 8,
                                                                                                                    padding: 12,
                                                                                                                }}
                                                                                                            >
                                                                                                                {/* Level label + drag handle + delete */}
                                                                                                                <div
                                                                                                                    style={{
                                                                                                                        display:
                                                                                                                            'flex',
                                                                                                                        gap: 6,
                                                                                                                        marginBottom: 8,
                                                                                                                        alignItems:
                                                                                                                            'center',
                                                                                                                    }}
                                                                                                                >
                                                                                                                    <div
                                                                                                                        {...lvlDraggable.dragHandleProps}
                                                                                                                        aria-label={t(
                                                                                                                            'rubricBuilder.drag_reorder_level',
                                                                                                                            {
                                                                                                                                name:
                                                                                                                                    level.label ||
                                                                                                                                    t(
                                                                                                                                        'rubricBuilder.untitled'
                                                                                                                                    ),
                                                                                                                            }
                                                                                                                        )}
                                                                                                                        style={{
                                                                                                                            cursor: 'grab',
                                                                                                                            color: 'var(--text-dim)',
                                                                                                                            flexShrink: 0,
                                                                                                                            display:
                                                                                                                                'flex',
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        <GripHorizontal
                                                                                                                            size={
                                                                                                                                13
                                                                                                                            }
                                                                                                                        />
                                                                                                                    </div>
                                                                                                                    <input
                                                                                                                        type="text"
                                                                                                                        value={
                                                                                                                            level.label
                                                                                                                        }
                                                                                                                        onChange={(
                                                                                                                            e
                                                                                                                        ) =>
                                                                                                                            updateLevel(
                                                                                                                                criterion.id,
                                                                                                                                level.id,
                                                                                                                                {
                                                                                                                                    label: e
                                                                                                                                        .target
                                                                                                                                        .value,
                                                                                                                                }
                                                                                                                            )
                                                                                                                        }
                                                                                                                        style={{
                                                                                                                            flex: 1,
                                                                                                                            fontWeight: 600,
                                                                                                                        }}
                                                                                                                        placeholder={t(
                                                                                                                            'rubricBuilder.placeholder_level_name'
                                                                                                                        )}
                                                                                                                    />
                                                                                                                    {criterion
                                                                                                                        .levels
                                                                                                                        .length >
                                                                                                                        1 && (
                                                                                                                        <button
                                                                                                                            className="btn btn-ghost btn-icon btn-sm"
                                                                                                                            aria-label={t(
                                                                                                                                'rubricBuilder.action_delete_level'
                                                                                                                            )}
                                                                                                                            style={{
                                                                                                                                color: 'var(--red)',
                                                                                                                            }}
                                                                                                                            onClick={() =>
                                                                                                                                deleteLevel(
                                                                                                                                    criterion.id,
                                                                                                                                    level.id
                                                                                                                                )
                                                                                                                            }
                                                                                                                        >
                                                                                                                            <Trash2
                                                                                                                                size={
                                                                                                                                    13
                                                                                                                                }
                                                                                                                            />
                                                                                                                        </button>
                                                                                                                    )}
                                                                                                                </div>

                                                                                                                {/* Min/Max points */}
                                                                                                                <div
                                                                                                                    style={{
                                                                                                                        display:
                                                                                                                            'flex',
                                                                                                                        gap: 6,
                                                                                                                        marginBottom: 8,
                                                                                                                        alignItems:
                                                                                                                            'center',
                                                                                                                    }}
                                                                                                                >
                                                                                                                    <div
                                                                                                                        style={{
                                                                                                                            flex: 1,
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        <div
                                                                                                                            className="text-xs text-muted"
                                                                                                                            style={{
                                                                                                                                marginBottom: 2,
                                                                                                                            }}
                                                                                                                        >
                                                                                                                            {t(
                                                                                                                                'rubricBuilder.label_min_pts'
                                                                                                                            )}
                                                                                                                        </div>
                                                                                                                        <input
                                                                                                                            type="number"
                                                                                                                            value={
                                                                                                                                level.minPoints
                                                                                                                            }
                                                                                                                            min={
                                                                                                                                0
                                                                                                                            }
                                                                                                                            onChange={(
                                                                                                                                e
                                                                                                                            ) =>
                                                                                                                                updateLevel(
                                                                                                                                    criterion.id,
                                                                                                                                    level.id,
                                                                                                                                    {
                                                                                                                                        minPoints:
                                                                                                                                            Number(
                                                                                                                                                e
                                                                                                                                                    .target
                                                                                                                                                    .value
                                                                                                                                            ),
                                                                                                                                    }
                                                                                                                                )
                                                                                                                            }
                                                                                                                        />
                                                                                                                    </div>
                                                                                                                    <span
                                                                                                                        style={{
                                                                                                                            color: 'var(--text-muted)',
                                                                                                                            paddingTop: 16,
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        –
                                                                                                                    </span>
                                                                                                                    <div
                                                                                                                        style={{
                                                                                                                            flex: 1,
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        <div
                                                                                                                            className="text-xs text-muted"
                                                                                                                            style={{
                                                                                                                                marginBottom: 2,
                                                                                                                            }}
                                                                                                                        >
                                                                                                                            {t(
                                                                                                                                'rubricBuilder.label_max_pts'
                                                                                                                            )}
                                                                                                                        </div>
                                                                                                                        <input
                                                                                                                            type="number"
                                                                                                                            value={
                                                                                                                                level.maxPoints
                                                                                                                            }
                                                                                                                            min={
                                                                                                                                0
                                                                                                                            }
                                                                                                                            onChange={(
                                                                                                                                e
                                                                                                                            ) =>
                                                                                                                                updateLevel(
                                                                                                                                    criterion.id,
                                                                                                                                    level.id,
                                                                                                                                    {
                                                                                                                                        maxPoints:
                                                                                                                                            Number(
                                                                                                                                                e
                                                                                                                                                    .target
                                                                                                                                                    .value
                                                                                                                                            ),
                                                                                                                                    }
                                                                                                                                )
                                                                                                                            }
                                                                                                                        />
                                                                                                                    </div>
                                                                                                                </div>

                                                                                                                {/* Description */}
                                                                                                                <textarea
                                                                                                                    value={
                                                                                                                        level.description
                                                                                                                    }
                                                                                                                    onChange={(
                                                                                                                        e
                                                                                                                    ) =>
                                                                                                                        updateLevel(
                                                                                                                            criterion.id,
                                                                                                                            level.id,
                                                                                                                            {
                                                                                                                                description:
                                                                                                                                    e
                                                                                                                                        .target
                                                                                                                                        .value,
                                                                                                                            }
                                                                                                                        )
                                                                                                                    }
                                                                                                                    placeholder={t(
                                                                                                                        'rubricBuilder.placeholder_level_description'
                                                                                                                    )}
                                                                                                                    rows={
                                                                                                                        3
                                                                                                                    }
                                                                                                                    style={{
                                                                                                                        fontSize:
                                                                                                                            '0.8rem',
                                                                                                                        width: '100%',
                                                                                                                        marginBottom:
                                                                                                                            level.description &&
                                                                                                                            /\b(good|adequate|poor|excellent|satisfactory|bad|fair|very good|great|wonderful)\b/i.test(
                                                                                                                                level.description
                                                                                                                            ) &&
                                                                                                                            !/\b(student|demonstrates|shows|uses|writes|includes|provides|explains|applies|describes|identifies|analyzes|creates)\b/i.test(
                                                                                                                                level.description
                                                                                                                            )
                                                                                                                                ? 2
                                                                                                                                : 8,
                                                                                                                    }}
                                                                                                                />
                                                                                                                {level.description &&
                                                                                                                    /\b(good|adequate|poor|excellent|satisfactory|bad|fair|very good|great|wonderful)\b/i.test(
                                                                                                                        level.description
                                                                                                                    ) &&
                                                                                                                    !/\b(student|demonstrates|shows|uses|writes|includes|provides|explains|applies|describes|identifies|analyzes|creates)\b/i.test(
                                                                                                                        level.description
                                                                                                                    ) && (
                                                                                                                        <div
                                                                                                                            style={{
                                                                                                                                fontSize:
                                                                                                                                    '0.7rem',
                                                                                                                                color: 'var(--yellow, #b45309)',
                                                                                                                                background:
                                                                                                                                    'rgba(251,191,36,0.12)',
                                                                                                                                borderRadius: 4,
                                                                                                                                padding:
                                                                                                                                    '3px 7px',
                                                                                                                                marginBottom: 6,
                                                                                                                            }}
                                                                                                                        >
                                                                                                                            {t(
                                                                                                                                'rubricBuilder.level_quality_tip'
                                                                                                                            )}
                                                                                                                        </div>
                                                                                                                    )}

                                                                                                                {/* CEFR level tag */}
                                                                                                                <div
                                                                                                                    style={{
                                                                                                                        marginBottom: 8,
                                                                                                                    }}
                                                                                                                >
                                                                                                                    <div
                                                                                                                        className="text-xs text-muted"
                                                                                                                        style={{
                                                                                                                            marginBottom: 4,
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        CEFR
                                                                                                                        level
                                                                                                                    </div>
                                                                                                                    <select
                                                                                                                        aria-label="CEFR level"
                                                                                                                        value={
                                                                                                                            level.cefrLevel ??
                                                                                                                            ''
                                                                                                                        }
                                                                                                                        onChange={(
                                                                                                                            e
                                                                                                                        ) =>
                                                                                                                            updateLevel(
                                                                                                                                criterion.id,
                                                                                                                                level.id,
                                                                                                                                {
                                                                                                                                    cefrLevel:
                                                                                                                                        (e
                                                                                                                                            .target
                                                                                                                                            .value as
                                                                                                                                            | CefrLevel
                                                                                                                                            | '') ||
                                                                                                                                        undefined,
                                                                                                                                }
                                                                                                                            )
                                                                                                                        }
                                                                                                                        style={{
                                                                                                                            fontSize:
                                                                                                                                '0.78rem',
                                                                                                                            padding:
                                                                                                                                '3px 6px',
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        <option value="">
                                                                                                                            —
                                                                                                                        </option>
                                                                                                                        {(
                                                                                                                            [
                                                                                                                                'A1',
                                                                                                                                'A2',
                                                                                                                                'B1',
                                                                                                                                'B2',
                                                                                                                                'C1',
                                                                                                                                'C2',
                                                                                                                            ] as const
                                                                                                                        ).map(
                                                                                                                            (
                                                                                                                                lvl
                                                                                                                            ) => (
                                                                                                                                <option
                                                                                                                                    key={
                                                                                                                                        lvl
                                                                                                                                    }
                                                                                                                                    value={
                                                                                                                                        lvl
                                                                                                                                    }
                                                                                                                                >
                                                                                                                                    {
                                                                                                                                        lvl
                                                                                                                                    }
                                                                                                                                </option>
                                                                                                                            )
                                                                                                                        )}
                                                                                                                    </select>
                                                                                                                </div>

                                                                                                                {/* Sub-items toggle */}
                                                                                                                <button
                                                                                                                    className="btn btn-ghost btn-sm"
                                                                                                                    style={{
                                                                                                                        width: '100%',
                                                                                                                        justifyContent:
                                                                                                                            'space-between',
                                                                                                                    }}
                                                                                                                    onClick={() =>
                                                                                                                        toggleSubItems(
                                                                                                                            levelKey
                                                                                                                        )
                                                                                                                    }
                                                                                                                >
                                                                                                                    <span
                                                                                                                        style={{
                                                                                                                            fontSize:
                                                                                                                                '0.78rem',
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        {t(
                                                                                                                            'rubricBuilder.label_sub_items'
                                                                                                                        )}{' '}
                                                                                                                        (
                                                                                                                        {
                                                                                                                            level
                                                                                                                                .subItems
                                                                                                                                .length
                                                                                                                        }

                                                                                                                        )
                                                                                                                    </span>
                                                                                                                    <ChevronRight
                                                                                                                        size={
                                                                                                                            13
                                                                                                                        }
                                                                                                                        style={{
                                                                                                                            transform:
                                                                                                                                subExpanded
                                                                                                                                    ? 'rotate(90deg)'
                                                                                                                                    : 'none',
                                                                                                                            transition:
                                                                                                                                'transform 0.2s',
                                                                                                                        }}
                                                                                                                    />
                                                                                                                </button>

                                                                                                                {subExpanded && (
                                                                                                                    <div
                                                                                                                        style={{
                                                                                                                            marginTop: 8,
                                                                                                                            display:
                                                                                                                                'flex',
                                                                                                                            flexDirection:
                                                                                                                                'column',
                                                                                                                            gap: 6,
                                                                                                                        }}
                                                                                                                    >
                                                                                                                        {level.subItems.map(
                                                                                                                            (
                                                                                                                                si
                                                                                                                            ) => (
                                                                                                                                <div
                                                                                                                                    key={
                                                                                                                                        si.id
                                                                                                                                    }
                                                                                                                                    style={{
                                                                                                                                        display:
                                                                                                                                            'flex',
                                                                                                                                        flexDirection:
                                                                                                                                            'column',
                                                                                                                                        gap: 4,
                                                                                                                                        paddingBottom: 6,
                                                                                                                                        borderBottom:
                                                                                                                                            '1px solid var(--border)',
                                                                                                                                    }}
                                                                                                                                >
                                                                                                                                    <div
                                                                                                                                        style={{
                                                                                                                                            display:
                                                                                                                                                'flex',
                                                                                                                                            flexDirection:
                                                                                                                                                'column',
                                                                                                                                            gap: 6,
                                                                                                                                        }}
                                                                                                                                    >
                                                                                                                                        <textarea
                                                                                                                                            value={
                                                                                                                                                si.label
                                                                                                                                            }
                                                                                                                                            onChange={(
                                                                                                                                                e
                                                                                                                                            ) =>
                                                                                                                                                updateSubItem(
                                                                                                                                                    criterion.id,
                                                                                                                                                    level.id,
                                                                                                                                                    si.id,
                                                                                                                                                    {
                                                                                                                                                        label: e
                                                                                                                                                            .target
                                                                                                                                                            .value,
                                                                                                                                                    }
                                                                                                                                                )
                                                                                                                                            }
                                                                                                                                            placeholder={t(
                                                                                                                                                'rubricBuilder.placeholder_sub_item_label'
                                                                                                                                            )}
                                                                                                                                            rows={
                                                                                                                                                2
                                                                                                                                            }
                                                                                                                                            style={{
                                                                                                                                                width: '100%',
                                                                                                                                                fontSize:
                                                                                                                                                    '0.78rem',
                                                                                                                                                resize: 'vertical',
                                                                                                                                                minHeight: 40,
                                                                                                                                                fontFamily:
                                                                                                                                                    'inherit',
                                                                                                                                                padding:
                                                                                                                                                    '6px 8px',
                                                                                                                                                borderRadius: 4,
                                                                                                                                                border: '1px solid var(--border)',
                                                                                                                                            }}
                                                                                                                                        />
                                                                                                                                        <div
                                                                                                                                            style={{
                                                                                                                                                display:
                                                                                                                                                    'flex',
                                                                                                                                                gap: 6,
                                                                                                                                                alignItems:
                                                                                                                                                    'flex-end',
                                                                                                                                                justifyContent:
                                                                                                                                                    'flex-start',
                                                                                                                                            }}
                                                                                                                                        >
                                                                                                                                            <div
                                                                                                                                                style={{
                                                                                                                                                    display:
                                                                                                                                                        'flex',
                                                                                                                                                    flexDirection:
                                                                                                                                                        'column',
                                                                                                                                                    gap: 2,
                                                                                                                                                }}
                                                                                                                                            >
                                                                                                                                                <span
                                                                                                                                                    style={{
                                                                                                                                                        fontSize:
                                                                                                                                                            '9px',
                                                                                                                                                        color: 'var(--text-muted)',
                                                                                                                                                    }}
                                                                                                                                                >
                                                                                                                                                    {t(
                                                                                                                                                        'rubricBuilder.label_sub_item_min'
                                                                                                                                                    )}
                                                                                                                                                </span>
                                                                                                                                                <input
                                                                                                                                                    type="number"
                                                                                                                                                    value={
                                                                                                                                                        si.minPoints ??
                                                                                                                                                        0
                                                                                                                                                    }
                                                                                                                                                    min={
                                                                                                                                                        0
                                                                                                                                                    }
                                                                                                                                                    onChange={(
                                                                                                                                                        e
                                                                                                                                                    ) =>
                                                                                                                                                        updateSubItem(
                                                                                                                                                            criterion.id,
                                                                                                                                                            level.id,
                                                                                                                                                            si.id,
                                                                                                                                                            {
                                                                                                                                                                minPoints:
                                                                                                                                                                    Number(
                                                                                                                                                                        e
                                                                                                                                                                            .target
                                                                                                                                                                            .value
                                                                                                                                                                    ),
                                                                                                                                                            }
                                                                                                                                                        )
                                                                                                                                                    }
                                                                                                                                                    style={{
                                                                                                                                                        width: 45,
                                                                                                                                                        fontSize:
                                                                                                                                                            '0.78rem',
                                                                                                                                                        height: 26,
                                                                                                                                                        padding:
                                                                                                                                                            '2px 4px',
                                                                                                                                                    }}
                                                                                                                                                    title={t(
                                                                                                                                                        'rubricBuilder.sub_item_min_title'
                                                                                                                                                    )}
                                                                                                                                                />
                                                                                                                                            </div>
                                                                                                                                            <div
                                                                                                                                                style={{
                                                                                                                                                    display:
                                                                                                                                                        'flex',
                                                                                                                                                    flexDirection:
                                                                                                                                                        'column',
                                                                                                                                                    gap: 2,
                                                                                                                                                }}
                                                                                                                                            >
                                                                                                                                                <span
                                                                                                                                                    style={{
                                                                                                                                                        fontSize:
                                                                                                                                                            '9px',
                                                                                                                                                        color: 'var(--text-muted)',
                                                                                                                                                    }}
                                                                                                                                                >
                                                                                                                                                    {t(
                                                                                                                                                        'rubricBuilder.label_sub_item_max'
                                                                                                                                                    )}
                                                                                                                                                </span>
                                                                                                                                                <input
                                                                                                                                                    type="number"
                                                                                                                                                    value={
                                                                                                                                                        si.maxPoints ??
                                                                                                                                                        si.points ??
                                                                                                                                                        1
                                                                                                                                                    }
                                                                                                                                                    min={
                                                                                                                                                        si.minPoints ??
                                                                                                                                                        0
                                                                                                                                                    }
                                                                                                                                                    onChange={(
                                                                                                                                                        e
                                                                                                                                                    ) =>
                                                                                                                                                        updateSubItem(
                                                                                                                                                            criterion.id,
                                                                                                                                                            level.id,
                                                                                                                                                            si.id,
                                                                                                                                                            {
                                                                                                                                                                maxPoints:
                                                                                                                                                                    Number(
                                                                                                                                                                        e
                                                                                                                                                                            .target
                                                                                                                                                                            .value
                                                                                                                                                                    ),
                                                                                                                                                            }
                                                                                                                                                        )
                                                                                                                                                    }
                                                                                                                                                    style={{
                                                                                                                                                        width: 45,
                                                                                                                                                        fontSize:
                                                                                                                                                            '0.78rem',
                                                                                                                                                        height: 26,
                                                                                                                                                        padding:
                                                                                                                                                            '2px 4px',
                                                                                                                                                    }}
                                                                                                                                                    title={t(
                                                                                                                                                        'rubricBuilder.sub_item_max_title'
                                                                                                                                                    )}
                                                                                                                                                />
                                                                                                                                            </div>
                                                                                                                                            <div
                                                                                                                                                style={{
                                                                                                                                                    flex: 1,
                                                                                                                                                }}
                                                                                                                                            />
                                                                                                                                            <button
                                                                                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                                                                                style={{
                                                                                                                                                    color: 'var(--accent)',
                                                                                                                                                    height: 26,
                                                                                                                                                    width: 26,
                                                                                                                                                }}
                                                                                                                                                onClick={() =>
                                                                                                                                                    setPickingStandardFor(
                                                                                                                                                        {
                                                                                                                                                            type: 'subitem',
                                                                                                                                                            cid: criterion.id,
                                                                                                                                                            lid: level.id,
                                                                                                                                                            sid: si.id,
                                                                                                                                                        }
                                                                                                                                                    )
                                                                                                                                                }
                                                                                                                                                title={t(
                                                                                                                                                    'rubricBuilder.sub_item_link_standard_title'
                                                                                                                                                )}
                                                                                                                                                aria-label={t(
                                                                                                                                                    'rubricBuilder.sub_item_link_standard_title'
                                                                                                                                                )}
                                                                                                                                            >
                                                                                                                                                <Link2
                                                                                                                                                    size={
                                                                                                                                                        11
                                                                                                                                                    }
                                                                                                                                                />
                                                                                                                                            </button>
                                                                                                                                            <button
                                                                                                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                                                                                                style={{
                                                                                                                                                    color: 'var(--red)',
                                                                                                                                                    height: 26,
                                                                                                                                                    width: 26,
                                                                                                                                                }}
                                                                                                                                                onClick={() =>
                                                                                                                                                    deleteSubItem(
                                                                                                                                                        criterion.id,
                                                                                                                                                        level.id,
                                                                                                                                                        si.id
                                                                                                                                                    )
                                                                                                                                                }
                                                                                                                                                title={t(
                                                                                                                                                    'rubricBuilder.sub_item_delete_title'
                                                                                                                                                )}
                                                                                                                                                aria-label={t(
                                                                                                                                                    'rubricBuilder.sub_item_delete_title'
                                                                                                                                                )}
                                                                                                                                            >
                                                                                                                                                <Trash2
                                                                                                                                                    size={
                                                                                                                                                        11
                                                                                                                                                    }
                                                                                                                                                />
                                                                                                                                            </button>
                                                                                                                                        </div>
                                                                                                                                    </div>
                                                                                                                                    {si.linkedStandards &&
                                                                                                                                        si
                                                                                                                                            .linkedStandards
                                                                                                                                            .length >
                                                                                                                                            0 && (
                                                                                                                                            <div
                                                                                                                                                style={{
                                                                                                                                                    display:
                                                                                                                                                        'flex',
                                                                                                                                                    flexWrap:
                                                                                                                                                        'wrap',
                                                                                                                                                    gap: 4,
                                                                                                                                                }}
                                                                                                                                            >
                                                                                                                                                {si.linkedStandards.map(
                                                                                                                                                    (
                                                                                                                                                        std,
                                                                                                                                                        idx
                                                                                                                                                    ) => (
                                                                                                                                                        <div
                                                                                                                                                            key={
                                                                                                                                                                std.guid +
                                                                                                                                                                idx
                                                                                                                                                            }
                                                                                                                                                            style={{
                                                                                                                                                                display:
                                                                                                                                                                    'inline-flex',
                                                                                                                                                                alignItems:
                                                                                                                                                                    'center',
                                                                                                                                                                gap: 4,
                                                                                                                                                                background:
                                                                                                                                                                    'var(--accent-soft)',
                                                                                                                                                                borderRadius: 4,
                                                                                                                                                                padding:
                                                                                                                                                                    '2px 6px',
                                                                                                                                                                fontSize:
                                                                                                                                                                    '0.65rem',
                                                                                                                                                            }}
                                                                                                                                                        >
                                                                                                                                                            <span
                                                                                                                                                                style={{
                                                                                                                                                                    color: 'var(--accent)',
                                                                                                                                                                    fontWeight: 600,
                                                                                                                                                                }}
                                                                                                                                                            >
                                                                                                                                                                {std.statementNotation ??
                                                                                                                                                                    std.guid}
                                                                                                                                                            </span>
                                                                                                                                                            <button
                                                                                                                                                                className="btn btn-ghost btn-icon"
                                                                                                                                                                aria-label={t(
                                                                                                                                                                    'rubricBuilder.action_unlink_standard'
                                                                                                                                                                )}
                                                                                                                                                                style={{
                                                                                                                                                                    padding: 0,
                                                                                                                                                                    height: 'auto',
                                                                                                                                                                    minHeight: 0,
                                                                                                                                                                    color: 'var(--text-muted)',
                                                                                                                                                                }}
                                                                                                                                                                onClick={() =>
                                                                                                                                                                    unlinkStandard(
                                                                                                                                                                        {
                                                                                                                                                                            type: 'subitem',
                                                                                                                                                                            cid: criterion.id,
                                                                                                                                                                            lid: level.id,
                                                                                                                                                                            sid: si.id,
                                                                                                                                                                        },
                                                                                                                                                                        idx
                                                                                                                                                                    )
                                                                                                                                                                }
                                                                                                                                                            >
                                                                                                                                                                <X
                                                                                                                                                                    size={
                                                                                                                                                                        10
                                                                                                                                                                    }
                                                                                                                                                                />
                                                                                                                                                            </button>
                                                                                                                                                        </div>
                                                                                                                                                    )
                                                                                                                                                )}
                                                                                                                                            </div>
                                                                                                                                        )}
                                                                                                                                </div>
                                                                                                                            )
                                                                                                                        )}
                                                                                                                        <button
                                                                                                                            className="btn btn-ghost btn-sm"
                                                                                                                            style={{
                                                                                                                                fontSize:
                                                                                                                                    '0.78rem',
                                                                                                                            }}
                                                                                                                            onClick={() =>
                                                                                                                                addSubItem(
                                                                                                                                    criterion.id,
                                                                                                                                    level.id
                                                                                                                                )
                                                                                                                            }
                                                                                                                        >
                                                                                                                            <Plus
                                                                                                                                size={
                                                                                                                                    12
                                                                                                                                }
                                                                                                                            />{' '}
                                                                                                                            {t(
                                                                                                                                'rubricBuilder.action_add_sub_item'
                                                                                                                            )}
                                                                                                                        </button>
                                                                                                                    </div>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        );
                                                                                                    })()}
                                                                                                </div>
                                                                                            )}
                                                                                        </Draggable>
                                                                                    )
                                                                                )}
                                                                                {levelProvided.placeholder}
                                                                                <div
                                                                                    style={{
                                                                                        width: 210,
                                                                                        flexShrink: 0,
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                    }}
                                                                                >
                                                                                    <button
                                                                                        className="btn btn-ghost btn-sm"
                                                                                        onClick={() =>
                                                                                            addLevel(criterion.id)
                                                                                        }
                                                                                    >
                                                                                        <Plus size={14} />{' '}
                                                                                        {t(
                                                                                            'rubricBuilder.action_add_level'
                                                                                        )}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </Droppable>
                                                                </div>
                                                            )}
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>

                        {criteria.length === 0 && (
                            <div className="empty-state">
                                <p>{t('rubricBuilder.empty_state_criteria')}</p>
                                <button className="btn btn-primary" onClick={() => setCriteria([newCriterion()])}>
                                    <Plus size={16} /> {t('rubricBuilder.action_add_first_criterion')}
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
                                addCriterion={() => setCriteria((c) => [...c, newCriterion()])}
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
                        <div className="card no-print" style={{ height: 'fit-content', position: 'sticky', top: 0 }}>
                            <h3 style={{ marginBottom: 16 }}>{t('rubricBuilder.format_title')}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {[
                                    {
                                        label: t('rubricBuilder.format_criterion_width'),
                                        key: 'criterionColWidth',
                                        min: 120,
                                        max: 400,
                                    },
                                    {
                                        label: t('rubricBuilder.format_level_width'),
                                        key: 'levelColWidth',
                                        min: 100,
                                        max: 400,
                                    },
                                    { label: t('rubricBuilder.format_font_size'), key: 'fontSize', min: 10, max: 20 },
                                ].map(({ label, key, min, max }) => (
                                    <div className="form-group" key={key}>
                                        <label>{label}</label>
                                        <input
                                            type="number"
                                            value={(format as any)[key]}
                                            min={min}
                                            max={max}
                                            onChange={(e) =>
                                                setFormat((f) => ({ ...f, [key]: Number(e.target.value) }))
                                            }
                                        />
                                    </div>
                                ))}
                                {[
                                    { label: t('rubricBuilder.format_header_bg'), key: 'headerColor' },
                                    { label: t('rubricBuilder.format_header_text'), key: 'headerTextColor' },
                                    { label: t('rubricBuilder.format_accent_color'), key: 'accentColor' },
                                ].map(({ label, key }) => (
                                    <div className="form-group" key={key}>
                                        <label>{label}</label>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <input
                                                type="color"
                                                value={(format as any)[key]}
                                                onChange={(e) => setFormat((f) => ({ ...f, [key]: e.target.value }))}
                                                style={{
                                                    width: 40,
                                                    height: 36,
                                                    padding: 2,
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 6,
                                                }}
                                            />
                                            <input
                                                type="text"
                                                value={(format as any)[key]}
                                                onChange={(e) => setFormat((f) => ({ ...f, [key]: e.target.value }))}
                                                style={{ flex: 1 }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                <div className="form-group">
                                    <label>{t('rubricBuilder.format_font_family')}</label>
                                    <select
                                        value={format.fontFamily}
                                        onChange={(e) => setFormat((f) => ({ ...f, fontFamily: e.target.value }))}
                                    >
                                        <option value="Inter, system-ui, sans-serif">Sans Serif (Inter)</option>
                                        <option value="Arial, Helvetica, sans-serif">Arial</option>
                                        <option value='"Times New Roman", Times, serif'>Times New Roman</option>
                                        <option value="Georgia, serif">Georgia</option>
                                        <option value='"Courier New", Courier, monospace'>Monospace (Courier)</option>
                                        <option value="'Playfair Display', Georgia, serif">Playfair Display</option>
                                        <option value="'Oswald', Arial, sans-serif">Oswald</option>
                                        <option value="'Bebas Neue', Arial, sans-serif">Bebas Neue</option>
                                        <option value="'Special Elite', 'Courier New', monospace">Special Elite</option>
                                        <option value="'Courier Prime', 'Courier New', monospace">Courier Prime</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{t('rubricBuilder.format_level_order')}</label>
                                    <select
                                        value={format.levelOrder}
                                        onChange={(e) =>
                                            setFormat((f) => ({
                                                ...f,
                                                levelOrder: e.target.value as 'best-first' | 'worst-first',
                                            }))
                                        }
                                    >
                                        <option value="best-first">{t('rubricBuilder.format_order_best_first')}</option>
                                        <option value="worst-first">
                                            {t('rubricBuilder.format_order_worst_first')}
                                        </option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>{t('rubricBuilder.format_orientation')}</label>
                                    <select
                                        value={format.orientation || 'portrait'}
                                        onChange={(e) =>
                                            setFormat((f) => ({
                                                ...f,
                                                orientation: e.target.value as 'portrait' | 'landscape',
                                            }))
                                        }
                                    >
                                        <option value="portrait">{t('rubricBuilder.format_portrait')}</option>
                                        <option value="landscape">{t('rubricBuilder.format_landscape')}</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                                    <div className="form-group">
                                        <label>{t('rubricBuilder.format_header_align')}</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {(['left', 'center', 'right'] as const).map((align) => (
                                                <button
                                                    key={align}
                                                    className={`btn btn-sm ${format.headerTextAlign === align ? 'btn-secondary' : 'btn-ghost'}`}
                                                    onClick={() => setFormat((f) => ({ ...f, headerTextAlign: align }))}
                                                    style={{ flex: 1, textTransform: 'capitalize' }}
                                                >
                                                    {align === 'left' ? (
                                                        <AlignLeft size={14} />
                                                    ) : align === 'center' ? (
                                                        <AlignCenter size={14} />
                                                    ) : (
                                                        <AlignRight size={14} />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {[
                                        {
                                            label: t('rubricBuilder.format_show_weights'),
                                            key: 'showWeights' as keyof RubricFormat,
                                        },
                                        {
                                            label: t('rubricBuilder.format_show_points'),
                                            key: 'showPoints' as keyof RubricFormat,
                                        },
                                        {
                                            label: t('rubricBuilder.format_calculate_grade'),
                                            key: 'showCalculatedGrade' as keyof RubricFormat,
                                        },
                                        {
                                            label: t('rubricBuilder.format_show_borders'),
                                            key: 'showBorders' as keyof RubricFormat,
                                            icon: <LayoutGrid size={14} />,
                                        },
                                        {
                                            label: t('rubricBuilder.format_alternate_rows'),
                                            key: 'rowStriping' as keyof RubricFormat,
                                            icon: <Rows3 size={14} />,
                                        },
                                    ].map(({ label, key, icon }) => (
                                        <label
                                            key={key}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                cursor: 'pointer',
                                                textTransform: 'none',
                                                letterSpacing: 0,
                                                paddingLeft: 2,
                                            }}
                                        >
                                            <div
                                                style={{ color: format[key] ? 'var(--accent)' : 'var(--text-muted)' }}
                                                onClick={() => setFormat((f) => ({ ...f, [key]: !f[key] }))}
                                            >
                                                {format[key] ? <CheckSquare size={16} /> : <Square size={16} />}
                                            </div>
                                            {icon && (
                                                <span
                                                    style={{
                                                        color: 'var(--text-muted)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    {icon}
                                                </span>
                                            )}
                                            {label}
                                        </label>
                                    ))}
                                </div>
                                <button className="btn btn-secondary btn-sm" onClick={() => setFormat(DEFAULT_FORMAT)}>
                                    {t('rubricBuilder.format_reset_defaults')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Modal */}
                {showPreview && (
                    <div className="modal-overlay" onClick={() => setShowPreview(false)}>
                        <div
                            style={{
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-lg)',
                                padding: 24,
                                maxWidth: '90vw',
                                maxHeight: '90vh',
                                overflow: 'auto',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 16,
                                    gap: 12,
                                }}
                            >
                                <h3>{t('rubricBuilder.preview_title')}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {criteria.some(
                                        (c) => c.linkedStandard || (c.linkedStandards && c.linkedStandards.length > 0)
                                    ) && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                fontSize: '0.75rem',
                                                color: 'var(--text-muted)',
                                            }}
                                        >
                                            Standards:
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    background: 'var(--bg-elevated)',
                                                    borderRadius: 6,
                                                    padding: 2,
                                                    marginLeft: 4,
                                                }}
                                            >
                                                <button
                                                    className={`btn btn-sm ${!showPreviewStdDesc ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                                    onClick={() => setShowPreviewStdDesc(false)}
                                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                                >
                                                    Code
                                                </button>
                                                <button
                                                    className={`btn btn-sm ${showPreviewStdDesc ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                                    onClick={() => setShowPreviewStdDesc(true)}
                                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                                >
                                                    Description
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview(false)}>
                                        ✕ {t('rubricBuilder.action_close')}
                                    </button>
                                </div>
                            </div>
                            <RubricPreviewTable
                                name={name || t('rubricBuilder.placeholder_name').replace('...', '')}
                                criteria={criteria}
                                format={format}
                                showDescriptions={showPreviewStdDesc}
                            />
                        </div>
                    </div>
                )}

                {/* Standards Picker Modal */}
                {pickingStandardFor && settings.standardsApiKey ? (
                    <StandardsPickerModal
                        apiKey={settings.standardsApiKey}
                        onSelect={(std) => {
                            linkStandard(pickingStandardFor, std);
                            setPickingStandardFor(null);
                        }}
                        onClose={() => setPickingStandardFor(null)}
                    />
                ) : pickingStandardFor && !settings.standardsApiKey ? (
                    <div className="modal-overlay" onClick={() => setPickingStandardFor(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
                            <div className="modal-header">
                                <h3>
                                    <BookOpen size={16} /> {t('rubricBuilder.standards_modal_title')}
                                </h3>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    aria-label={t('common.close')}
                                    onClick={() => setPickingStandardFor(null)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 12 }}>
                                    <Trans i18nKey="rubricBuilder.standards_modal_desc">
                                        To link academic standards you need a{' '}
                                        <strong>Common Standards Project API key</strong>.
                                    </Trans>
                                </p>
                                <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: '0.9rem' }}>
                                    <li>
                                        Register at{' '}
                                        <a
                                            href="https://commonstandardsproject.com"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            commonstandardsproject.com
                                        </a>
                                    </li>
                                    <li>Copy your API key from the developer dashboard</li>
                                    <li>
                                        Add your app URL to the <strong>CORS Allowed Origins</strong> list
                                    </li>
                                    <li>
                                        Paste the key in <strong>Settings → Standards Integration</strong>
                                    </li>
                                </ol>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setPickingStandardFor(null)}>
                                    {t('rubricBuilder.action_close')}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setPickingStandardFor(null);
                                        navigate('/settings');
                                    }}
                                >
                                    {t('rubricBuilder.action_open_settings')}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Framework Picker Modal */}
                {pickingCefrFor &&
                    (() => {
                        const criterion = criteria.find((c) => c.id === pickingCefrFor);
                        if (!criterion) return null;
                        return (
                            <CefrPickerModal
                                linkedDescriptors={criterion.cefrDescriptors || []}
                                onAdd={(d) => addCefrDescriptor(pickingCefrFor, d)}
                                onRemove={(dId) => removeCefrDescriptor(pickingCefrFor, dId)}
                                linkedFrameworkDescriptors={criterion.frameworkDescriptors || []}
                                onAddFramework={(d) => addFrameworkDescriptor(pickingCefrFor, d)}
                                onRemoveFramework={(dId) => removeFrameworkDescriptor(pickingCefrFor, dId)}
                                onClose={() => setPickingCefrFor(null)}
                            />
                        );
                    })()}

                {/* Markdown Hint Modal */}
                {showMarkdownHint && (
                    <Modal titleId="md-hint-title" onClose={() => setShowMarkdownHint(false)} maxWidth={400}>
                        <div className="modal-header">
                            <h3 id="md-hint-title">{t('rubricBuilder.md_modal_title')}</h3>
                            <button
                                className="btn btn-ghost btn-icon"
                                aria-label={t('common.close')}
                                onClick={() => setShowMarkdownHint(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: 16 }}>{t('rubricBuilder.md_modal_desc')}</p>
                            <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
                                <li>
                                    <code>**bold**</code> for <strong>bold text</strong>
                                </li>
                                <li>
                                    <code>*italic*</code> for <em>italic text</em>
                                </li>
                            </ul>
                            <p style={{ marginTop: 16, fontSize: '0.9em', color: 'var(--text-muted)' }}>
                                Just type the asterisks around your words. The formatting will apply as soon as you
                                click outside the text box!
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={() => setShowMarkdownHint(false)}>
                                {t('rubricBuilder.action_got_it')}
                            </button>
                        </div>
                    </Modal>
                )}
            </div>

            {/* Rubric snapshot sync dialog */}
            {/* Version History Panel */}
            {showVersionHistory && id && (
                <Modal titleId="version-history-title" onClose={() => setShowVersionHistory(false)} maxWidth={500}>
                    <div className="modal-header">
                        <h3 id="version-history-title">
                            <Clock size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                            {t('rubricBuilder.version_history')}
                        </h3>
                        <button
                            className="btn btn-ghost btn-icon"
                            aria-label={t('common.close')}
                            onClick={() => setShowVersionHistory(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="modal-body">
                        {/* Save new version */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            <input
                                type="text"
                                value={versionLabel}
                                onChange={(e) => setVersionLabel(e.target.value)}
                                placeholder={t('rubricBuilder.version_label_placeholder')}
                                style={{ flex: 1 }}
                            />
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                    saveRubricVersion(id, versionLabel || undefined);
                                    setVersionLabel('');
                                }}
                            >
                                <Save size={13} /> {t('rubricBuilder.save_version')}
                            </button>
                        </div>
                        {/* Version list */}
                        {(existing?.versions ?? []).length === 0 ? (
                            <p className="text-muted text-sm">{t('rubricBuilder.no_versions_yet')}</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {[...(existing?.versions ?? [])].reverse().map((v, ri) => {
                                    const actualIndex = (existing?.versions?.length ?? 0) - 1 - ri;
                                    return (
                                        <div
                                            key={actualIndex}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                padding: '10px 12px',
                                                background: 'var(--bg-elevated)',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div
                                                    style={{
                                                        fontWeight: 600,
                                                        fontSize: '0.87rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                    }}
                                                >
                                                    {v.label?.startsWith('auto:')
                                                        ? t('rubricBuilder.version_n', { n: actualIndex + 1 })
                                                        : v.label ||
                                                          t('rubricBuilder.version_n', { n: actualIndex + 1 })}
                                                    {v.label?.startsWith('auto:') && (
                                                        <span
                                                            style={{
                                                                fontSize: '0.65rem',
                                                                padding: '1px 5px',
                                                                borderRadius: 4,
                                                                background: 'var(--bg-panel)',
                                                                color: 'var(--text-muted)',
                                                                border: '1px solid var(--border)',
                                                                fontWeight: 400,
                                                            }}
                                                        >
                                                            {t('rubricBuilder.auto_save_badge')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {new Date(v.savedAt).toLocaleString()} ·{' '}
                                                    {v.snapshot.criteria.length} {t('rubricBuilder.criteria_count')}
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setDiffAgainstVersionIndex(actualIndex)}
                                            >
                                                <GitCompare size={13} /> {t('rubricBuilder.compare_version')}
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => {
                                                    if (!window.confirm(t('rubricBuilder.confirm_restore'))) return;
                                                    restoreRubricVersion(id, actualIndex);
                                                    setShowVersionHistory(false);
                                                    window.location.reload();
                                                }}
                                            >
                                                <RotateCcw size={13} /> {t('rubricBuilder.restore_version')}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {diffAgainstVersionIndex !== null && existing?.versions?.[diffAgainstVersionIndex] && (
                <RubricVersionDiffModal
                    from={existing.versions[diffAgainstVersionIndex].snapshot}
                    to={getRubricData()}
                    onClose={() => setDiffAgainstVersionIndex(null)}
                />
            )}

            {syncDialogRubric && (
                <div className="modal-overlay" onClick={() => setSyncDialogRubric(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <h3>{t('rubricBuilder.sync_dialog_title')}</h3>
                            <button
                                className="btn btn-ghost btn-icon"
                                aria-label={t('common.close')}
                                onClick={() => setSyncDialogRubric(null)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>
                                {t('rubricBuilder.sync_dialog_body', {
                                    count:
                                        studentRubrics.filter((sr) => sr.rubricId === syncDialogRubric.id).length +
                                        peerReviews.filter((pr) => pr.rubricId === syncDialogRubric.id).length,
                                })}
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setSyncDialogRubric(null)}>
                                {t('rubricBuilder.sync_dialog_skip')}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    syncRubricSnapshot(syncDialogRubric.id, syncDialogRubric);
                                    setSyncDialogRubric(null);
                                }}
                            >
                                {t('rubricBuilder.sync_dialog_confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <ConfirmDialog {...unsavedDialogProps} />
        </>
    );
}

function RubricPreviewTable({
    name,
    criteria,
    format,
    showDescriptions = false,
}: {
    name: string;
    criteria: RubricCriterion[];
    format: RubricFormat;
    showDescriptions?: boolean;
}) {
    const { t } = useTranslation();
    const headers = criteria[0]?.levels ?? [];
    return (
        <div style={{ fontFamily: format.fontFamily, fontSize: format.fontSize }}>
            <h2 style={{ marginBottom: 12 }}>{name}</h2>
            <table className="rubric-grid" style={{ tableLayout: 'fixed' }}>
                <thead>
                    <tr style={{ background: format.headerColor, color: format.headerTextColor }}>
                        <th
                            style={{
                                width: format.criterionColWidth,
                                textAlign: 'left',
                                border: format.showBorders ? '1px solid var(--border)' : 'none',
                                padding: 8,
                            }}
                        >
                            {t('rubricBuilder.label_criterion')}
                        </th>
                        {headers.map((h) => (
                            <th
                                key={h.id}
                                style={{
                                    width: format.levelColWidth,
                                    textAlign: format.headerTextAlign,
                                    border: format.showBorders ? '1px solid var(--border)' : 'none',
                                    padding: 8,
                                }}
                            >
                                {h.label}
                                {format.showPoints
                                    ? ` (${h.minPoints}${h.minPoints !== h.maxPoints ? `–${h.maxPoints}` : ''}pts)`
                                    : ''}
                            </th>
                        ))}
                        {format.showWeights && (
                            <th
                                style={{
                                    width: 80,
                                    border: format.showBorders ? '1px solid var(--border)' : 'none',
                                    padding: 8,
                                }}
                            >
                                {t('rubricBuilder.label_weight_th')}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {criteria.map((c, i) => (
                        <tr
                            key={c.id}
                            style={{
                                background: format.rowStriping && i % 2 !== 0 ? 'var(--bg-elevated)' : 'transparent',
                            }}
                        >
                            <td
                                className="criterion-cell"
                                style={{ border: format.showBorders ? '1px solid var(--border)' : 'none', padding: 8 }}
                            >
                                <div style={{ fontWeight: 600 }}>{c.title}</div>
                                {c.description && (
                                    <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 4 }}>
                                        {c.description}
                                    </div>
                                )}
                                {c.linkedStandard && (
                                    <div
                                        style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}
                                        title={
                                            showDescriptions
                                                ? (c.linkedStandard.statementNotation ?? '')
                                                : c.linkedStandard.description
                                        }
                                    >
                                        📌{' '}
                                        {showDescriptions
                                            ? c.linkedStandard.description
                                            : (c.linkedStandard.statementNotation ?? c.linkedStandard.guid)}
                                    </div>
                                )}
                                {(c.linkedStandards || []).map((std, idx) => (
                                    <div
                                        key={idx}
                                        style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}
                                        title={showDescriptions ? (std.statementNotation ?? '') : std.description}
                                    >
                                        📌 {showDescriptions ? std.description : (std.statementNotation ?? std.guid)}
                                    </div>
                                ))}
                            </td>
                            {c.levels.map((l) => (
                                <td
                                    key={l.id}
                                    className="level-cell"
                                    style={{
                                        border: format.showBorders ? '1px solid var(--border)' : 'none',
                                        padding: 8,
                                    }}
                                >
                                    {l.description || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                    {l.subItems.length > 0 && (
                                        <ul
                                            style={{
                                                margin: '6px 0 0',
                                                padding: '0 0 0 14px',
                                                fontSize: '0.85em',
                                                color: 'var(--text-muted)',
                                            }}
                                        >
                                            {l.subItems.map((si) => (
                                                <li key={si.id}>
                                                    {si.label} ({si.points}pts)
                                                    {si.linkedStandards && si.linkedStandards.length > 0 && (
                                                        <div
                                                            style={{
                                                                fontSize: '0.85em',
                                                                color: 'var(--accent)',
                                                                marginTop: 2,
                                                            }}
                                                        >
                                                            {si.linkedStandards
                                                                .map((std) =>
                                                                    showDescriptions
                                                                        ? std.description
                                                                        : `[${std.statementNotation ?? std.guid}]`
                                                                )
                                                                .join(' ')}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </td>
                            ))}
                            {format.showWeights && (
                                <td
                                    style={{
                                        textAlign: 'center',
                                        border: format.showBorders ? '1px solid var(--border)' : 'none',
                                        padding: 8,
                                    }}
                                >
                                    {c.weight}%
                                </td>
                            )}
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
    scoringMode: ScoringMode;
    onShowMarkdownHint: () => void;
}

// Very basic Markdown parser
function MarkdownRender({
    text,
    style,
    className,
    onClick,
}: {
    text: string;
    style?: React.CSSProperties;
    className?: string;
    onClick?: () => void;
}) {
    const { t } = useTranslation();
    if (!text)
        return (
            <div style={style} className={className} onClick={onClick}>
                <span style={{ opacity: 0.5 }}>{t('rubricBuilder.placeholder_click_to_edit')}</span>
            </div>
        );

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

function RubricWysiwygEditor({
    name,
    setName,
    criteria,
    format,
    updateCriterion,
    updateLevel,
    addCriterion,
    addCriterionLevel,
    criteriaSetter,
    scoringMode,
    totalMaxPoints,
    onShowMarkdownHint,
}: WYSIWYGProps) {
    const { t } = useTranslation();
    const headers = criteria[0]?.levels ?? [];
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [showStdDesc, setShowStdDesc] = useState(false);

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
        textAlign: 'inherit',
    };

    const inputStyle: React.CSSProperties = {
        ...textareaStyle,
        display: 'inline-block',
        width: 'auto',
    };

    function moveLevel(lIdx: number, dir: -1 | 1) {
        criteriaSetter((prev) =>
            prev.map((c) => {
                const nextL = [...c.levels];
                const swap = lIdx + dir;
                if (swap < 0 || swap >= nextL.length) return c;
                [nextL[lIdx], nextL[swap]] = [nextL[swap], nextL[lIdx]];
                return { ...c, levels: nextL };
            })
        );
    }

    function moveCriterion(cIdx: number, dir: -1 | 1) {
        criteriaSetter((prev) => {
            const next = [...prev];
            const swap = cIdx + dir;
            if (swap < 0 || swap >= next.length) return prev;
            [next[cIdx], next[swap]] = [next[swap], next[cIdx]];
            return next;
        });
    }

    function deleteCriterionWysiwyg(cIdx: number) {
        criteriaSetter((prev) => prev.filter((_, i) => i !== cIdx));
    }

    function duplicateCriterionWysiwyg(cIdx: number) {
        criteriaSetter((prev) => {
            const source = prev[cIdx];
            const clone: RubricCriterion = {
                ...source,
                id: nanoid(),
                title: `${source.title} (Copy)`,
                levels: source.levels.map((l) => ({
                    ...l,
                    id: nanoid(),
                    subItems: l.subItems.map((si) => ({ ...si, id: nanoid() })),
                })),
            };
            const next = [...prev];
            next.splice(cIdx + 1, 0, clone);
            return next;
        });
    }

    function balanceWeights() {
        if (!criteria.length) return;
        // Don't modify if user has already perfectly balanced it or if there are none
        const baseWeight = Math.floor(100 / criteria.length);
        const remainder = 100 % criteria.length;

        criteriaSetter((prev) =>
            prev.map((c, i) => ({
                ...c,
                weight: baseWeight + (i === 0 ? remainder : 0), // Give remainder to first item
            }))
        );
    }

    function smartAllocatePoints() {
        if (!criteria.length || headers.length < 2) return;

        criteriaSetter((prev) =>
            prev.map((c) => {
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
                        const rawScore = pts1 > pts2 ? pts1 - step * i : pts1 + step * i;
                        const roundedScore = Math.round(rawScore * 10) / 10;
                        return { ...l, minPoints: roundedScore, maxPoints: roundedScore };
                    }),
                };
            })
        );
    }

    function insertFromBank(item: { title: string; desc: string }) {
        criteriaSetter((c) => {
            const nc = newCriterion();
            nc.title = item.title;
            nc.description = item.desc;
            // Match the level headers of the active rubric if they exist
            if (c.length > 0 && c[0].levels.length > 0) {
                nc.levels = c[0].levels.map((l) => ({
                    id: nanoid(),
                    label: l.label,
                    minPoints: l.minPoints,
                    maxPoints: l.maxPoints,
                    description: '',
                    subItems: [],
                }));
            }
            return [...c, nc];
        });
    }

    return (
        <div
            style={{
                fontFamily: format.fontFamily,
                fontSize: format.fontSize,
                background: 'var(--bg-card)',
                padding: 24,
                borderRadius: 12,
                border: '1px solid var(--border)',
                minHeight: 400,
            }}
        >
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={onShowMarkdownHint}
                    title={t('rubricBuilder.action_formatting_help')}
                    style={{ marginRight: 'auto', color: 'var(--text-muted)' }}
                >
                    <BookOpen size={13} style={{ marginRight: 4 }} /> {t('rubricBuilder.action_formatting_help')}
                </button>
                {criteria.some((c) => c.linkedStandard || (c.linkedStandards && c.linkedStandards.length > 0)) && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                        }}
                    >
                        Standards:
                        <div
                            style={{
                                display: 'flex',
                                background: 'var(--bg-elevated)',
                                borderRadius: 6,
                                padding: 2,
                                marginLeft: 4,
                            }}
                        >
                            <button
                                className={`btn btn-sm ${!showStdDesc ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                onClick={() => setShowStdDesc(false)}
                                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                            >
                                Code
                            </button>
                            <button
                                className={`btn btn-sm ${showStdDesc ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                onClick={() => setShowStdDesc(true)}
                                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                            >
                                Description
                            </button>
                        </div>
                    </div>
                )}
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={smartAllocatePoints}
                    title={t('rubricBuilder.action_smart_allocate')}
                >
                    <Wand2 size={13} /> {t('rubricBuilder.action_smart_allocate')}
                    {scoringMode === 'total-points' && (
                        <span style={{ opacity: 0.5, fontSize: '0.9em' }}>
                            ({totalMaxPoints} {t('rubricBuilder.label_max')})
                        </span>
                    )}
                </button>
                {format.showWeights && (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={balanceWeights}
                        title={t('rubricBuilder.action_balance_weights')}
                    >
                        <Wand2 size={13} /> {t('rubricBuilder.action_balance_weights')}
                    </button>
                )}
            </div>

            <textarea
                value={name}
                onChange={(e) => setName(e.target.value)}
                onInput={handleInput}
                placeholder={t('rubricBuilder.placeholder_name')}
                style={{ ...textareaStyle, fontSize: '1.8em', fontWeight: 700, marginBottom: 16, width: '100%' }}
                className="hover-border"
            />
            <table className="rubric-grid" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                    <tr style={{ background: format.headerColor, color: format.headerTextColor }}>
                        <th
                            style={{
                                width: format.criterionColWidth,
                                textAlign: 'left',
                                border: format.showBorders ? '1px solid var(--border)' : 'none',
                            }}
                        >
                            <div style={{ padding: '12px 14px' }}>{t('rubricBuilder.label_criterion')}</div>
                        </th>
                        {headers.map((h, i) => (
                            <th
                                key={h.id}
                                style={{
                                    width: format.levelColWidth,
                                    border: format.showBorders ? '1px solid var(--border)' : 'none',
                                    position: 'relative',
                                }}
                                className="designer-th"
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 4,
                                        position: 'absolute',
                                        top: 4,
                                        right: 4,
                                        opacity: 0,
                                    }}
                                    className="th-actions"
                                >
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('rubricBuilder.action_move_level_left')}
                                        onClick={() => moveLevel(i, -1)}
                                        disabled={i === 0}
                                        style={{ padding: 2, height: 20, width: 20, color: 'inherit' }}
                                    >
                                        <MoveLeft size={12} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('rubricBuilder.action_move_level_right')}
                                        onClick={() => moveLevel(i, 1)}
                                        disabled={i === headers.length - 1}
                                        style={{ padding: 2, height: 20, width: 20, color: 'inherit' }}
                                    >
                                        <MoveRight size={12} />
                                    </button>
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems:
                                            format.headerTextAlign === 'left'
                                                ? 'flex-start'
                                                : format.headerTextAlign === 'right'
                                                  ? 'flex-end'
                                                  : 'center',
                                        padding: '12px 14px',
                                    }}
                                >
                                    <textarea
                                        value={h.label}
                                        onChange={(e) => {
                                            // Update this level's label across all criteria to keep them synced
                                            criteria.forEach((c) =>
                                                updateLevel(c.id, c.levels[i].id, { label: e.target.value })
                                            );
                                        }}
                                        onInput={handleInput}
                                        placeholder={t('rubricBuilder.placeholder_level_name')}
                                        style={{ ...textareaStyle, textAlign: 'center', fontWeight: 'bold' }}
                                        className="hover-border"
                                    />
                                    {/* CEFR badge — shown if any criterion has this level tagged */}
                                    {(() => {
                                        const tagged = criteria.map((c) => c.levels[i]?.cefrLevel).find(Boolean);
                                        if (!tagged) return null;
                                        const allSame = criteria.every((c) => c.levels[i]?.cefrLevel === tagged);
                                        return (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    padding: '1px 7px',
                                                    borderRadius: 4,
                                                    background: 'var(--accent)',
                                                    color: '#fff',
                                                    display: 'inline-block',
                                                }}
                                            >
                                                {allSame ? tagged : '~'}
                                            </div>
                                        );
                                    })()}
                                    {format.showPoints && (
                                        <div
                                            style={{
                                                fontSize: '0.85em',
                                                opacity: 0.8,
                                                marginTop: 4,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 2,
                                            }}
                                        >
                                            (
                                            <input
                                                type="number"
                                                value={h.minPoints}
                                                onChange={(e) => {
                                                    criteria.forEach((c) =>
                                                        updateLevel(c.id, c.levels[i].id, {
                                                            minPoints: Number(e.target.value),
                                                        })
                                                    );
                                                }}
                                                style={{
                                                    ...inputStyle,
                                                    width: 30,
                                                    textAlign: 'center',
                                                    padding: 0,
                                                    margin: 0,
                                                }}
                                                className="hover-border"
                                            />
                                            {h.minPoints !== h.maxPoints && (
                                                <>
                                                    -
                                                    <input
                                                        type="number"
                                                        value={h.maxPoints}
                                                        onChange={(e) => {
                                                            criteria.forEach((c) =>
                                                                updateLevel(c.id, c.levels[i].id, {
                                                                    maxPoints: Number(e.target.value),
                                                                })
                                                            );
                                                        }}
                                                        style={{
                                                            ...inputStyle,
                                                            width: 30,
                                                            textAlign: 'center',
                                                            padding: 0,
                                                            margin: 0,
                                                        }}
                                                        className="hover-border"
                                                    />
                                                </>
                                            )}
                                            pts)
                                        </div>
                                    )}
                                </div>
                            </th>
                        ))}
                        {format.showWeights && (
                            <th
                                style={{
                                    width: 80,
                                    textAlign: 'center',
                                    border: format.showBorders ? '1px solid var(--border)' : 'none',
                                    padding: '12px 14px',
                                }}
                            >
                                {t('rubricBuilder.label_weight_th')}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {criteria.map((c, cIdx) => (
                        <tr
                            key={c.id}
                            style={{
                                background: format.rowStriping && cIdx % 2 !== 0 ? 'var(--bg-elevated)' : 'transparent',
                            }}
                        >
                            <td
                                className="criterion-cell designer-td"
                                style={{
                                    position: 'relative',
                                    border: format.showBorders ? '1px solid var(--border)' : 'none',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                        position: 'absolute',
                                        top: 4,
                                        right: 4,
                                        opacity: 0,
                                    }}
                                    className="td-actions"
                                >
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('rubricBuilder.action_move_criterion_up')}
                                        onClick={() => moveCriterion(cIdx, -1)}
                                        disabled={cIdx === 0}
                                        style={{ padding: 2, height: 20, width: 20 }}
                                    >
                                        <ChevronUp size={14} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        onClick={() => duplicateCriterionWysiwyg(cIdx)}
                                        title={t('rubricBuilder.action_duplicate_criterion')}
                                        aria-label={t('rubricBuilder.action_duplicate_criterion')}
                                        style={{ padding: 2, height: 20, width: 20, color: 'var(--text-muted)' }}
                                    >
                                        <Files size={13} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('rubricBuilder.action_delete_criterion')}
                                        onClick={() => deleteCriterionWysiwyg(cIdx)}
                                        style={{ padding: 2, height: 20, width: 20, color: 'var(--red)' }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label={t('rubricBuilder.action_move_criterion_down')}
                                        onClick={() => moveCriterion(cIdx, 1)}
                                        disabled={cIdx === criteria.length - 1}
                                        style={{ padding: 2, height: 20, width: 20 }}
                                    >
                                        <ChevronDown size={14} />
                                    </button>
                                </div>
                                <div style={{ padding: '10px 12px', paddingRight: 30 }}>
                                    <textarea
                                        value={c.title}
                                        onChange={(e) => updateCriterion(c.id, { title: e.target.value })}
                                        onInput={handleInput}
                                        placeholder={t('rubricBuilder.placeholder_criterion_name')}
                                        style={{ ...textareaStyle, fontWeight: 600 }}
                                        className="hover-border"
                                    />
                                    {editingCell === `${c.id}_desc` ? (
                                        <textarea
                                            autoFocus
                                            value={c.description}
                                            onChange={(e) => updateCriterion(c.id, { description: e.target.value })}
                                            onBlur={() => setEditingCell(null)}
                                            onInput={handleInput}
                                            placeholder={t('rubricBuilder.placeholder_criterion_description')}
                                            style={{
                                                ...textareaStyle,
                                                fontSize: '0.8em',
                                                color: 'var(--text-muted)',
                                                marginTop: 4,
                                                minHeight: 40,
                                            }}
                                            className="hover-border"
                                        />
                                    ) : (
                                        <MarkdownRender
                                            text={c.description}
                                            onClick={() => setEditingCell(`${c.id}_desc`)}
                                            style={{
                                                fontSize: '0.8em',
                                                color: 'var(--text-muted)',
                                                marginTop: 4,
                                                cursor: 'text',
                                            }}
                                            className="hover-border"
                                        />
                                    )}
                                    {c.linkedStandard && (
                                        <div
                                            style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}
                                            title={
                                                showStdDesc
                                                    ? (c.linkedStandard.statementNotation ?? '')
                                                    : c.linkedStandard.description
                                            }
                                        >
                                            📌{' '}
                                            {showStdDesc
                                                ? c.linkedStandard.description
                                                : (c.linkedStandard.statementNotation ?? c.linkedStandard.guid)}
                                        </div>
                                    )}
                                    {(c.linkedStandards || []).map((std, idx) => (
                                        <div
                                            key={idx}
                                            style={{ marginTop: 6, fontSize: '0.75em', color: 'var(--accent)' }}
                                            title={showStdDesc ? (std.statementNotation ?? '') : std.description}
                                        >
                                            📌 {showStdDesc ? std.description : (std.statementNotation ?? std.guid)}
                                        </div>
                                    ))}
                                </div>
                            </td>
                            {c.levels.map((l) => (
                                <td
                                    key={l.id}
                                    className="level-cell"
                                    style={{
                                        verticalAlign: 'top',
                                        border: format.showBorders ? '1px solid var(--border)' : 'none',
                                    }}
                                >
                                    <div style={{ padding: '10px 12px' }}>
                                        {editingCell === `${c.id}_${l.id}` ? (
                                            <textarea
                                                autoFocus
                                                value={l.description}
                                                onChange={(e) =>
                                                    updateLevel(c.id, l.id, { description: e.target.value })
                                                }
                                                onBlur={() => setEditingCell(null)}
                                                onInput={handleInput}
                                                placeholder={t('rubricBuilder.placeholder_level_description')}
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
                                            <ul
                                                style={{
                                                    margin: '6px 0 0',
                                                    padding: '0 0 0 14px',
                                                    fontSize: '0.85em',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {l.subItems.map((si) => (
                                                    <li key={si.id}>
                                                        {si.label} ({si.points}pts)
                                                        {si.linkedStandards && si.linkedStandards.length > 0 && (
                                                            <div
                                                                style={{
                                                                    fontSize: '0.85em',
                                                                    color: 'var(--accent)',
                                                                    marginTop: 2,
                                                                }}
                                                            >
                                                                {si.linkedStandards
                                                                    .map((std) =>
                                                                        showStdDesc
                                                                            ? std.description
                                                                            : `[${std.statementNotation ?? std.guid}]`
                                                                    )
                                                                    .join(' ')}
                                                            </div>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </td>
                            ))}
                            {format.showWeights && (
                                <td
                                    style={{
                                        textAlign: 'center',
                                        verticalAlign: 'middle',
                                        border: format.showBorders ? '1px solid var(--border)' : 'none',
                                        padding: '10px 12px',
                                    }}
                                >
                                    <input
                                        type="number"
                                        value={c.weight}
                                        onChange={(e) => updateCriterion(c.id, { weight: Number(e.target.value) })}
                                        style={{ ...inputStyle, width: 44, textAlign: 'center' }}
                                        className="hover-border"
                                    />
                                    %
                                </td>
                            )}
                        </tr>
                    ))}
                    <tr>
                        <td
                            colSpan={(format.showWeights ? 2 : 1) + headers.length}
                            style={{
                                padding: 12,
                                textAlign: 'center',
                                border: '1px dashed var(--border)',
                                background: 'transparent',
                            }}
                        >
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={addCriterion}>
                                    <Plus size={14} /> {t('rubricBuilder.action_add_row')}
                                </button>
                                <select
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '0 8px', maxWidth: 160 }}
                                    onChange={(e) => {
                                        if (!e.target.value) return;
                                        const item = RUBRIC_BANK.find((i) => i.title === e.target.value);
                                        if (item) insertFromBank(item);
                                        e.target.value = ''; // reset
                                    }}
                                >
                                    <option value="" disabled selected>
                                        {t('rubricBuilder.action_insert_from_bank')}
                                    </option>
                                    {RUBRIC_BANK.map((item) => (
                                        <option key={item.title} value={item.title}>
                                            {item.title}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => addCriterionLevel(criteria[0]?.id)}
                    disabled={!criteria.length}
                >
                    <Plus size={14} /> {t('rubricBuilder.action_add_column_level')}
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
