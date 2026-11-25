import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraggableProvided } from '@hello-pangea/dnd';
import type { LucideIcon } from 'lucide-react';
import {
    Archive,
    BarChart3,
    Check,
    Copy,
    Ellipsis,
    FileDown,
    Folder as FolderIcon,
    FolderInput,
    Pencil,
    Radio,
    ScanLine,
    Send,
    Share2,
    Table2,
    Trash2,
    Upload,
} from 'lucide-react';
import type { Class, Folder, MaterialSharing, Test } from '../../types';
import CardTile from '../ui/CardTile';
import CardGrip from '../ui/CardGrip';
import DropdownMenu from '../ui/DropdownMenu';
import FolderLocationBadge from '../Folders/FolderLocationBadge';
import SharingBadge from '../Sharing/SharingBadge';
import { isGeneratorTest } from '../../utils/placementGenerator';
import { folderTreeEntries } from '../../utils/folders';

export interface TestCardProps {
    test: Test;
    totalPoints: number;
    submittedCount: number;
    averagePercentage: number | null;
    /** Full folder path, shown only while the whole library is on screen. */
    folderPath?: string;
    shared: MaterialSharing;
    canReorder: boolean;
    folders: Folder[];
    /** Classes offered in the menu, with the ones this test is assigned to marked. */
    classes: Class[];
    assignedClassIds: string[];
    onToggleClass: (classId: string) => void;
    draggableProps?: DraggableProvided['draggableProps'];
    dragHandleProps?: DraggableProvided['dragHandleProps'];
    onOpen: () => void;
    onOpenScores: () => void;
    onOpenResults: () => void;
    resultsOpen: boolean;
    onAssign: () => void;
    onImportSubmission: () => void;
    onScan: () => void;
    onMonitor: () => void;
    onExamExport: (trigger: HTMLElement | null) => void;
    onShare: () => void;
    onDuplicate: () => void;
    onArchive: () => void;
    onDelete: () => void;
    onMove: (folderId: string | undefined) => void;
}

/** A labelled section of the menu. `role="group"` keeps the menu's children legal ARIA. */
function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
                aria-hidden="true"
                className="text-muted text-xs"
                style={{
                    padding: '6px 10px 2px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                }}
            >
                {label}
            </div>
            {children}
        </div>
    );
}

function MenuCheckItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={checked}
            className="btn btn-ghost btn-sm"
            title={label}
            style={{ justifyContent: 'flex-start' }}
            onClick={onClick}
        >
            <Check size={14} aria-hidden="true" style={{ opacity: checked ? 1 : 0 }} />
            {label}
        </button>
    );
}

function MenuDivider() {
    return <div role="separator" style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />;
}

function MenuItem({
    icon: Icon,
    label,
    onClick,
    disabled,
    danger,
    indent = 0,
    title,
}: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    indent?: number;
    /** Explains a disabled item; defaults to the label. */
    title?: string;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            className="btn btn-ghost btn-sm"
            title={title ?? label}
            disabled={disabled}
            style={{
                justifyContent: 'flex-start',
                ...(indent ? { paddingLeft: 10 + indent * 14 } : null),
                ...(danger ? { color: 'var(--red-text)' } : null),
            }}
            onClick={onClick}
        >
            <Icon size={14} aria-hidden="true" />
            {label}
        </button>
    );
}

/**
 * One test in the library.
 *
 * Three jobs, in reading order: identify the test (name + one meta line), show at a glance how it
 * is doing (submissions, average), and offer the next action. Everything that is not "open",
 * "results" or "scores" lives in one overflow menu — the previous card spread fourteen icon
 * buttons and eight badges across two rows, which made a library of twenty tests unreadable.
 *
 * Analysis and export panels deliberately do not render here: they open in `TestResultsDrawer`,
 * so a card never grows to the height of its results.
 */
