import React from 'react';
import { Shield, ExternalLink } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';

export default function PrivacyPage() {
    return (
        <>
            <Topbar title="Privacy & AVG/GDPR" />
            <div className="page-content fade-in" style={{ maxWidth: 860 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 28 }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            background: 'var(--accent-soft)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Shield size={22} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0 }}>Privacy &amp; Gegevensbescherming</h2>
                        <p className="text-muted text-sm" style={{ margin: '4px 0 0' }}>
                            This document explains how Rubric Maker handles personal data in accordance with the General
                            Data Protection Regulation (GDPR) and the Dutch implementation, the Algemene Verordening
                            Gegevensbescherming (AVG).
                        </p>
                    </div>
                </div>

                {/* 1. Controller */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>1. Verwerkingsverantwoordelijke / Data Controller</h3>
                    <p className="text-sm" style={{ margin: 0 }}>
                        Rubric Maker is a tool-only application — it does not operate its own servers by default. The{' '}
                        <strong>teacher or educational institution</strong> that deploys and uses this application acts
                        as the data controller under AVG Article 4(7). If your school uses a centrally hosted instance,
                        the responsible party is the school or its designated IT department, who should have a{' '}
                        <em>verwerkersovereenkomst</em> (data processing agreement) with any sub-processors (e.g.
                        Supabase).
                    </p>
                </div>

                {/* 2. Personal data */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>2. Welke persoonsgegevens worden verwerkt?</h3>
                    <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                        The following categories of personal data may be stored:
                    </p>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Category</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Data fields</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Sensitivity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Student identity', 'Name (required), email address (optional)', 'Personal data'],
                                [
                                    'Grades & feedback',
                                    'Criterion scores, written comments, overall grade',
                                    'Personal data',
                                ],
                                ['Self-assessments', 'Student self-ratings, reflection text', 'Personal data'],
                                [
                                    'Speaking sessions',
                                    'Criterion grades, pronunciation marks, criterion audio recordings',
                                    'Special (audio/biometric)',
                                ],
                                ['Peer reviews', 'Scores and comments submitted by peers', 'Personal data'],
                                [
                                    'Uploaded work',
                                    'Essay text, documents, images uploaded as evidence',
                                    'Personal data',
                                ],
                                [
                                    'Document analysis',
                                    'Extracted essay text, detected vocabulary, grammar errors',
                                    'Personal data',
                                ],
                                [
                                    'Teacher settings',
                                    'UI preferences, API keys for external services',
                                    'Non-personal (no student data)',
                                ],
                            ].map(([cat, fields, sens]) => (
                                <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 8px', verticalAlign: 'top', fontWeight: 500 }}>{cat}</td>
                                    <td
                                        style={{ padding: '8px 8px', verticalAlign: 'top', color: 'var(--text-muted)' }}
                                    >
                                        {fields}
                                    </td>
                                    <td style={{ padding: '8px 8px', verticalAlign: 'top' }}>
                                        <span
                                            className={`badge ${sens.startsWith('Special') ? 'badge-red' : 'badge-blue'}`}
                                            style={{ fontSize: '0.75rem' }}
                                        >
                                            {sens}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 3. Storage modes */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>3. Waar worden gegevens opgeslagen?</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Lokale opslag (standaard)</div>
                            <p className="text-sm text-muted" style={{ margin: 0 }}>
                                By default, all data is stored exclusively in the teacher's browser (localStorage). Data
                                never leaves the device automatically. No server, no cloud, no third party.
                            </p>
                        </div>
                        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Database (Supabase) — optioneel</div>
                            <p className="text-sm text-muted" style={{ margin: 0 }}>
                                When a Supabase connection is configured (Settings &gt; Database), data is also stored
                                in a PostgreSQL database hosted by Supabase, Inc. For AVG compliance, schools should use
                                the <strong>EU Frankfurt region (eu-central-1)</strong> when creating a Supabase
                                project. Data does not leave the EU/EEA. Supabase is SOC 2 Type II certified and
                                provides a Data Processing Addendum (DPA) at{' '}
                                <a
                                    href="https://supabase.com/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--accent)' }}
                                >
                                    supabase.com/privacy <ExternalLink size={10} />
                                </a>
                                .
                            </p>
                        </div>
                    </div>
                </div>

                {/* 4. Legal basis */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>4. Rechtsgrondslag — AVG Art. 6</h3>
                    <p className="text-sm" style={{ margin: 0 }}>
                        The processing of student data for assessment purposes is based on{' '}
                        <strong>gerechtvaardigd belang</strong> (legitimate interest, AVG Art. 6(1)(f)) — specifically,
                        the educational institution's interest in assessing student learning and providing feedback.
                        Teachers are advised to include Rubric Maker data processing in their school's privacy
                        documentation (<em>privacybeleid</em>). For processing sensitive categories of data (audio
                        recordings), explicit consent from students (or parents/guardians for minors) is recommended
                        under AVG Art. 9.
                    </p>
                </div>

                {/* 5. Data retention */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>5. Bewaartermijn / Data Retention</h3>
                    <p className="text-sm" style={{ margin: 0 }}>
                        Rubric Maker does not impose automatic data expiry. Teachers are responsible for deleting
                        student records at the end of each academic year or when a student leaves. Deleting a student
                        record from the application (Students page) permanently removes all associated grades,
                        assessments, attachments, and analysis results from both local storage and the database (cascade
                        delete).
                    </p>
                </div>

                {/* 6. Right to erasure */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>6. Recht op verwijdering — AVG Art. 17</h3>
                    <p className="text-sm" style={{ marginBottom: 8 }}>
                        Students (or their legal guardians) may request erasure of their data. To fulfil this request:
                    </p>
                    <ol className="text-sm" style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
                        <li>
                            Navigate to <strong>Students</strong>, find the student, and click{' '}
                            <strong>Delete student</strong>. This removes all associated data from local storage and, if
                            connected, from the database.
                        </li>
                        <li>
                            If multiple teachers have shared access to the student's data, each teacher must delete from
                            their own account.
                        </li>
                        <li>
                            For full database erasure of a teacher's own account: go to{' '}
                            <strong>Settings &gt; Database &gt; Delete all my database data</strong>.
                        </li>
                    </ol>
                </div>

                {/* 7. Data portability */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>7. Recht op dataportabiliteit — AVG Art. 20</h3>
                    <p className="text-sm" style={{ margin: 0 }}>
                        Teachers can export a complete JSON backup of all data via{' '}
                        <strong>Settings &gt; Export backup</strong>. This backup can be used to migrate to another
                        instance of Rubric Maker or to fulfil a data portability request. For database users, data can
                        also be exported directly from the Supabase dashboard.
                    </p>
                </div>

                {/* 8. Audio data */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>8. Audiogegevens (spreekopdrachten)</h3>
                    <p className="text-sm" style={{ margin: 0 }}>
                        The speaking session feature may record short audio clips per criterion. The browser's Web
                        Speech API processes speech locally — no audio stream is sent to external servers by this
                        application. Audio recordings stored within Rubric Maker are accessible only to the grading
                        teacher. Schools should inform students that audio may be recorded and stored during speaking
                        assessments.
                    </p>
                </div>

                {/* 9. Supervisory authority */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>9. Toezichthouder</h3>
                    <p className="text-sm" style={{ margin: 0 }}>
                        In the Netherlands, the supervisory authority for data protection is the{' '}
                        <strong>Autoriteit Persoonsgegevens (AP)</strong>. You can file a complaint or find further
                        guidance at{' '}
                        <a
                            href="https://www.autoriteitpersoonsgegevens.nl"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent)' }}
                        >
                            autoriteitpersoonsgegevens.nl <ExternalLink size={10} />
                        </a>
                        .
                    </p>
                </div>

                {/* 10. Contact */}
                <div
                    className="card"
                    style={{ marginBottom: 20, borderLeft: '4px solid var(--accent-soft, #3b82f640)' }}
                >
                    <h3 style={{ marginBottom: 8 }}>10. Contact &amp; Functionaris Gegevensbescherming (FG)</h3>
                    <p className="text-sm text-muted" style={{ margin: 0 }}>
                        For data-related questions, contact your school's Data Protection Officer (Functionaris
                        Gegevensbescherming). If your institution has not appointed an FG, contact the teacher or IT
                        department responsible for this Rubric Maker instance.
                    </p>
                </div>

                {/* Open-source attributions */}
                <div className="card" style={{ marginBottom: 20 }}>
                    <h3 style={{ marginBottom: 12 }}>Open-source attributions</h3>
                    <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                        Rubric Maker uses the following third-party datasets and services for CEFR text profiling:
                    </p>
                    <ul className="text-sm" style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
                        <li>
                            <strong>CEFR-J Vocabulary & Grammar Profiles</strong> — Tono Laboratory, Tokyo University of
                            Foreign Studies (TUFS). Used for offline CEFR-level word and grammar analysis.{' '}
                            <a
                                href="https://github.com/openlanguageprofiles/olp-en-cefrj"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent)' }}
                            >
                                github.com/openlanguageprofiles/olp-en-cefrj <ExternalLink size={10} />
                            </a>
                        </li>
                        <li>
                            <strong>LanguageTool</strong> — Grammar checking (when document analysis is used, text is
                            sent to api.languagetool.org).{' '}
                            <a
                                href="https://languagetool.org/legal/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent)' }}
                            >
                                LanguageTool Privacy Policy <ExternalLink size={10} />
                            </a>
                        </li>
                        <li>
                            <strong>Cambridge Dictionary API</strong> — Optional online CEFR word-level enrichment
                            (only when a key is configured in Settings). Data sent to dictionary.cambridge.org.{' '}
                            <a
                                href="https://dictionary-api.cambridge.org/"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent)' }}
                            >
                                dictionary-api.cambridge.org <ExternalLink size={10} />
                            </a>
                        </li>
                    </ul>
                </div>

                <p className="text-muted text-xs" style={{ textAlign: 'center', marginTop: 16 }}>
                    Last updated: May 2026 · Rubric Maker is open-source software provided as-is. Compliance with
                    AVG/GDPR remains the responsibility of the deploying institution.
                </p>
            </div>
        </>
    );
}
