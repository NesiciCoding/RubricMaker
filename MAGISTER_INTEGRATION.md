# Magister LMS — Integration Feasibility Research

**Date:** 2026-05-29  
**Status:** Decision made — limited integration via CSV; API integration on hold pending official access.

---

## Summary

Magister (schoolmaster.nl) is the dominant Dutch secondary-school administration system. This document records what integration paths exist and what we decided to build.

---

## Findings

### 1. Public API

An unofficial but well-maintained community API is documented at:
- <https://magister-api.readthedocs.io/>
- <https://github.com/magister-api/docs>

Multiple open-source projects use it successfully:

| Project | Purpose |
|---------|---------|
| [idiidk/magister-api](https://github.com/idiidk/magister-api) | REST API wrapper |
| [sikkepitje/TeamSync](https://github.com/sikkepitje/TeamSync) | Magister ↔ Microsoft 365 Teams sync |
| [gerwin3/open-magister-api](https://github.com/gerwin3/open-magister-api) | API abstraction |
| [Magister-Android/Magister-Android](https://github.com/Magister-Android/Magister-Android) | Unofficial Android app |

**Risk:** Schoolmaster BV does not officially support or version-guarantee this API. It could break without notice. No SLA exists.

### 2. SSO / OAuth

Magister provides a **SCIM API** for identity/account provisioning (<https://accounts.magister.net/scim/docs/>), but OAuth endpoints for third-party app login are not publicly documented. Schools would need to request API access directly from Magister support. This is not a self-service option.

**Conclusion:** SSO integration is not feasible without a commercial arrangement with Schoolmaster BV.

### 3. Student Roster CSV Export

Teachers can export a student roster from the Magister student overview:

| Magister column | Maps to |
|----------------|---------|
| `voornaam` | First name |
| `roepnaam` | First name (display/nickname — sometimes exported instead of voornaam) |
| `achternaam` | Last name |
| `klas` | Class name |
| `email` | Email |
| `leerlingnummer` | Student number (no RubricMaker equivalent — ignore) |

Encoding is typically UTF-8 or Windows-1252 (Dutch special characters: ë, ü, etc.).

---

## Decision

### What we built (done)

**Magister CSV pre-mapping** — the `CsvImportModal` auto-mapper now recognises Dutch column names (`voornaam`, `roepnaam`, `achternaam`, `klas`) so a Magister roster export imports with zero manual column setup.

### What we deferred

**API integration** — the community API could power automatic roster sync, but:
1. No official support or versioning guarantee
2. Requires Magister credentials to be stored or proxied — a security concern for an offline-first app
3. The CSV workflow already works well and is low-friction

Promote to a proper feature item **only if** Schoolmaster BV provides an officially supported API or OAuth flow.

---

## Recommended next step (if escalating)

Contact Magister support (<https://support.magister.nl>) to ask:
- Is there an official partner/developer API program?
- Can schools grant OAuth access to third-party apps?
