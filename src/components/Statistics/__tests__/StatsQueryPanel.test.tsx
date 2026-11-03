import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StatsQueryPanel from '../StatsQueryPanel';
import type { AssessmentRecord } from '../../../utils/statsQuery';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
    };
});

const mockDownloadCsv = vi.fn();
vi.mock('../../../utils/csvDownload', () => ({ downloadCsv: (...a: unknown[]) => mockDownloadCsv(...a) }));

function rec(over: Partial<AssessmentRecord>): AssessmentRecord {
    return {
        studentId: 's1',
        studentName: 'Ann',
        classId: 'c1',
        className: '1A',
        kind: 'rubric',
        assessmentKey: 'rubric:r1',
        assessmentName: 'Essay',
        subject: 'English',
        date: '2024-01-10T00:00:00Z',
        score: 40,
        ...over,
    };
}

const RECORDS = [
    rec({}),
    rec({ kind: 'test', assessmentKey: 'test:t1', assessmentName: 'Quiz', subject: '', score: 80, date: '2024-02-10' }),
    rec({ studentId: 's2', studentName: 'Bob', classId: 'c2', className: '', score: 90 }),
];
const CLASSES = [
    { id: 'c1', name: '1A' },
    { id: 'c2', name: '1B' },
];

const onSaved = vi.fn();

function renderPanel(saved = [] as React.ComponentProps<typeof StatsQueryPanel>['savedQueries']) {
    return render(
        <StatsQueryPanel records={RECORDS} classes={CLASSES} savedQueries={saved} onSavedQueriesChange={onSaved} />
    );
}

function tableLabels() {
    return within(screen.getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[0].textContent);
}

describe('StatsQueryPanel', () => {
    beforeEach(() => {
        onSaved.mockClear();
        mockDownloadCsv.mockClear();
    });

    it('groups by student by default and exports the result as CSV', () => {
        renderPanel();
        expect(tableLabels()).toEqual(['Bob', 'Ann']);
        fireEvent.click(screen.getByText('statistics.download_csv'));
        expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
        expect(String(mockDownloadCsv.mock.calls[0][0])).toContain('Bob');
    });

    it('labels every grouping in a readable way', () => {
        renderPanel();
        const group = screen.getByLabelText('statistics.query.group_by');
        fireEvent.change(group, { target: { value: 'kind' } });
        expect(tableLabels().sort()).toEqual(['statistics.query.kind_rubric', 'statistics.query.kind_test']);
        fireEvent.change(group, { target: { value: 'subject' } });
        expect(tableLabels()).toContain('statistics.query.no_subject');
        fireEvent.change(group, { target: { value: 'class' } });
        expect(tableLabels()).toContain('statistics.query.no_class');
        fireEvent.change(group, { target: { value: 'assessment' } });
        expect(tableLabels()).toContain('statistics.trend_test_label:{"name":"Quiz"}');
        fireEvent.change(group, { target: { value: 'month' } });
        expect(tableLabels()).toContain('January 2024');
    });

    it('applies filters, the pass mark, the condition and the limit', () => {
        renderPanel();
        fireEvent.change(screen.getByLabelText('statistics.query.source'), { target: { value: 'rubric' } });
        expect(tableLabels()).toEqual(['Bob', 'Ann']);
        fireEvent.change(screen.getByLabelText('statistics.query.source'), { target: { value: 'all' } });

        fireEvent.change(screen.getByLabelText('statistics.query.metric'), { target: { value: 'passRate' } });
        fireEvent.change(screen.getByLabelText('statistics.query.pass_threshold'), { target: { value: '85' } });
        expect(screen.getByRole('cell', { name: '100.0%' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('statistics.query.metric'), { target: { value: 'count' } });

        fireEvent.change(screen.getByLabelText('statistics.query.condition'), { target: { value: 'gt' } });
        fireEvent.change(screen.getByLabelText('statistics.query.condition_value'), { target: { value: '1' } });
        expect(tableLabels()).toEqual(['Ann']);
        fireEvent.change(screen.getByLabelText('statistics.query.condition'), { target: { value: '' } });

        fireEvent.change(screen.getByLabelText('statistics.query.subject'), { target: { value: 'English' } });
        fireEvent.change(screen.getByLabelText('statistics.query.date_from'), { target: { value: '2024-01-01' } });
        fireEvent.change(screen.getByLabelText('statistics.query.date_to'), { target: { value: '2024-12-31' } });
        fireEvent.change(screen.getByLabelText('statistics.query.min_score'), { target: { value: '0' } });
        fireEvent.change(screen.getByLabelText('statistics.query.max_score'), { target: { value: 'x' } });
        fireEvent.change(screen.getByLabelText('statistics.query.min_count'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('statistics.query.sort'), { target: { value: 'label' } });
        fireEvent.change(screen.getByLabelText('statistics.query.limit'), { target: { value: '1' } });
        expect(tableLabels()).toEqual(['Ann']);

        fireEvent.click(screen.getByText('statistics.query.reset'));
        expect(tableLabels()).toEqual(['Bob', 'Ann']);
    });

    it('filters by class and assessment', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: '1B' }));
        expect(tableLabels()).toEqual(['Bob']);
        fireEvent.click(screen.getByRole('button', { name: '1B' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'statistics.trend_test_label:{"name":"Quiz"}' }));
        expect(tableLabels()).toEqual(['Ann']);
        fireEvent.click(screen.getByRole('checkbox', { name: 'statistics.trend_test_label:{"name":"Quiz"}' }));
        expect(tableLabels()).toEqual(['Bob', 'Ann']);
    });

    it('starts from an example question and shows an empty state when nothing matches', () => {
        renderPanel();
        fireEvent.click(screen.getByText('statistics.query.example_declining'));
        expect(screen.getByText('statistics.query.no_results')).toBeInTheDocument();
        fireEvent.click(screen.getByText('statistics.query.example_improving'));
        expect(tableLabels()).toEqual(['Ann']);
        expect(screen.getByRole('cell', { name: '+40.0%' })).toBeInTheDocument();
    });

    it('saves, loads and deletes saved queries', () => {
        const { rerender } = renderPanel();
        const save = screen.getByRole('button', { name: /statistics.query.save$/ });
        expect(save).toBeDisabled();
        fireEvent.change(screen.getByLabelText('statistics.query.save_name'), { target: { value: '  At risk ' } });
        fireEvent.click(save);
        const saved = onSaved.mock.calls[0][0];
        expect(saved).toEqual([expect.objectContaining({ name: 'At risk' })]);

        const stored = [{ ...saved[0], query: { ...saved[0].query, groupBy: 'kind' as const } }];
        rerender(
            <StatsQueryPanel records={RECORDS} classes={CLASSES} savedQueries={stored} onSavedQueriesChange={onSaved} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'At risk' }));
        expect(tableLabels()).toHaveLength(2);
        expect(tableLabels()).toContain('statistics.query.kind_test');
        fireEvent.click(screen.getByLabelText('statistics.query.delete_saved:{"name":"At risk"}'));
        expect(onSaved).toHaveBeenLastCalledWith([]);
    });
});
