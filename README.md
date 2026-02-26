# Rubric Maker

A comprehensive, offline-first rubric creation and grading tool built with React and TypeScript. This application allows educators to design complex rubrics, grade students efficiently, and analyze performance statistics.

## ✨ Features

### 1. Rubric Builder
*   **Flexible Structure**: Create rubrics with custom criteria and performance levels.
*   **Scoring Modes**: diverse scoring options including **Total Points** (raw score) and **Weighted Scored** (percentage-based).
*   **Advanced Level Options**:
    *   **Sub-items**: Checklists within a level for granular scoring.
    *   **Point Ranges**: Define min/max points for a level to allow fine-tuning.

### 2. Grading Interface
*   **Student Management**: Manage students and organize them into classes.
*   **Interactive Grading**: Click to select levels, toggle sub-items, or use the slider for point ranges.
*   **Comment Bank**: Create and tag reusable feedback snippets for quick insertion.
*   **Overall Feedback**: Add general comments and attachments to graded rubrics.

### 3. Analytics & Reporting
*   **Statistics Dashboard**: View class performance including Average, Median, Highest, and Lowest scores.
*   **Visualization**: Charts for grade distribution and per-criterion performance.
*   **Comparative Grading**: Simultaneously grade two students side-by-side to ensure rubric consistency.
*   **Universal Attachment Viewer**: Rich inline rendering of `.docx` Word Documents, PDFs, and images within the grading flow.
*   **Export**:
    *   **PDF**: Generate individual student reports or bulk export for the whole class.
    *   **Word (.docx)**: Export raw data or use custom Word templates with mail-merge fields.
    *   **CSV**: Export raw data for use in Excel or other gradebooks.

### 4. Standards Integration
*   **Common Standards Project**: Link rubric criteria to state and national standards (CCSS, NGSS, etc.) via the CSP API.
*   **Favorites**: Save frequently used standards for quick access.

### 5. Data Management
*   **Local Storage**: All data is saved locally in your browser. No account required.
*   **Backup & Restore**: Export your entire dataset to a JSON file for backup or transferring to another device.

---

## 🚀 Development

To run the project locally:

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Start the development server**:
    ```bash
    npm run dev
    ```

3.  Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Deployment

Rubric Maker is a static web application, meaning it can be hosted on any static site provider (GitHub Pages, Vercel, Netlify) or even run directly from a file server.

### General Build

To create a production-ready build:

```bash
npm run build
```

The output will be in the `dist/` folder.

### SharePoint Deployment

You can host this application directly within a SharePoint Document Library without needing a dedicated server.

1.  **Build the project**:
    ```bash
    npm run build
    ```

2.  **Prepare for SharePoint**:
    *   Locate the `dist/` folder.
    *   Rename `index.html` to `index.aspx`. *SharePoint treats .aspx files as web pages, whereas .html files might be downloaded instead of displayed.*

3.  **Upload to SharePoint**:
    *   Navigate to your SharePoint site.
    *   Go to **Site Contents** -> **Documents** (or create a new Document Library).
    *   Create a folder (e.g., `RubricMaker`).
    *   Upload all files and folders from the `dist/` directory into this folder.

4.  **Launch**:
    *   Click on `index.aspx`. The application will launch directly in the browser.

> **Note**: For the "Standards Integration" feature to work on SharePoint, you may need to ensure the SharePoint domain is added to the "Allowed Origins" in your Common Standards Project API key settings.
