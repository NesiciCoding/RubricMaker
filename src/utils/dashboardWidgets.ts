import type { AppSettings } from '../types';

/** Every block the Dashboard can show, in the order they appear when a teacher has never customized the page. */
export const DASHBOARD_WIDGET_IDS = [
    'snapshot',
    'greeting',
    'stats',
    'atRisk',
    'needsGrading',
    'recentActivity',
    'classCefr',
    'quickActions',
    'quickStart',
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

const KNOWN_IDS = new Set<string>(DASHBOARD_WIDGET_IDS);

function isDashboardWidgetId(id: string): id is DashboardWidgetId {
    return KNOWN_IDS.has(id);
}

/**
 * Resolves a teacher's stored widget layout against the current widget set: a widget the
 * teacher never saw before (shipped after their last reorder) is appended at the end; a
 * stored id that no longer exists (a removed widget) is dropped.
 */
export function resolveDashboardWidgetOrder(stored: AppSettings['dashboardWidgets'] | undefined): {
    order: DashboardWidgetId[];
    hidden: Set<DashboardWidgetId>;
} {
    const storedOrder = Array.isArray(stored?.order) ? stored.order.filter(isDashboardWidgetId) : [];
    const missing = DASHBOARD_WIDGET_IDS.filter((id) => !storedOrder.includes(id));
    const hidden = new Set(Array.isArray(stored?.hidden) ? stored.hidden.filter(isDashboardWidgetId) : []);
    return { order: [...storedOrder, ...missing], hidden };
}

/** Moves the item at `fromIndex` to `toIndex`, returning a new array. */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
}
