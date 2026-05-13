# Purview Self-Help Diagnostics — Review & Testing Portal

🔗 **Live Site:** [https://natripat.github.io/Purivew-self-help-diagnostics/](https://natripat.github.io/Purivew-self-help-diagnostics/)

## About

A comprehensive single-page web application for reviewing, testing, and providing feedback on Microsoft Purview self-help diagnostic documentation. Combines the diagnostic review dashboard and feedback intake tool into one cohesive portal with collapsible sidebar navigation.

## Features

| Section | Description |
|---------|-------------|
| **📋 Test Tracker** | Track testing progress across all 19 diagnostics (10 Solutions page + 9 Help pane) with status tracking, notes, filters, and CSV export |
| **📊 Gap Dashboard** | Visual overview of 24 real customer issues mapped against diagnostic coverage — showing what's covered, partially covered, and missing |
| **🔧 Break & Test Scenarios** | 15 structured scenarios to deliberately misconfigure a test tenant and grade diagnostic detection |
| **💬 Feedback & Improvements** | Capture testing feedback with transcript upload/parsing, pre-loaded findings, and AI-suggested improvement areas for PG |
| **📬 Feedback Log & ADO** | Manage feedback as Azure DevOps work items with evidence attachments, ADO CLI command generation, and bulk export |
| **🎯 Feedback Intake** | Quick-capture raw testing observations with auto-categorization, file attachments, and export for analysis |

### Key Capabilities

- **Dark/Light Theme** toggle
- **Responsive Design** with collapsible sidebar (hamburger menu on mobile)
- **localStorage Persistence** — all data saved locally across sessions
- **Export Options** — CSV, Markdown reports, JSON backups, evidence packages
- **ADO Integration** — generates `az boards work-item create` CLI commands
- **Transcript Parser** — upload M365 Admin Center Help pane transcripts for auto-analysis
- **Evidence Management** — screenshots (base64), transcripts, HAR files, video references

## Technical Details

- **Single-file SPA** — everything in `index.html` (no build step, no dependencies)
- **Hosted on GitHub Pages** — static site, no server required
- **Data stored in browser localStorage** with keys: `purview-tracker`, `purview-feedback`, `purview-ado-log`, `purview-ado-config`, `purview-intake`

## Owner

**natripat** — Microsoft Purview Self-Help Diagnostics Review Project
