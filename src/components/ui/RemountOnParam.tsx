import React from 'react';
import { useParams } from 'react-router-dom';

/**
 * Pages that seed form state from the record named in the URL must remount when that record
 * changes; otherwise React reuses the instance and Save writes the previous record's values
 * over the new one (#612). `/new` and `/:id` share the key space so new → existing remounts too.
 */
export function RemountOnParam({ param, children }: { param: string; children: React.ReactNode }) {
    const value = useParams()[param];
    return <React.Fragment key={value ?? 'new'}>{children}</React.Fragment>;
}