const TestCard = React.forwardRef<HTMLDivElement, TestCardProps>(function TestCard(
    {
        test,
        totalPoints,
        submittedCount,
        averagePercentage,
        folderPath,
        shared,
        canReorder,
        folders,
        classes,
        assignedClassIds,
        onToggleClass,
        draggableProps,
        dragHandleProps,
        onOpen,
        onOpenScores,
        onOpenResults,
        resultsOpen,
        onAssign,
        onImportSubmission,
        onScan,
        onMonitor,
        onExamExport,
        onShare,
        onDuplicate,
        onArchive,
        onDelete,
        onMove,
    },
    ref
) {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const [menuTrigger, setMenuTrigger] = useState<HTMLButtonElement | null>(null);
    const isOverdue = !!test.dueDate && new Date(test.dueDate) < new Date();
    const canAssign = !test.scoreOnly && (test.questions.length > 0 || isGeneratorTest(test));
    const showScores = test.mode !== 'placement' && !test.scoreOnly;

    // The focused menu item unmounts with the menu, so hand focus back to the trigger first; an
    // action that opens a modal or navigates then sets its own focus on top of that.
    const fromMenu = (action: (trigger: HTMLElement | null) => void) => () => {
        menuTrigger?.focus();
        setMenuOpen(false);
        action(menuTrigger);
    };

    return (
        <CardTile
            ref={ref}
            {...draggableProps}
            hoverable
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                ...draggableProps?.style,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                {canReorder && <CardGrip {...dragHandleProps} label={t('rubricList.drag_to_reorder')} />}
                <h2
                    className="item-heading"
                    style={{
                        margin: 0,
                        flex: 1,
                        minWidth: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {test.name}
                </h2>
                <button
                    ref={(el) => {
                        menuButtonRef.current = el;
                        setMenuTrigger(el);
                    }}
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    title={t('tests.card_more_actions')}
                    aria-label={t('tests.card_more_actions')}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((open) => !open);
                    }}
                >
                    <Ellipsis size={16} />
                </button>
                <DropdownMenu
                    open={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    anchorRef={menuButtonRef}
                    minWidth={240}
                    ariaLabel={t('tests.card_more_actions')}
                >
                    <MenuGroup label={t('tests.card_menu_teaching')}>
                        <MenuItem
                            icon={Send}
                            label={t('tests.action_assign')}
                            disabled={!canAssign}
                            onClick={fromMenu(onAssign)}
                        />
                        {!test.scoreOnly && (
                            <MenuItem
                                icon={Radio}
                                label={t('tests.monitor.action_monitor')}
                                onClick={fromMenu(onMonitor)}
                            />
                        )}
                        {!test.scoreOnly && (
                            <MenuItem
                                icon={Upload}
                                label={t('tests.results.action_import')}
                                onClick={fromMenu(onImportSubmission)}
                            />
                        )}
                        {!test.scoreOnly && (
                            <MenuItem icon={ScanLine} label={t('tests.scan.action_scan')} onClick={fromMenu(onScan)} />
                        )}
                        {!test.scoreOnly && (
                            <MenuItem
                                icon={FileDown}
                                label={t('tests.export.exam.section_title')}
                                onClick={fromMenu(onExamExport)}
                            />
                        )}
                    </MenuGroup>
                    {classes.length > 0 && (
                        <>
                            <MenuDivider />
                            <MenuGroup label={t('tests.card_menu_classes')}>
                                {classes.map((cls) => (
                                    <MenuCheckItem
                                        key={cls.id}
                                        label={cls.name}
                                        checked={assignedClassIds.includes(cls.id)}
                                        onClick={() => onToggleClass(cls.id)}
                                    />
                                ))}
                            </MenuGroup>
                        </>
                    )}
                    <MenuDivider />
                    <MenuGroup label={t('tests.card_menu_organise')}>
                        <MenuItem
                            icon={FolderInput}
                            label={t('folders.move_to_unfiled')}
                            disabled={!test.folderId}
                            title={test.folderId ? undefined : t('folders.move_already_here')}
                            onClick={fromMenu(() => onMove(undefined))}
                        />
                        {folderTreeEntries(folders, 'test').map(({ folder, depth }) => (
                            <MenuItem
                                key={folder.id}
                                icon={FolderIcon}
                                label={folder.name}
                                indent={depth + 1}
                                disabled={folder.id === test.folderId}
                                title={folder.id === test.folderId ? t('folders.move_already_here') : undefined}
                                onClick={fromMenu(() => onMove(folder.id))}
                            />
                        ))}
                    </MenuGroup>
                    <MenuDivider />
                    <MenuGroup label={t('tests.card_menu_sharing')}>
                        <MenuItem icon={Share2} label={t('sharing.action_share')} onClick={fromMenu(onShare)} />
                        <MenuItem icon={Copy} label={t('tests.action_duplicate')} onClick={fromMenu(onDuplicate)} />
                    </MenuGroup>
                    <MenuDivider />
                    <MenuItem icon={Archive} label={t('tests.archive')} onClick={fromMenu(onArchive)} />
                    <MenuItem icon={Trash2} label={t('tests.action_delete')} danger onClick={fromMenu(onDelete)} />
                </DropdownMenu>
            </div>

            <div
                className="text-muted text-xs"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
            >
                <span>{t('tests.question_count', { count: test.questions.length })}</span>
                <span aria-hidden="true">·</span>
                <span>{t('tests.points_total', { count: totalPoints })}</span>
                <span aria-hidden="true">·</span>
                <span>{new Date(test.createdAt).toLocaleDateString()}</span>
                {test.dueDate && (
                    <span style={isOverdue ? { color: 'var(--red-text)', fontWeight: 700 } : undefined}>
                        {t('tests.due_date_badge', { date: new Date(test.dueDate).toLocaleDateString() })}
                    </span>
                )}
            </div>

            {(folderPath || shared.visibility !== 'private' || test.requireSEB) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {folderPath && <FolderLocationBadge path={folderPath} />}
                    <SharingBadge sharing={shared} />
                    {test.requireSEB && <span className="badge badge-green">{t('tests.seb_badge')}</span>}
                </div>
            )}

            {submittedCount > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.8rem', fontWeight: 600 }}>
                    <span>{t('tests.list_submitted', { count: submittedCount })}</span>
                    {averagePercentage !== null && (
                        <span style={{ color: 'var(--accent-text)' }}>
                            {t('tests.list_avg', { pct: averagePercentage })}
                        </span>
                    )}
                </div>
            )}

            {test.description && (
                <p
                    className="text-muted text-sm"
                    title={test.description}
                    style={{
                        margin: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {test.description}
                </p>
            )}

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 'auto',
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                }}
            >
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: '1 1 auto', justifyContent: 'center' }}
                    onClick={() => (test.scoreOnly ? onOpenScores() : onOpen())}
                >
                    {test.scoreOnly ? <Table2 size={14} /> : <Pencil size={14} />}
                    {test.scoreOnly ? t('tests.scoreSheet.action_open') : t('tests.action_edit')}
                </button>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title={t('tests.results.action_results')}
                    aria-label={t('tests.results.action_results')}
                    aria-expanded={resultsOpen}
                    disabled={submittedCount === 0}
                    style={resultsOpen ? { color: 'var(--accent-text)' } : undefined}
                    onClick={onOpenResults}
                >
                    <BarChart3 size={14} /> {t('tests.results.action_results')}
                </button>
                {showScores && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        title={t('tests.scoreSheet.action_open')}
                        aria-label={t('tests.scoreSheet.action_open')}
                        onClick={onOpenScores}
                    >
                        <Table2 size={14} /> {t('tests.scoreSheet.action_open')}
                    </button>
                )}
            </div>
        </CardTile>
    );
});

export default TestCard;
