# Privacy & GDPR Overview — RubricMaker

> **Scope:** This document describes the data practices of the RubricMaker web application as deployed as a static, client-side single-page application (SPA). It is intended for operators (teachers, institutions), data protection officers (DPOs), and developers. Review this document whenever server-side features are added, as the analysis below is specific to the current client-only architecture.

---

## 1. Overview

RubricMaker runs entirely in the user's browser. There is no application server, no database, and no backend API owned by this project. All data is created, stored, and processed on the operator's own device. The application transmits no telemetry, no analytics, and no usage data to any external party.

**Key architectural facts:**
- Static SPA — served as HTML/CSS/JavaScript files from any web host or opened directly from disk.
- All persistent state lives in the browser's `localStorage` on the operator's device.
- No automatic cloud sync or remote backup.
- No authentication system; access control is entirely at the OS/device level.

**Role definitions used in this document:**
- *Operator* — the person who runs the application (typically a teacher or institution).
- *Data subject* — any person whose data is entered into the application (typically a student).

---

## 2. Data Stored and Where

All data is stored exclusively in the browser's `localStorage` under the origin the application is served from. Nothing is uploaded automatically.

| Data category | localStorage key | Description | Contains PII? |
|---|---|---|---|
| Rubric definitions | `rm_rubrics` | Criteria, levels, scoring rules, grade scale reference, format settings | No |
| Students | `rm_students` | Student name and optional email address | **Yes** |
| Classes | `rm_classes` | Class names and student membership lists | No |
| Graded rubrics | `rm_student_rubrics` | Per-student scores, level selections, comments, grade modifiers | **Yes** (via student ID) |
| File attachments | `rm_attachments` | Base64-encoded student assignment files (DOCX, PDF, images) | **Yes** |
| Grade scales | `rm_grade_scales` | Custom grading scales (labels, colours, percentage ranges) | No |
| Comment snippets | `rm_comment_snippets` | Reusable teacher feedback phrases | No |
| Comment bank | `rm_comment_bank` | Categorised feedback library | No |
| Application settings | `rm_settings` | UI preferences, default grade scale, optional API key | No (see §4) |
| Favourite standards | `rm_favorite_standards` | Bookmarked curriculum standards | No |
| Export templates | `rm_export_templates` | Custom DOCX export templates | No |
| Peer reviews | `rm_peer_reviews` | Student-authored peer feedback | **Yes** (via student ID) |
| Self-assessments | `rm_self_assessments` | Student self-ratings and free-text reflections | **Yes** (via student ID) |
| Speaking sessions | `rm_speaking_sessions` | Oral assessment records | **Yes** (via student ID) |
| UI state | `rm_sidebar_collapsed` | Whether the sidebar is open or closed | No |

**Attachments note:** File attachments are stored as base64 strings directly in `localStorage`. Browser `localStorage` is typically limited to 5–10 MB per origin. Attachments approaching this limit may silently fail to save or may cause data loss for other keys. Consider this when deciding whether to store large files.

**Backup files:** The application can export all data to a JSON file written to the operator's local filesystem. This file is created on demand and is not uploaded anywhere. The operator is responsible for the security of this file.

---

## 3. Data NOT Collected

The following data is **never collected, stored, or transmitted** by this application:

- Browser usage analytics (no Google Analytics, Mixpanel, or equivalent)
- Error and crash reports (no Sentry or equivalent)
- User session identifiers or tracking cookies
- IP addresses or geolocation
- Device fingerprints
- Any data sent to servers controlled by the application author or maintainer

---

## 4. External Data Flows

### 4.1 Common Standards Project API (optional)

The application includes an optional integration with the [Common Standards Project](https://commonstandardsproject.com/) for browsing curriculum standards.

- **Activated by:** The operator manually entering a CSP API key in application Settings.
- **What is sent:** The API key (as a request header) and curriculum standard search queries (jurisdiction and standard set identifiers). No student names, emails, grades, or other PII are included in these requests.
- **Where it goes:** `https://api.commonstandardsproject.com/api/v1`
- **API key storage:** The key is stored in plain text in `localStorage` under `rm_settings`. Treat it like a password — do not share your browser profile or export file if you want to keep it confidential.
- **If not used:** If no API key is entered, no network requests are made to this service.

### 4.2 Microsoft / Azure MSAL (disabled)

The codebase contains scaffolding for a OneDrive/SharePoint sync feature using the Microsoft Authentication Library (MSAL) and Microsoft Graph API. **This feature is entirely disabled in the current release.** The MSAL provider is not mounted, no Microsoft login flow is triggered, and no data is transmitted to Microsoft.

If this feature is re-enabled in a future release, it would:
- Trigger an OAuth login via Microsoft identity platform.
- Store MSAL token cache (access tokens, refresh tokens, account info) in `localStorage`.
- Sync rubric and grading data to the signed-in user's OneDrive.

This document will be updated if and when that feature is activated.

### 4.3 Web Speech API (speaking assessments)

The speaking assessment feature uses the browser's built-in Web Speech API for audio transcription. Audio processing happens entirely within the browser; no audio is sent to any external server by this application. Whether the browser itself sends audio to a cloud service depends on the browser and OS speech recognition implementation (e.g. Chrome may use Google's servers). Consult your browser's privacy policy for details.

