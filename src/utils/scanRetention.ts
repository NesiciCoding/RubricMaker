import type { Scan } from '../types';
import { getAcademicYear, isBeyondRetention } from './academicYear';

/**
 * Client-side counterpart to the server's get_overdue_scans() (migration 074): scans
 * are kept for the current academic year only, so any scan stamped with an earlier
 * `schoolYear` is overdue. The server sweep purges cloud copies on its own schedule;
 * these helpers let the app purge local blobs/records on boot or after a year rollover.
 */

/** The scans past the one-academic-year retention cap relative to `current`. */
export function overdueScans(scans: Scan[], current = getAcademicYear()): Scan[] {
    return scans.filter((scan) => isBeyondRetention(scan.schoolYear, current));
}

/** Ids of the scans past the retention cap. */
export function overdueScanIds(scans: Scan[], current = getAcademicYear()): string[] {
    return overdueScans(scans, current).map((scan) => scan.id);
}

/**
 * Delete every overdue scan via the supplied deleter (sequential, so a failure surfaces
 * before the rest are touched), returning the ids actually swept.
 */
export async function sweepOverdueScans(
    scans: Scan[],
    deleteScan: (id: string) => Promise<void>,
    current = getAcademicYear()
): Promise<string[]> {
    const ids = overdueScanIds(scans, current);
    for (const id of ids) {
        await deleteScan(id);
    }
    return ids;
}
