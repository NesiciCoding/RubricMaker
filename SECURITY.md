# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main) | :white_check_mark: |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's [private vulnerability reporting](https://github.com/NesiciCoding/RubricMaker/security/advisories/new) to report security issues confidentially.

### What to include

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact (what data or functionality is affected)
- Any suggested fix or mitigation, if you have one

### What to expect

- Acknowledgement within **48 hours**
- An assessment and timeline within **7 days**
- A fix or workaround communicated back to you before public disclosure

We follow [coordinated disclosure](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html): please give us reasonable time to address the issue before making it public.

## Scope

This project handles educator-created rubrics and student essay evaluations. Areas of particular concern:

- Authentication and session management (Supabase Auth / Google OAuth)
- PIN-based access control for student sessions
- Row-level security on rubric and submission data
- Input validation on essay submissions

## Out of scope

- Vulnerabilities in third-party dependencies (report those upstream)
- Issues that require physical access to a device
- Social engineering attacks
