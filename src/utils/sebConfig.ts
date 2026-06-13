import { saveAs } from 'file-saver';

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Builds a Safe Exam Browser (.seb) config that locks the browser to a single essay URL. */
export function buildSebConfigXml(startUrl: string): string {
    const base = `${window.location.origin}${window.location.pathname}`;
    const quitUrl = escapeXml(`${base}#/seb-done`);
    const filterExpression = escapeXml(`${base}.*`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>startURL</key>
\t<string>${escapeXml(startUrl)}</string>
\t<key>allowQuit</key>
\t<false/>
\t<key>quitURL</key>
\t<string>${quitUrl}</string>
\t<key>quitURLConfirm</key>
\t<false/>
\t<key>browserWindowAllowAddressBar</key>
\t<false/>
\t<key>URLFilterEnable</key>
\t<true/>
\t<key>URLFilterRules</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<integer>1</integer>
\t\t\t<key>active</key>
\t\t\t<true/>
\t\t\t<key>expression</key>
\t\t\t<string>${filterExpression}</string>
\t\t\t<key>regex</key>
\t\t\t<false/>
\t\t</dict>
\t</array>
</dict>
</plist>`;
}

/** Downloads a `.seb` config file that opens `startUrl` in Safe Exam Browser. */
export function downloadSebConfig(startUrl: string, fileNameBase: string): void {
    const xml = buildSebConfigXml(startUrl);
    const blob = new Blob([xml], { type: 'application/xml' });
    const slug = fileNameBase
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    saveAs(blob, `${slug || 'essay'}.seb`);
}
