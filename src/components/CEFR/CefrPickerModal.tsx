import React, { useState, useMemo } from 'react';
import { X, Search, Plus, Check, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    CEFR_LEVELS,
    CEFR_SKILLS,
    CEFR_SKILL_LABELS,
    CEFR_LEVEL_DESCRIPTORS,
    CEFR_LEVEL_COLORS,
    getCefrDescriptors,
} from '../../data/cefrDescriptors';
import type { CefrLevel, CefrSkill, LinkedCefrDescriptor } from '../../types';

interface Props {
    /** Already-linked descriptors for this criterion (so we can show checkmarks) */
    linkedDescriptors: LinkedCefrDescriptor[];
    onAdd: (descriptor: LinkedCefrDescriptor) => void;
    onRemove: (descriptorId: string) => void;
    onClose: () => void;
}

export default function CefrPickerModal({ linkedDescriptors, onAdd, onRemove, onClose }: Props) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const [selectedSkill, setSelectedSkill] = useState<CefrSkill | null>(null);
    const [selectedLevel, setSelectedLevel] = useState<CefrLevel | null>(null);
    const [search, setSearch] = useState('');
    const [expandedLevels, setExpandedLevels] = useState<Set<CefrLevel>>(new Set(['B1', 'B2']));

    const linkedIds = useMemo(() => new Set(linkedDescriptors.map(d => d.descriptorId)), [linkedDescriptors]);

    const filtered = useMemo(() => {
        return getCefrDescriptors({
            skill: selectedSkill ?? undefined,
            level: selectedLevel ?? undefined,
        }).filter(d => {
            if (!search) return true;
            const text = lang === 'nl' ? d.descriptionNl : d.descriptionEn;
            return text.toLowerCase().includes(search.toLowerCase());
        });
    }, [selectedSkill, selectedLevel, search, lang]);

    // Group filtered descriptors by level
    const byLevel = useMemo(() => {
        const map = new Map<CefrLevel, typeof filtered>();
        for (const level of CEFR_LEVELS) {
            const items = filtered.filter(d => d.level === level);
            if (items.length > 0) map.set(level, items);
        }
        return map;
    }, [filtered]);

    function toggleLevel(level: CefrLevel) {
        setExpandedLevels(prev => {
            const next = new Set(prev);
            next.has(level) ? next.delete(level) : next.add(level);
            return next;
        });
    }

    function toggleDescriptor(d: typeof filtered[number]) {
        if (linkedIds.has(d.id)) {
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

    return (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal" style={{ maxWidth: 720, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BookOpen size={18} style={{ color: 'var(--accent)' }} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{t('cefr.picker_title')}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('cefr.picker_subtitle')}</div>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16} /></button>
                </div>

                {/* Filters */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {/* Skill filter */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                            className={`btn btn-sm ${!selectedSkill ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setSelectedSkill(null)}
                        >{t('cefr.all_skills')}</button>
                        {CEFR_SKILLS.map(skill => (
                            <button
                                key={skill}
                                className={`btn btn-sm ${selectedSkill === skill ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setSelectedSkill(prev => prev === skill ? null : skill)}
                            >
                                {CEFR_SKILL_LABELS[skill][lang]}
                            </button>
                        ))}
                    </div>

                    {/* Level filter */}
                    <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                        {CEFR_LEVELS.map(level => (
                            <button
                                key={level}
                                className={`btn btn-sm ${selectedLevel === level ? 'btn-primary' : 'btn-ghost'}`}
                                style={selectedLevel === level ? {} : { borderColor: CEFR_LEVEL_COLORS[level], color: CEFR_LEVEL_COLORS[level] }}
                                onClick={() => setSelectedLevel(prev => prev === level ? null : level)}
                            >
                                {level}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search */}
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            className="input"
                            style={{ paddingLeft: 32, width: '100%' }}
                            placeholder={t('cefr.search_placeholder')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Descriptor list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                    {byLevel.size === 0 && (
                        <div className="empty-state" style={{ padding: 40 }}>{t('cefr.no_results')}</div>
                    )}
                    {Array.from(byLevel.entries()).map(([level, descriptors]) => {
                        const expanded = expandedLevels.has(level);
                        const levelDesc = CEFR_LEVEL_DESCRIPTORS[level][lang];
                        const linkedCount = descriptors.filter(d => linkedIds.has(d.id)).length;

                        return (
                            <div key={level}>
                                {/* Level header */}
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
                                    onClick={() => toggleLevel(level)}
                                >
                                    <span style={{
                                        fontWeight: 700,
                                        fontSize: 13,
                                        color: CEFR_LEVEL_COLORS[level],
                                        minWidth: 28,
                                    }}>{level}</span>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{levelDesc}</span>
                                    {linkedCount > 0 && (
                                        <span style={{
                                            background: 'var(--accent)',
                                            color: '#fff',
                                            borderRadius: 10,
                                            padding: '1px 7px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                        }}>{linkedCount}</span>
                                    )}
                                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>

                                {/* Descriptors for this level */}
                                {expanded && descriptors.map(descriptor => {
                                    const isLinked = linkedIds.has(descriptor.id);
                                    const text = lang === 'nl' ? descriptor.descriptionNl : descriptor.descriptionEn;
                                    const skillLabel = CEFR_SKILL_LABELS[descriptor.skill][lang];

                                    return (
                                        <button
                                            key={descriptor.id}
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
                                            onClick={() => toggleDescriptor(descriptor)}
                                        >
                                            <div style={{
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
                                            }}>
                                                {isLinked && <Check size={12} color="#fff" />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>{text}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{skillLabel}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {linkedDescriptors.length > 0
                            ? t('cefr.selected_count', { count: linkedDescriptors.length })
                            : t('cefr.none_selected')}
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={onClose}>{t('common.save')}</button>
                </div>
            </div>
        </div>
    );
}
