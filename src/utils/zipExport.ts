import { saveAs } from 'file-saver';
import { createUniqueFilenames } from './exportDataPrep';

/**
 * Downloads several single-file exports as one archive.
 *
 * A batch that fires N `saveAs()` calls in a row makes browsers prompt for — and lets the user block —
 * every download after the first, so the batch silently produced nothing while the page still reported
 * success (#701). One zip keeps a batch to a single download. Members are de-duplicated with the same
 * `name_2.docx` scheme a folder of separate downloads would have used.
 */
export async function saveZippedFiles(files: { name: string; blob: Blob }[], zipName: string): Promise<void> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const claim = createUniqueFilenames();
    for (const { name, blob } of files) zip.file(claim(name), blob);
    saveAs(await zip.generateAsync({ type: 'blob' }), zipName);
}
