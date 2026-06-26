# CivicLens 🏛️🔍

> **Autonomous Civic Triage, Duplicate Merging, and Intelligent Municipal Escalation Platform**

CivicLens is a production-quality, full-stack civic-tech platform designed for modern municipalities and active citizen groups. By leveraging **Vite/React**, **Firebase (Auth & Firestore)**, and **Google Gemini AI**, CivicLens automates the end-to-end lifecycle of civic complaints—from visual triage to duplicate detection, resident verification, and formal agency escalation.

---

## 🌟 Hackathon Highlights & Core Differentiators

Unlike standard "pothole reporting" tools that flood city councils with redundant tickets, CivicLens implements **community-driven consolidation and verification**:

1. **AI-Powered Visual & Textual Triage**: Uploading a photo triggers server-side Gemini vision pipelines to automatically categorize the issue, evaluate its safety/hazard severity, and draft an objective municipal complaint.
2. **Intelligent Duplicate Merging (Core Value)**: Using location grouping combined with **Gemini Embeddings semantic vector comparison**, CivicLens detects if a new submission is a duplicate of a nearby issue. Instead of creating a new ticket, it merges the report into the original issue and increments its **Citizen Confirmation Count**.
3. **Threshold-Based Verification**: When an issue receives **5 distinct citizen confirmations**, the system automatically transitions its status to **Verified**.
4. **Autonomous Department Escalation**: If an issue crosses the severity and confirmation thresholds, a server-side Gemini pipeline drafts a highly professional civic complaint letter targeted at the correct local department (e.g., Department of Public Works, Department of Transportation) and appends it to the issue's timeline.
5. **Gamification & Civic Engagement**: To foster continuous citizen participation, residents earn points (+10 for discovering unique issues, +2 for verifying duplicates) and unlock achievements like the "Civic Scout" or "Community Guardian" badges.

---

## 🎨 Visual Identity & Design System

CivicLens is crafted using a polished, high-contrast, mobile-first design system that inspires warmth and public confidence:
- **Warm Civic Theme**:
  - Deep Forest Green (`#1B4332` / `bg-[#1B4332]`) representing civic organization and public trust.
  - Accent Coral/Orange (`#E76F51` / `text-[#E76F51]`) indicating urgent, hazard-prone reports.
  - Pure Off-White background with spacious card layouts and micro-interactions.
- **Typography Pairing**: Elegant display headers paired with clean system sans-serif font and technical monospaced indicators.
- **Custom Mapping**: Interactive Leaflet maps styled with custom overlays, precise geocoding pins, and robust element dimension invalidation to ensure zero container rendering bugs.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React (Icons), Leaflet Map Engine.
- **Backend**: TypeScript Express Server (handling secure proxying of sensitive Gemini AI requests).
- **Database**: Firebase Firestore (real-time collections for users, reports, and escalation timelines).
- **Authentication**: Firebase Authentication (Google Sign-In).
- **AI/LLM Engine**: `@google/genai` (Gemini 3.5 Flash for multimodal triage & formal document drafting, Gemini-Embedding for semantic vector comparison).

---

## 📂 Project Structure

```bash
├── server.ts                  # Secure Express server & API routes (Gemini proxying, duplicate checking)
├── firestore.rules            # Secure Firestore rules ensuring authenticated reads and writes
├── package.json               # Backend and frontend scripts & dependencies
├── src/
│   ├── App.tsx                # Main entry point (View Router, Header, and tab layout)
│   ├── main.tsx               # Client bootstrap code
│   ├── types.ts               # Shared TypeScript models and interfaces
│   ├── index.css              # Custom Tailwind theme overrides and global styles
│   ├── components/
│   │   ├── AuthScreen.tsx     # Clean Google authentication landing page
│   │   ├── TriageForm.tsx     # Step-by-step camera upload, editable AI review panel, and map pinning
│   │   ├── CivicMap.tsx       # Leaflet implementation for pin placements and surrounding reports
│   │   ├── ReportDetail.tsx   # Detailed complaint details, confirmation timelines, and admin overrides
│   │   ├── Dashboard.tsx      # Comprehensive list of reports, category filters, and map toggles
│   │   └── Gamification.tsx   # Citizen leaderboard, earned points tracker, and custom badges
│   └── lib/
│       └── firebase.ts        # Client-side Firebase SDK configuration and bootstrap
```

---

## ⚙️ Step-by-Step Local Setup Guide

Follow these steps to run CivicLens on your local workstation.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (installed with Node)
- A Firebase project with Firestore and Authentication enabled
- A Gemini API Key from Google AI Studio

---

### Step 1: Set Up Environment Variables

Create a `.env` file in the root directory of the project (copying from `.env.example`):

```env
# Google AI Studio API Key (Server-side secret, keep hidden)
GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Admin SDK Configuration (Optional: fallback for localized databases)
FIREBASE_PROJECT_ID=your-firebase-project-id
```

Make sure your client-side Firebase configurations are correct. Check `firebase-applet-config.json` in the root:

```json
{
  "apiKey": "your-web-api-key",
  "authDomain": "your-project-id.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project-id.appspot.com",
  "messagingSenderId": "your-messaging-sender-id",
  "appId": "your-app-id",
  "firestoreDatabaseId": "(default)"
}
```

---

### Step 2: Install Dependencies

Run the package installer from your terminal in the root directory:

```bash
npm install
```

This will automatically populate your `node_modules` directory with the required packages, including Express, React, Vite, Leaflet, and the Google Gen AI SDK.

---

### Step 3: Run the Development Server

Boot up the full-stack development mode (uses `tsx` to run the Express backend on port `3000` with the Vite dev server mounted as middleware):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

### Step 4: Build for Production

To compile both frontend static bundles and the unified backend Express script:

```bash
npm run build
```

This generates:
1. Static compiled HTML/CSS/JS in `dist/`.
2. A single bundled server file in `dist/server.cjs` (compiled via `esbuild`).

To test the production build locally, run:

```bash
npm run start
```

---

## 🔒 Security Auditing

CivicLens enforces high standards of data security:
- **Server-Side API Proxying**: No Gemini API keys or admin credentials are ever sent to the browser.
- **Granular Security Rules**: Firestore read and write permissions are validated against user authorization tokens. Only authenticated citizens can write reports, and users can only update profiles tied to their unique user ID.