---

## 5. GDPR Compliance Analysis

### 5.1 Role of the operator

Under the GDPR, the *data controller* is the natural person or organisation that determines the purposes and means of processing personal data. Because RubricMaker stores data only on the operator's device and the application author has no access to that data, **the operator is the data controller**. The application author is not a processor or controller in relation to student data.

Institutions deploying RubricMaker for multiple staff members should establish their own data processing policies and data subject agreements as required by their jurisdiction.

### 5.2 Legal basis for processing

The operator is responsible for establishing a lawful basis for processing student data (e.g. legitimate educational interest, legal obligation, or consent). The application itself does not impose a legal basis; that is the operator's responsibility.

### 5.3 Data minimisation (Article 5(1)(c))

The application collects only data that the operator explicitly enters. There is no automated supplemental data collection. Student email addresses are optional. The operator should enter only the data they actually need.

### 5.4 Right of access and portability (Articles 15, 20)

Data subjects can request access to their data. Operators can use the application's built-in backup/export feature to generate a complete JSON export of all stored data, which can be shared with or inspected for a specific data subject.

### 5.5 Right to erasure (Article 17)

Student data can be deleted:
- **Individually:** By deleting a student record within the application (also removes associated graded rubrics and assessments).
- **Completely:** By clearing `localStorage` for the application origin via browser developer tools or privacy settings, or by using the restore feature to import a backup that excludes the relevant records.

### 5.6 Data retention (Article 5(1)(e))

Data persists in `localStorage` indefinitely — there is no automatic expiry. The operator is responsible for defining and enforcing a retention policy aligned with institutional and legal requirements. Browser data wipes (clearing site data, reinstalling the browser, resetting the device) will delete all stored data, so regular exports are recommended.

### 5.7 Cross-border transfers (Articles 44–49)

No personal data is transferred outside the operator's device by the application itself. The optional CSP API integration sends no personal data (see §4.1). If MSAL/OneDrive sync is enabled in a future release, the operator's Microsoft tenant region will determine where data is stored; review Microsoft's data residency documentation at that time.

### 5.8 Privacy by design and default (Article 25)

The architecture provides strong privacy-by-design properties:
- No data leaves the device without a deliberate operator action (export).
- No third-party analytics or tracking scripts are loaded.
- The application functions fully offline after initial load.

**Known limitation:** `localStorage` is not encrypted at rest by the browser. Any process with OS-level access to the user's browser profile directory can read the stored data. See §6 for mitigation recommendations.

### 5.9 Security (Article 32)

The application does not implement application-layer encryption for stored data. Security relies on the host OS and device:
- OS-level full-disk encryption (FileVault, BitLocker, LUKS) protects data at rest.
- OS user account separation prevents other local users from accessing the browser profile.
- Browser profile passwords or separate browser profiles add an additional layer.

The application does not transmit data in transit (except the optional CSP API call over HTTPS), so transport-layer security is not a concern for student data.

---

## 6. Institutional Deployment Recommendations

The following practices are recommended for any institution that deploys RubricMaker in a context where GDPR or equivalent data protection law applies.

1. **Enable full-disk encryption** on every device used to run RubricMaker. This protects `localStorage` contents if the device is lost or stolen.

2. **Use separate browser profiles** for each staff member. Do not share a browser profile that contains student data.

3. **Do not export backup files to shared or cloud storage** unless that storage is itself GDPR-compliant and appropriately access-controlled.

4. **Establish a data retention schedule.** Delete student records from the application once they are no longer needed (e.g. after grades are confirmed and the retention period has passed).

5. **Rotate or revoke the CSP API key** if you suspect the key has been exposed (e.g. via a shared browser profile or shared backup file).

6. **Take regular backups.** `localStorage` is cleared by browser data wipes and some browser updates. Use the application's export feature to maintain an offline backup.

7. **Limit access to the device.** Because the application has no login system, anyone with access to the browser can read all stored student data. Lock your device when unattended.

8. **Review this document before enabling new features.** The Microsoft OneDrive integration, if activated, would constitute a new data flow and would require an updated privacy assessment.

9. **Inform data subjects.** Depending on your jurisdiction and institutional policy, students (and/or their guardians) may need to be informed that their assessment data is stored locally on your device. Consult your institution's DPO.

---

## 7. Contact and Updates

**Data Protection Officer (DPO) contact:** *(replace this placeholder with your institution's DPO name, email, and address)*

This document reflects the privacy characteristics of RubricMaker as a client-side-only application. It must be reviewed and updated when:
- Server-side features are introduced (e.g. cloud sync, multi-user backend).
- The Microsoft OneDrive/SharePoint integration is activated.
- New external service integrations are added.
- The application is deployed in a new jurisdiction with different regulatory requirements.

*Last reviewed: May 2026*
