// Which overdue attachment rows the retention purge may act on. Ids and storage paths are chosen by the
// uploading user, so a row is only purged when the id is a plain name and the file sits in its owner's own
// folder under a plain file name. scripts/delete-old-attachments.sh applies the same rule (keep the two in
// step). Dependency-free like seededShuffle.ts so it runs under Deno and vitest.

export interface PurgeRow {
    id: string;
    owner_id: string;
    storage_path: string;
}

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_NAME = /^[A-Za-z0-9_-]{1,64}(\.[A-Za-z0-9]{1,10})?$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isPurgeableRow(row: PurgeRow): boolean {
    if (!NAME.test(row.id) || !UUID.test(row.owner_id)) return false;
    const [folder, name, ...rest] = row.storage_path.split('/');
    return rest.length === 0 && folder.toLowerCase() === row.owner_id.toLowerCase() && FILE_NAME.test(name ?? '');
}
