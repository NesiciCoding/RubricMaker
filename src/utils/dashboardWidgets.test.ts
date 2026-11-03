import { describe, expect, it } from 'vitest';
import { DASHBOARD_WIDGET_IDS, moveItem, resolveDashboardWidgetOrder } from './dashboardWidgets';

describe('resolveDashboardWidgetOrder', () => {
    it('defaults to every widget in its shipped order when nothing is stored', () => {
        const { order, hidden } = resolveDashboardWidgetOrder(undefined);
        expect(order).toEqual(DASHBOARD_WIDGET_IDS);
        expect(hidden.size).toBe(0);
    });

    it('appends a widget missing from a stored order (shipped after the teacher last reordered)', () => {
        const stored = { order: ['quickStart', 'snapshot'], hidden: ['snapshot'] };
        const { order, hidden } = resolveDashboardWidgetOrder(stored);
        expect(order[0]).toBe('quickStart');
        expect(order[1]).toBe('snapshot');
        expect(order).toHaveLength(DASHBOARD_WIDGET_IDS.length);
        expect(hidden.has('snapshot')).toBe(true);
    });

    it('drops a stored id that no longer exists', () => {
        const { order } = resolveDashboardWidgetOrder({ order: ['snapshot', 'retiredWidget'] });
        expect(order).not.toContain('retiredWidget');
        expect(order).toHaveLength(DASHBOARD_WIDGET_IDS.length);
    });
});

describe('moveItem', () => {
    it('moves an element from one index to another without mutating the input', () => {
        const input = ['a', 'b', 'c', 'd'];
        const result = moveItem(input, 0, 2);
        expect(result).toEqual(['b', 'c', 'a', 'd']);
        expect(input).toEqual(['a', 'b', 'c', 'd']);
    });

    it('moves an element backwards', () => {
        expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    });
});
