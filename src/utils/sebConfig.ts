import { saveAs } from 'file-saver';

/** Builds a Safe Exam Browser (.seb) config that locks the browser to a single essay URL. */
export function buildSebConfigXml(startUrl: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>startURL</key>
\t<string>${startUrl}</string>
\t<key>allowQuit</key>
\t<false/>
\t<key>quitURL</key>
\t<string>${window.location.origin}/#/seb-done</string>
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
\t\t\t<string>${window.location.origin}.*</string>
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
    saveAs(blob, `${fileNameBase.replace(/\s+/g, '-').toLowerCase()}.seb`);
}
