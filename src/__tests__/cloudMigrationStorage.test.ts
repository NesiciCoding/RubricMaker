import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const libDir = path.resolve(__dirname, '..', '..', 'scripts', 'lib');

function call(fn: string, ...args: string[]) {
    return spawnSync('bash', ['-c', 'source ./storage-paths.sh; "$@"', 'bash', fn, ...args], {
        cwd: libDir,
        encoding: 'utf8',
    });
}

describe('scripts/lib/storage-paths.sh (#640)', () => {
    it('percent-encodes object names for Storage URLs but keeps the folder separators', () => {
        expect(call('urlencode_path', 'uid/my file é?#&.pdf').stdout).toBe('uid/my%20file%20%C3%A9%3F%23%26.pdf');
        expect(call('urlencode_path', 'uid/plain_name-1.webm').stdout).toBe('uid/plain_name-1.webm');
    });

    it('accepts normal objects and rejects names that would leave the bucket folder', () => {
        const safe = (bucket: string, name: string) =>
            call('is_safe_object', bucket, name).status === 0 ? 'yes' : 'no';
        expect(safe('attachments', 'u1/a.pdf')).toBe('yes');
        expect(safe('feedback-audio', 'u1/sub/fa.webm')).toBe('yes');
        expect(safe('attachments', 'u1/my file é.pdf')).toBe('yes');
        for (const name of ['../evil', 'u1/../../etc/passwd', '/abs', 'u1//x', 'u1/./x', '']) {
            expect(safe('attachments', name)).toBe('no');
        }
        expect(safe('../x', 'u1/a.pdf')).toBe('no');
    });
});
