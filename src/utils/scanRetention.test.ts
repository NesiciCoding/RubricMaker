import { describe, it, expect, vi } from 'vitest';
import type { Scan } from '../types';
import { overdueScans, overdueScanIds, sweepOverdueScans } from './scanRetention';

function scan(id: string, schoolYear: Scan['schoolYear']): Scan {
    return { id, ocrText: '', schoolYear, createdAt: '2026-01-01T00:00:00.000Z' };
}

const current = '2026-2027';
const scans: Scan[] = [scan('scan_old1', '2024-2025'), scan('scan_old2', '2025-2026'), scan('scan_cur', '2026-2027')];

describe('overdueScans', () => {
    it('returns only scans from academic years before the current one', () => {
        expect(overdueScans(scans, current).map((s) => s.id)).toEqual(['scan_old1', 'scan_old2']);
    });

    it('keeps a scan stamped with the current year', () => {
        expect(overdueScans([scan('scan_cur', current)], current)).toEqual([]);
    });

    it('defaults the current year to today when omitted', () => {
        expect(overdueScans([scan('scan_ancient', '2000-2001')])).toHaveLength(1);
    });
});

describe('overdueScanIds', () => {
    it('maps overdue scans to their ids', () => {
        expect(overdueScanIds(scans, current)).toEqual(['scan_old1', 'scan_old2']);
    });
});

describe('sweepOverdueScans', () => {
    it('deletes each overdue scan and returns the swept ids', async () => {
        const deleteScan = vi.fn(async () => {});
        const swept = await sweepOverdueScans(scans, deleteScan, current);
        expect(swept).toEqual(['scan_old1', 'scan_old2']);
        expect(deleteScan).toHaveBeenCalledTimes(2);
        expect(deleteScan).toHaveBeenCalledWith('scan_old1');
        expect(deleteScan).toHaveBeenCalledWith('scan_old2');
    });

    it('does not touch the deleter when nothing is overdue', async () => {
        const deleteScan = vi.fn(async () => {});
        const swept = await sweepOverdueScans([scan('scan_cur', current)], deleteScan, current);
        expect(swept).toEqual([]);
        expect(deleteScan).not.toHaveBeenCalled();
    });

    it('surfaces a deleter failure before sweeping the rest', async () => {
        const deleteScan = vi.fn(async (id: string) => {
            if (id === 'scan_old1') throw new Error('delete boom');
        });
        await expect(sweepOverdueScans(scans, deleteScan, current)).rejects.toThrow('delete boom');
        expect(deleteScan).toHaveBeenCalledTimes(1);
    });
});
