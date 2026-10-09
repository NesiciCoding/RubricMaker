import { describe, it, expect } from 'vitest';
import { auditActorLabel, formatAuditDetails } from './auditFormat';

describe('formatAuditDetails', () => {
    it('renders top-level and nested from/to changes', () => {
        expect(formatAuditDetails({ from: 'user', to: 'teacher' })).toBe('user → teacher');
        expect(formatAuditDetails({ retention_years: { from: 3, to: 5 } })).toBe('retention_years: 3 → 5');
        expect(formatAuditDetails({ from: null, to: 'school-1' })).toBe('— → school-1');
    });

    it('renders plain values and objects', () => {
        expect(formatAuditDetails({ count: 2, user_id: 'u1' })).toBe('count: 2; user_id: u1');
        expect(formatAuditDetails({ deleted: { rubrics: 3 } })).toBe('deleted: {"rubrics":3}');
        expect(formatAuditDetails({ user_id: 'u1', from: 'read', to: 'edit' })).toBe('user_id: u1; read → edit');
    });

    it('is empty without details', () => {
        expect(formatAuditDetails(null)).toBe('');
    });
});

describe('auditActorLabel', () => {
    it('prefers the display name, then the email', () => {
        expect(auditActorLabel({ actor_id: 'a', actor: { display_name: 'Ada', email: 'a@x.nl' } })).toBe('Ada');
        expect(auditActorLabel({ actor_id: 'a', actor: { display_name: null, email: 'a@x.nl' } })).toBe('a@x.nl');
        expect(auditActorLabel({ actor_id: null, actor: null })).toBeNull();
    });
});
