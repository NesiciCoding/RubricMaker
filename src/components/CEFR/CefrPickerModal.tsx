import React, { useState, useMemo } from 'react';
import { X, Search, Check, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import {
    CEFR_LEVELS,
    CEFR_SKILLS,
    CEFR_SKILL_LABELS,
    CEFR_LEVEL_DESCRIPTORS,
    CEFR_LEVEL_COLORS,
    getCefrDescriptors,
} from '../../data/cefrDescriptors';
import { IB_ATTRIBUTES } from '../../data/ibLearnerProfile';
import { BLOOM_LEVELS } from '../../data/bloomsTaxonomy';
import { GRAMMAR_CATEGORIES } from '../../data/grammarStandards';
import type {
    CefrLevel,
    CefrSkill,
    LinkedCefrDescriptor,
    LinkedFrameworkDescriptor,
    AssessmentFramework,
} from '../../types';

type ActiveFramework = 'cefr' | AssessmentFramework;

interface Props {
    linkedDescriptors: LinkedCefrDescriptor[];
    onAdd: (descriptor: LinkedCefrDescriptor) => void;
    onRemove: (descriptorId: string) => void;
    linkedFrameworkDescriptors: LinkedFrameworkDescriptor[];
    onAddFramework: (descriptor: LinkedFrameworkDescriptor) => void;
    onRemoveFramework: (descriptorId: string) => void;
    onClose: () => void;
}

export default function CefrPickerModal({
    linkedDescriptors,
    onAdd,
    onRemove,
    linkedFrameworkDescriptors,
    onAddFramework,
    onRemoveFramework,
    onClose,
}: Props) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const [activeFramework, setActiveFramework] = useState<ActiveFramework>('cefr');

    // ── CEFR state ──────────────────────────────────────────────────────────────
    const [selectedSkill, setSelectedSkill] = useState<CefrSkill | null>(null);
    const [selectedLevel, setSelectedLevel] = useState<CefrLevel | null>(null);
    const [search, setSearch] = useState('');
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['B1', 'B2']));

    const linkedCefrIds = useMemo(() => new Set(linkedDescriptors.map((d) => d.descriptorId)), [linkedDescriptors]);
    const linkedFrameworkIds = useMemo(
        () => new Set(linkedFrameworkDescriptors.map((d) => d.descriptorId)),
        [linkedFrameworkDescriptors]
    );

    // ── CEFR computed ────────────────────────────────────────────────────────────
    const cefrFiltered = useMemo(() => {
        return getCefrDescriptors({
            skill: selectedSkill ?? undefined,
            level: selectedLevel ?? undefined,
        }).filter((d) => {
            if (!search) return true;
            const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
            return text.toLowerCase().includes(search.toLowerCase());
        });
    }, [selectedSkill, selectedLevel, search, lang]);

    const cefrByLevel = useMemo(() => {
        const map = new Map<CefrLevel, typeof cefrFiltered>();
        for (const level of CEFR_LEVELS) {
            const items = cefrFiltered.filter((d) => d.level === level);
            if (items.length > 0) map.set(level, items);
        }
        return map;
    }, [cefrFiltered]);

    function toggleSection(key: string) {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    function toggleCefr(d: ReturnType<typeof getCefrDescriptors>[number]) {
        if (linkedCefrIds.has(d.id)) {
            onRemove(d.id);
        } else {
            onAdd({
                descriptorId: d.id,
                level: d.level,
                skill: d.skill,
                descriptionEn: d.descriptionEn,
                descriptionNl: d.descriptionNl,
            });
        }
    }

    function toggleFramework(descriptor: LinkedFrameworkDescriptor) {
        if (linkedFrameworkIds.has(descriptor.descriptorId)) {
            onRemoveFramework(descriptor.descriptorId);
        } else {
            onAddFramework(descriptor);
        }
    }

    // ── Total linked count for footer ────────────────────────────────────────────
    const totalLinked = linkedDescriptors.length + linkedFrameworkDescriptors.length;

    const FRAMEWORK_TABS: { id: ActiveFramework; label: string }[] = [
        { id: 'cefr', label: 'CEFR / ERK' },
        { id: 'ib', label: t('framework.ib_short') },
        { id: 'blooms', label: t('framework.blooms_short') },
        { id: 'grammar', label: t('framework.grammar_short') },
    ];

    return (
        <Modal
            titleId="cefr-picker-title"
            onClose={onClose}
            maxWidth={720}
            style={{ width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}
        >
            {/* Header */}
            <div
                className="modal-header"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BookOpen size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <div>
                        <div id="cefr-picker-title" style={{ fontWeight: 600, fontSize: 15 }}>
                            {t('framework.picker_title')}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('framework.picker_subtitle')}</div>
                    </div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
                    <X size={16} />
                </button>
            </div>

            {/* Framework tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: 0,
                    borderBottom: '1px solid var(--border)',
                    padding: '0 20px',
                }}
            >
                {FRAMEWORK_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setActiveFramework(tab.id);
                            setSearch('');
                            setExpandedSections(tab.id === 'cefr' ? new Set(['B1', 'B2']) : new Set());
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            borderBottom:
                                activeFramework === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                            color: activeFramework === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                            fontWeight: activeFramework === tab.id ? 600 : 400,
                            fontSize: 13,
                            padding: '10px 14px',
                            cursor: 'pointer',
                            marginBottom: -1,
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* CEFR: skill + level filters */}
            {activeFramework === 'cefr' && (
                <div
                    style={{
                        padding: '12px 20px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                    }}
                >
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                            className={`btn btn-sm ${!selectedSkill ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setSelectedSkill(null)}
                        >
                            {t('cefr.all_skills')}
                        </button>
                        {CEFR_SKILLS.map((skill) => (
                            <button
                                key={skill}
                                className={`btn btn-sm ${selectedSkill === skill ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setSelectedSkill((prev) => (prev === skill ? null : skill))}
                            >
                                {CEFR_SKILL_LABELS[skill][lang]}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                        {CEFR_LEVELS.map((level) => (
                            <button
                                key={level}
                                className={`btn btn-sm ${selectedLevel === level ? 'btn-primary' : 'btn-ghost'}`}
                                style={
                                    selectedLevel === level
                                        ? {}
                                        : { borderColor: CEFR_LEVEL_COLORS[level], color: CEFR_LEVEL_COLORS[level] }
                                }
                                onClick={() => setSelectedLevel((prev) => (prev === level ? null : level))}
                            >
                                {level}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Grammar: level filter */}
            {activeFramework === 'grammar' && (
                <div
                    style={{
                        padding: '12px 20px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        gap: 4,
                        flexWrap: 'wrap',
                    }}
                >
                    <button
                        type="button"
                        className={`btn btn-sm ${!selectedLevel ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setSelectedLevel(null)}
                    >
                        {t('cefr.all_levels')}
                    </button>
                    {CEFR_LEVELS.map((level) => (
                        <button
                            type="button"
                            key={level}
                            className={`btn btn-sm ${selectedLevel === level ? 'btn-primary' : 'btn-ghost'}`}
                            style={
                                selectedLevel === level
                                    ? {}
                                    : { borderColor: CEFR_LEVEL_COLORS[level], color: CEFR_LEVEL_COLORS[level] }
                            }
                            onClick={() => setSelectedLevel((prev) => (prev === level ? null : level))}
                        >
                            {level}
                        </button>
                    ))}
                </div>
            )}

            {/* Search (all frameworks) */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                    <Search
                        size={14}
                        style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }}
                    />
                    <input
                        className="input"
                        style={{ paddingLeft: 32, width: '100%' }}
                        placeholder={t('cefr.search_placeholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            {/* Descriptor list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {/* ── CEFR list ── */}
                {activeFramework === 'cefr' && (
                    <>
                        {cefrByLevel.size === 0 && (
                            <div className="empty-state" style={{ padding: 40 }}>
                                {t('cefr.no_results')}
                            </div>
                        )}
                        {Array.from(cefrByLevel.entries()).map(([level, descriptors]) => {
                            const expanded = expandedSections.has(level);
                            const levelDesc = CEFR_LEVEL_DESCRIPTORS[level][lang];
                            const linkedCount = descriptors.filter((d) => linkedCefrIds.has(d.id)).length;

                            return (
                                <div key={level}>
                                    <button
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 20px',
                                            background: 'var(--bg-elevated)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            borderLeft: `4px solid ${CEFR_LEVEL_COLORS[level]}`,
                                        }}
                                        onClick={() => toggleSection(level)}
                                    >
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                fontSize: 13,
                                                color: CEFR_LEVEL_COLORS[level],
                                                minWidth: 28,
                                            }}
                                        >
                                            {level}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                                            {levelDesc}
                                        </span>
                                        {linkedCount > 0 && (
                                            <span
                                                style={{
                                                    background: 'var(--accent)',
                                                    color: '#fff',
                                                    borderRadius: 10,
                                                    padding: '1px 7px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {linkedCount}
                                            </span>
                                        )}
                                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    {expanded &&
                                        descriptors.map((descriptor) => {
                                            const isLinked = linkedCefrIds.has(descriptor.id);
                                            const text =
                                                lang === 'nl' ? descriptor.descriptionNl : descriptor.descriptionEn;
                                            const skillLabel = CEFR_SKILL_LABELS[descriptor.skill][lang];

                                            return (
                                                <DescriptorRow
                                                    key={descriptor.id}
                                                    isLinked={isLinked}
                                                    text={text}
                                                    sublabel={skillLabel}
                                                    onClick={() => toggleCefr(descriptor)}
                                                />
                                            );
                                        })}
                                </div>
                            );
                        })}
                    </>
                )}

                {/* ── IB list ── */}
                {activeFramework === 'ib' && (
                    <>
                        {IB_ATTRIBUTES.map((attr) => {
                            const filtered = attr.descriptors.filter((d) => {
                                if (!search) return true;
                                const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
                                return text.toLowerCase().includes(search.toLowerCase());
                            });
                            if (filtered.length === 0) return null;
                            const expanded = expandedSections.has(attr.id);
                            const linkedCount = filtered.filter((d) => linkedFrameworkIds.has(d.id)).length;

                            return (
                                <div key={attr.id}>
                                    <button
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 20px',
                                            background: 'var(--bg-elevated)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            borderLeft: `4px solid ${attr.color}`,
                                        }}
                                        onClick={() => toggleSection(attr.id)}
                                    >
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                fontSize: 13,
                                                color: attr.color,
                                                flex: 1,
                                            }}
                                        >
                                            {lang === 'nl' ? attr.labelNl : attr.labelEn}
                                        </span>
                                        {linkedCount > 0 && (
                                            <span
                                                style={{
                                                    background: 'var(--accent)',
                                                    color: '#fff',
                                                    borderRadius: 10,
                                                    padding: '1px 7px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {linkedCount}
                                            </span>
                                        )}
                                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    {expanded &&
                                        filtered.map((descriptor) => {
                                            const isLinked = linkedFrameworkIds.has(descriptor.id);
                                            const text =
                                                lang === 'nl' ? descriptor.descriptionNl : descriptor.descriptionEn;
                                            return (
                                                <DescriptorRow
                                                    key={descriptor.id}
                                                    isLinked={isLinked}
                                                    text={text}
                                                    sublabel={`IB — ${lang === 'nl' ? attr.labelNl : attr.labelEn}`}
                                                    onClick={() =>
                                                        toggleFramework({
                                                            descriptorId: descriptor.id,
                                                            framework: 'ib',
                                                            categoryId: attr.id,
                                                            categoryLabelEn: attr.labelEn,
                                                            categoryLabelNl: attr.labelNl,
                                                            categoryColor: attr.color,
                                                            descriptionEn: descriptor.descriptionEn,
                                                            descriptionNl: descriptor.descriptionNl,
                                                        })
                                                    }
                                                />
                                            );
                                        })}
                                </div>
                            );
                        })}
                        {IB_ATTRIBUTES.every(
                            (attr) =>
                                !attr.descriptors.some((d) => {
                                    if (!search) return true;
                                    const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
                                    return text.toLowerCase().includes(search.toLowerCase());
                                })
                        ) && (
                            <div className="empty-state" style={{ padding: 40 }}>
                                {t('cefr.no_results')}
                            </div>
                        )}
                    </>
                )}

                {/* ── Bloom's list ── */}
                {activeFramework === 'blooms' && (
                    <>
                        {BLOOM_LEVELS.map((level) => {
                            const filtered = level.descriptors.filter((d) => {
                                if (!search) return true;
                                const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
                                return text.toLowerCase().includes(search.toLowerCase());
                            });
                            if (filtered.length === 0) return null;
                            const expanded = expandedSections.has(level.id);
                            const linkedCount = filtered.filter((d) => linkedFrameworkIds.has(d.id)).length;
                            const levelLabel = lang === 'nl' ? level.labelNl : level.labelEn;
                            const verbs = lang === 'nl' ? level.verbsNl : level.verbsEn;

                            return (
                                <div key={level.id}>
                                    <button
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 20px',
                                            background: 'var(--bg-elevated)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            borderLeft: `4px solid ${level.color}`,
                                        }}
                                        onClick={() => toggleSection(level.id)}
                                    >
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                fontSize: 13,
                                                color: level.color,
                                                minWidth: 90,
                                            }}
                                        >
                                            {level.order}. {levelLabel}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: 'var(--text-muted)',
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {verbs.slice(0, 4).join(', ')}…
                                        </span>
                                        {linkedCount > 0 && (
                                            <span
                                                style={{
                                                    background: 'var(--accent)',
                                                    color: '#fff',
                                                    borderRadius: 10,
                                                    padding: '1px 7px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {linkedCount}
                                            </span>
                                        )}
                                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    {expanded &&
                                        filtered.map((descriptor) => {
                                            const isLinked = linkedFrameworkIds.has(descriptor.id);
                                            const text =
                                                lang === 'nl' ? descriptor.descriptionNl : descriptor.descriptionEn;
                                            return (
                                                <DescriptorRow
                                                    key={descriptor.id}
                                                    isLinked={isLinked}
                                                    text={text}
                                                    sublabel={`Bloom's — ${levelLabel}`}
                                                    onClick={() =>
                                                        toggleFramework({
                                                            descriptorId: descriptor.id,
                                                            framework: 'blooms',
                                                            categoryId: level.id,
                                                            categoryLabelEn: level.labelEn,
                                                            categoryLabelNl: level.labelNl,
                                                            categoryColor: level.color,
                                                            descriptionEn: descriptor.descriptionEn,
                                                            descriptionNl: descriptor.descriptionNl,
                                                        })
                                                    }
                                                />
                                            );
                                        })}
                                </div>
                            );
                        })}
                        {BLOOM_LEVELS.every(
                            (level) =>
                                !level.descriptors.some((d) => {
                                    if (!search) return true;
                                    const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
                                    return text.toLowerCase().includes(search.toLowerCase());
                                })
                        ) && (
                            <div className="empty-state" style={{ padding: 40 }}>
                                {t('cefr.no_results')}
                            </div>
                        )}
                    </>
                )}

                {/* ── Grammar list ── */}
                {activeFramework === 'grammar' &&
                    (() => {
                        const matches = (labelEn: string, labelNl: string) => {
                            if (!search) return true;
                            const text = lang === 'nl' ? labelNl : labelEn;
                            return text.toLowerCase().includes(search.toLowerCase());
                        };
                        const visibleCategories = GRAMMAR_CATEGORIES.map((cat) => ({
                            cat,
                            items: cat.items.filter(
                                (item) =>
                                    (!selectedLevel || item.level === selectedLevel) &&
                                    matches(item.labelEn, item.labelNl)
                            ),
                        })).filter((g) => g.items.length > 0);

                        if (visibleCategories.length === 0) {
                            return (
                                <div className="empty-state" style={{ padding: 40 }}>
                                    {t('cefr.no_results')}
                                </div>
                            );
                        }

                        return visibleCategories.map(({ cat, items }) => {
                            const expanded = expandedSections.has(cat.id);
                            const linkedCount = items.filter((i) => linkedFrameworkIds.has(i.id)).length;
                            const catLabel = lang === 'nl' ? cat.labelNl : cat.labelEn;
                            return (
                                <div key={cat.id}>
                                    <button
                                        type="button"
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '8px 20px',
                                            background: 'var(--bg-elevated)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            borderLeft: `4px solid ${cat.color}`,
                                        }}
                                        onClick={() => toggleSection(cat.id)}
                                    >
                                        <span style={{ fontWeight: 700, fontSize: 13, color: cat.color, flex: 1 }}>
                                            {catLabel}
                                        </span>
                                        {linkedCount > 0 && (
                                            <span
                                                style={{
                                                    background: 'var(--accent)',
                                                    color: '#fff',
                                                    borderRadius: 10,
                                                    padding: '1px 7px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {linkedCount}
                                            </span>
                                        )}
                                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                    {expanded &&
                                        items.map((item) => {
                                            const isLinked = linkedFrameworkIds.has(item.id);
                                            const text = lang === 'nl' ? item.labelNl : item.labelEn;
                                            return (
                                                <DescriptorRow
                                                    key={item.id}
                                                    isLinked={isLinked}
                                                    text={text}
                                                    sublabel={`${catLabel} · ${item.level}`}
                                                    onClick={() =>
                                                        toggleFramework({
                                                            descriptorId: item.id,
                                                            framework: 'grammar',
                                                            categoryId: cat.id,
                                                            categoryLabelEn: cat.labelEn,
                                                            categoryLabelNl: cat.labelNl,
                                                            categoryColor: cat.color,
                                                            descriptionEn: item.labelEn,
                                                            descriptionNl: item.labelNl,
                                                            level: item.level,
                                                        })
                                                    }
                                                />
                                            );
                                        })}
                                </div>
                            );
                        });
                    })()}
            </div>

            {/* Footer */}
            <div
                style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {totalLinked > 0 ? t('framework.selected_count', { count: totalLinked }) : t('cefr.none_selected')}
                </span>
                <button className="btn btn-primary btn-sm" onClick={onClose}>
                    {t('common.save')}
                </button>
            </div>
        </Modal>
    );
}

interface DescriptorRowProps {
    isLinked: boolean;
    text: string;
    sublabel: string;
    onClick: () => void;
}

function DescriptorRow({ isLinked, text, sublabel, onClick }: DescriptorRowProps) {
    return (
        <button
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '10px 20px 10px 44px',
                background: isLinked ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: '1px solid var(--border)',
            }}
            onClick={onClick}
        >
            <div
                style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: `2px solid ${isLinked ? 'var(--accent)' : 'var(--border)'}`,
                    background: isLinked ? 'var(--accent)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                }}
            >
                {isLinked && <Check size={12} color="#fff" />}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>{text}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sublabel}</div>
            </div>
        </button>
    );
}
