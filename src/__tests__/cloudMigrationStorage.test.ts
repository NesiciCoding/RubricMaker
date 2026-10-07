import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const lib = path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'storage-paths.sh');

function run(snippet: string, ...args: string[]): string {
    return execFileSync('bash', ['-c', `source "$0"; ${snippet}`, lib, ...args], { encoding: 'utf8' });
}

describe('scripts/lib/storage-paths.sh (#640)', () => {
    it('percent-encodes object names for Storage URLs but keeps the folder separators', () => {
        expect(run('urlencode_path "$1"', 'uid/my file é?#&.pdf')).toBe('uid/my%20file%20%C3%A9%3F%23%26.pdf');
        expect(run('urlencode_path "$1"', 'uid/plain_name-1.webm')).toBe('uid/plain_name-1.webm');
    });

    it('accepts normal objects and rejects names that would leave the bucket folder', () => {
        const safe = (bucket: string, name: string) =>
            run('is_safe_object "$1" "$2" && echo yes || echo no', bucket, name).trim();
        expect(safe('attachments', 'u1/a.pdf')).toBe('yes');
        expect(safe('feedback-audio', 'u1/sub/fa.webm')).toBe('yes');
        expect(safe('attachments', 'u1/my file é.pdf')).toBe('yes');
        for (const name of ['../evil', 'u1/../../etc/passwd', '/abs', 'u1//x', 'u1/./x', '']) {
            expect(safe('attachments', name)).toBe('no');
        }
        expect(safe('../x', 'u1/a.pdf')).toBe('no');
    });
});
