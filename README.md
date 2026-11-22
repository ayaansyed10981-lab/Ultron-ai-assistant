# Ultron Multi-Agent AI Voice Operations Team

Your personal 24/7 voice-activated AI operative team, **led by Supreme Commander Ultron**, engineered natively for **Windows 11 ARM64 (Snapdragon)** with offline wake-word neural networks, local Whisper Base transcription, and cloud intelligence via Gemini 3.5.

---

## The Ultron Multi-Agent Operative Team

Ultron commands specialized AI agents. You can speak to Commander Ultron to orchestrate the entire team simultaneously, or **talk directly to any specialist agent using their own wake word**:

```
                      +---------------------------------+
                      |             ULTRON              |
                      |  Supreme Commander & Voice Hub  |
                      |        (Say "Hey Ultron")       |
                      +----------------+----------------+
                                       |
        +----------------+-------------+-------------+----------------+
        |                |                           |                |
        v                v                           v                v
+---------------+ +--------------+           +---------------+ +--------------+
|    VISION     | |    FRIDAY    |           |    JARVIS     | |   SENTINEL   |
|Software & SQL | |Word & PDF Doc|           | QA & Inspector| |System & Telem|
|(Say "Hey      | |(Say "Hey     |           |(Say "Hey      | |              |
|  Vision")     | |  Friday")    |           |  Jarvis")     | |              |
+---------------+ +--------------+           +---------------+ +--------------+
```

### 1. Ultron (Supreme Commander & Mission Orchestrator)
- **Voice Profile**: **Microsoft Mark** (Authoritative Male Voice) / **Gemini Fenrir**
- **Wake Word**: *"Hey Ultron"* or *"Ultron"* -> Instant Wake Reply: *"Yes, sir?"*
- Analyzes complex directives, decomposes tasks, dispatches operatives simultaneously in parallel, and reports back to you.
- Directly controls your Windows 11 PC (apps, volume, battery, system status).

### 2. Vision (Chief Software Engineer & Full-Stack Backend Architect)
- **Voice Profile**: **Microsoft David** (Intellectual Male Engineer) / **Gemini Puck**
- **Direct Wake Word**: *"Hey Vision"* or *"Vision"* -> Instant Wake Reply: *"Yes, sir? Vision here. What web app, backend API, or SQL database are we building?"*
- **Full-Stack Backend & REST API Engineering**:
  - Modular backend architectures (Node.js/Express, Python/FastAPI/Flask) with `server.js` or `main.py`, `routes/`, `middleware/`, and `package.json` / `requirements.txt`.
  - Secure authentication (JWT Bearer middleware, bcrypt password hashing).
  - Production middleware: CORS, Helmet security headers, rate limiting, and centralized error handling.
  - Automated test script generation (`test.js` / `test_api.py`) with curl command guides.
- **Autonomous Frontend & UI Coding**: Writes complete full-stack web applications, websites, and scripts saved in `~/UltronProjects/`.
- **Advanced SQL & Database Architecture**:
  - Writes optimized queries across PostgreSQL, MySQL, SQLite, and SQL Server.
  - Complex Window functions (`ROW_NUMBER()`, `RANK()`), CTEs (`WITH ...`), multi-table `JOIN`s, and aggregations.
  - Generates schema DDL (`CREATE TABLE`), indexes, constraints, and mock test data.

### 3. Friday (Executive Document Architect)
- **Voice Profile**: **Microsoft Zira** (Distinctive Female Voice) / **Gemini Aoede**
- **Direct Wake Word**: *"Hey Friday"* or *"Friday"* -> Instant Wake Reply: *"Yes, sir? Friday here. Which document or report shall I create?"*
- **Microsoft Word (.docx) Creation & Autonomous Editing**:
  - **Create From Scratch**: Autonomously drafts, styles, and formats rich Word documents with titles, styled headings, bullet lists, and tables in `~/UltronDocuments/`.
  - **Fuzzy Document Name Resolution**: Locate existing documents instantly even from partial or spoken names (e.g. *"edit Project Proposal"*, *"update my meeting notes"*, *"add conclusion to test.docx"*). Automatically handles missing `.docx` extensions, underscores, dashes, spaces, and searches across `~/UltronDocuments`, `~/Documents`, `~/Desktop`, and `~/Downloads`.
  - **Intelligent Content Updates**: Preserves 100% of existing document text and formatting while seamlessly integrating new sections, tables, paragraphs, or corrections requested by voice.
  - **Zero-Crash Locked File Protection**: Safely handles files currently open in Microsoft Word using PowerShell COM automation and atomic fallback revisions, preventing `EBUSY` file lock crashes.
- **Executive PDF (.pdf)**: Autonomously generates multi-page PDF reports with title banners, custom typography, table grids, headers, and footers with page numbers.
- **Document Reading & Summarization**: Reads and extracts content from `.docx` and `.pdf` files.
- **Instant Fast-Path Voice Commands**:
  - *"Hey Friday, edit [Document] and add [Content]"*
  - *"Friday, add [Content] to [Document]"*
  - *"Friday, update [Document] with [Content]"*
  - *"Hey Friday, open document [Document]"*

### 4. Jarvis (Chief Quality Assurance Engineer & Security Inspector)
- **Voice Profile**: **Microsoft David** (Articulate British Quality & Security Auditor) / **Gemini Charon**
- **Direct Wake Word**: *"Hey Jarvis"* or *"Jarvis"* -> Instant Wake Reply: *"Jarvis here, sir. What code, backend API, security audit, or document shall I inspect?"*
- **Backend Architecture & Security Auditing**:
  - **OWASP Top 10 Vulnerability Scanning**: Detects SQL Injection (SQLi), Cross-Site Scripting (XSS), Command Injection (RCE), Path Traversal, and Insecure Direct Object References (IDOR).
  - **Hardcoded Secrets & Credential Leakage Scanner**: Scans for embedded API keys (Google Gemini, OpenAI, GitHub), JWT secrets, and plaintext passwords.
  - **Authentication & Cryptographic Hygiene**: Verifies password hashing (bcrypt vs weak MD5/SHA1) and JWT token expiration.
  - **CORS, Rate Limiting & DoS Protection**: Inspects wildcard CORS origins and ensures rate-limiting middleware is present on public and sensitive routes.
  - **Security Scoring & Grading**: Produces an executive grade (`A+`, `A`, `B`, `C`, `FAIL`) and spoken briefing.
- **Application & Website Inspection**: Audits Vision's apps in `~/UltronProjects/` for syntax validity, HTML5 structure, and responsive JS scripts.
- **SQL Query & Schema Safety Audit**: Audits queries for unbounded modifications (missing WHERE on UPDATE/DELETE), missing JOIN conditions, CTE balance, and index safety.
- **Word (.docx) & PDF (.pdf) Inspection**: Audits Friday's Word documents and PDF layouts in `~/UltronDocuments/`.
- **Multi-Agent Deliverable Certification**: Runs automated QA on all outputs produced by Vision and Friday.

### 5. Veronica (Chief Visual Media & Generative Creative Director)
- **Voice Profile**: **Microsoft Zira** (Sophisticated Creative Director) / **Gemini Kore**
- **Direct Wake Word**: *"Hey Veronica"* or *"Veronica"* -> Instant Wake Reply: *"Veronica here, sir. What visual assets, branding, or video loops shall I create?"*
- **Cinematic Video Background Loops**: Generates smooth 60fps HTML5 Canvas / WebGL interactive video animations and shader backgrounds.
- **Visual Branding Kits**: Generates complete brand palettes, typography systems, and inline SVG logos and illustrations saved in `~/UltronMedia/`.
- **Scrollytelling Creative Director**: Feeds video loops, motion concepts, and SVG art directly into Agent Vision for scrollytelling web applications.

### 6. Sentinel (System Operator & Guardian)
- Hardware telemetry: battery percentage, charging status, RAM, disk space, volume, and screen brightness.
- Window management (focus, minimize, maximize, close, show desktop, lock screen).

---

## 🎬 Multi-Agent Collaborative Scrollytelling Pipeline

Ultron coordinates a specialized 4-stage creative pipeline:

```
[ User Prompt ]
      |
      v
[ ⚡ Commander Ultron ] -> Analyzes requirement & coordinates operatives
      |
      +---> [ 🎬 Veronica ] -> Generates visual branding, custom SVG logo, and 60fps cinematic video loop
      |           |
      |           v (Media assets passed automatically)
      +---> [ 💻 Vision ]   -> Takes Veronica's video loop & branding and engineers a scroll-driven website
                  |
                  v
            [ 🔍 Jarvis ]   -> Audits code, verifies video loop & scroll triggers, ensures 0 broken links
                  |
                  v
            [ 🌐 Browser ]  -> Ultron opens the finished website in your browser and gives a spoken debrief!
```

> **Voice Command**: *"Tell Vision to make a scroll based website for CyberTech, and Veronica to make a video for it."*

---

## 🛠️ Can Vision Do Backend? (Yes, 100%!)

Vision is a **full-stack software engineer and database architect**. Vision autonomously builds:

1. **Node.js & Express REST APIs**:
   - Routes, controllers, and JSON endpoints (`server.js`, `routes/api.js`).
   - Authentication middleware (JWT, bcrypt password hashing).
   - Rate limiting, CORS, error handlers, and input validation.
2. **Python Backends (FastAPI / Flask)**:
   - Modern asynchronous FastAPI endpoints with Pydantic request/response schemas.
   - Flask RESTful APIs with SQLAlchemy ORM models.
3. **Database Architecture & SQL**:
   - PostgreSQL, MySQL, SQLite, and SQL Server production schemas.
   - Tables with primary keys, foreign keys, constraints, and indexes.
   - Complex Window functions (`ROW_NUMBER()`, `RANK()`), CTEs (`WITH ...`), and multi-table `JOIN`s.
4. **Autonomous Execution**:
   - Vision writes `server.js` or `app.py`, installs dependencies, and structures production routes and models in `~/UltronProjects/`.

> **Voice Commands for Vision Backend**:
> - *"Hey Vision, build an Express REST API for an e-commerce store with user authentication and SQLite."*
> - *"Hey Vision, create a FastAPI backend for a task manager with JWT auth."*
> - *"Tell Vision to build a backend API for my mobile app."*

---

## 🛡️ Jarvis Backend & Security Inspection

Jarvis is equipped with automated static application security testing (SAST) to audit backend APIs, microservices, and databases for security vulnerabilities:

1. **OWASP Top 10 Security Audit**:
   - **SQL Injection (SQLi)**: Detects raw string concatenation or template literal queries vs parameterized queries.
   - **Command Injection (RCE)**: Scans for unsafe shell execution (`exec`, `eval`, `os.system`).
   - **Path Traversal**: Flags unvalidated file system operations.
   - **XSS & Content Injection**: Detects unescaped user inputs in responses.
2. **Hardcoded Secrets & Credential Scanner**:
   - Scans for exposed Google Gemini, OpenAI, and GitHub tokens, JWT secrets, and plaintext passwords.
3. **Cryptographic & Authentication Hygiene**:
   - Verifies password hashing standards (flags weak MD5/SHA1 vs bcrypt/argon2).
   - Verifies JWT expiration (`expiresIn`) and secret isolation.
4. **Network Exposure & CORS**:
   - Audits CORS configurations (flags wildcard `origin: '*'` on sensitive routes).
   - Verifies rate limiting middleware (`express-rate-limit`, `slowapi`) to mitigate brute-force and DoS attacks.
   - Verifies HTTP security headers (`helmet`).
5. **Security Scoring & Executive Grade**:
   - Computes a quantitative security score (0–100) and letter grade (`A+`, `A`, `B`, `C`, `FAIL`).

> **Voice Commands for Jarvis Security**:
> - *"Hey Jarvis, run a security check on the backend."*
> - *"Hey Jarvis, audit backend security for [project-name]."*
> - *"Hey Jarvis, check the backend."*

---

## Simultaneous Multi-Agent Parallel Execution

You can instruct the team to execute multiple tasks simultaneously at the exact same time:

> **Example**: *"Friday write a PDF report on Quantum Computing and Vision create a website for my portfolio and Ultron assist them at the same time and Jarvis check everything."*

1. **Immediate Spoken Acknowledgment** (< 200ms): Ultron instantly announces: *"Coordinating operatives simultaneously in parallel now, sir."*
2. **Parallel Dispatch**: Vision builds the website while Friday drafts the PDF at the exact same time using concurrent background workers.
3. **Automated QA Audit**: As soon as deliverables are ready, Jarvis inspects the code, HTML, and PDF structure.
4. **Mission Summary**: Ultron delivers a concise spoken debriefing confirming that both deliverables are ready in `~/UltronProjects` and `~/UltronDocuments` with zero QA errors.

---

## ⚡ "Avengers assemble" Full Team Roll Call

Say **"Avengers assemble"** (or **"Team assemble"** / **"Assemble"**) anytime:
Each operative reports for duty one by one in their own native, distinct voice:

1. ⚡ **Ultron** (*Microsoft Mark*): *"Avengers assemble! Commander Ultron reporting: mission control, PC operations, and system automation online."*
2. 💻 **Vision** (*Microsoft David*): *"Vision reporting, sir: software engineering, full-stack backend, and SQL database architecture ready."*
3. 📄 **Friday** (*Microsoft Zira - Female*): *"Friday reporting, sir: executive document architecture, Word documents, and PDF reports standing by."*
4. 🔍 **Jarvis** (*Microsoft David*): *"Jarvis reporting, sir: quality assurance, deliverable verification, and system inspection at your service."*
5. 🎬 **Veronica** (*Microsoft Zira - Female*): *"Veronica reporting, sir: generative visual media, cinematic video direction, and creative design online."*
6. ⚡ **Ultron** (*Microsoft Mark*): *"All five operatives assembled and standing by for your command, sir. What is our objective?"*

---

## 📞 Phone Calling & In-Call Silence Protection

Ultron includes automated Call Guard protection so operatives never interrupt your phone calls:

- **In-Call Silence Guard (Automatic)**:
  - **Conversational Speech Immunity**: Natural words spoken during calls (e.g., *"our vision for the quarter"*, *"deliver by Friday"*, *"customer service"*, *"social media"*) are filtered out so Vision, Friday, and Ultron never wake up accidentally.
  - **Active Call Detection**: Windows Phone Link, Zoom, Teams, and WhatsApp active calls are detected automatically to suppress wake triggers.
- **Voice Commands for Call & Meeting Mode**:
  - *"Hey Ultron, I'm on a call"* / *"Call mode"* -> Instantly mutes all operatives.
  - *"Hey Ultron, mute for 15 minutes"* -> Auto-mutes and resumes when your meeting is over.
  - *"Hey Ultron, call is over"* / *"Unmute"* -> Unmutes operatives and sounds a gentle chime.
- **Making Outbound Phone Calls**:
  - *"Hey Ultron, call my phone"*
  - *"Hey Ultron, call me"*
  - *"Hey Ultron, call +919876543210"*
  - Auto-activates Call Mode during the call so you are never disturbed!

---

## 💬 WhatsApp Automation & Messaging

Ultron can autonomously open WhatsApp, search contacts or phone numbers, and send messages with sub-second execution:

- **Voice Commands**:
  - *"Hey Ultron, open WhatsApp, search [Contact] and message her [Message]"*
  - *"Hey Ultron, send a WhatsApp message to [Contact] saying [Message]"*
  - *"Hey Ultron, message [Contact] on WhatsApp that [Message]"*
  - *"Hey Ultron, WhatsApp [Contact] [Message]"*
- **Features**:
  - Automatically launches WhatsApp Desktop UWP (`whatsapp:`) or brings it to the foreground.
  - Searches contact name via `Ctrl + F`, selects contact via `Enter`, and pastes message via Windows clipboard for 100% typing reliability.
  - Direct phone number dialing support with country codes (`whatsapp://send?phone=...`).
  - Fast-path execution (<50ms local response time).

---

## 🎵 Direct Song Playback & Chained App Automation ("Open That and Write That")

Ultron now executes music playback and chained computer automation directly in under 50ms without waiting:

### 1. Direct Song & Music Playback
Simply tell Ultron what song, artist, or music to play:
- *"Hey Ultron, play this song Believer"*
- *"Hey Ultron, play Starboy by The Weeknd"*
- *"Hey Ultron, play Bohemian Rhapsody on Spotify"*
- *"Hey Ultron, play some lofi beats"*
- *"Hey Ultron, play music by Eminem"*
- Direct support for **YouTube** (instant default) and **Spotify** (`on spotify`).

### 2. Direct App Launch & Typing ("Open that and write that")
Chain opening an application and writing content into a single command. Ultron launches the app, brings it to the foreground, and types your text cleanly in under 600ms:
- *"Hey Ultron, open Notepad and write groceries: milk, eggs, bread"*
- *"Hey Ultron, open Word and write meeting agenda for project alpha"*
- *"Hey Ultron, open VS Code and write console.log('hello world')"*
- *"Hey Ultron, write that we have a client call at 3 PM"* (types directly into whichever window is currently active).

---

## 🎙️ Natural Speech Pause Tolerance (No Premature Cutoffs)

Ultron features dual-threshold hysteresis VAD with extended speech pause tolerance so you can speak naturally without being interrupted:

- **Generous Silence Window (1800ms)**: You can pause for up to 1.8 seconds between thoughts, names, or clauses (e.g., *"Open WhatsApp... [pause]... search Sarah and message her hello"*) without Ultron cutting you off.
- **Dual-Threshold Hysteresis VAD**: Once you start speaking, quiet words, whispering, unvoiced consonants (`s`, `th`, `f`), and trailing syllables are kept active and never falsely counted as silence.
- **Incomplete Command Protection**: Ultron recognizes when speech ends on connectors like *"and"*, *"to"*, *"that"*, or *"search"* and keeps listening rather than executing half a command.
- **Trailing Audio Padding (~480ms)**: Guarantees that the last words of your sentence are never clipped off.

---

## ⚡ Instant Speech Interruption & Barge-In Capability

You never have to wait for Ultron, Vision, Friday, or Jarvis to finish talking. When an agent is speaking, you can interrupt them at any second simply by speaking:

- **Say Stop / Wait / Quiet**: Say *"Stop"*, *"Wait"*, *"Quiet"*, *"Cancel"*, or *"Pause"*, and the agent immediately cuts off speech in <15ms and returns to standby.
- **Give a New Command Mid-Speech**: Speak your new directive while the agent is talking (e.g., *"Hey Ultron, open WhatsApp..."* or *"Wait, make the background dark instead"*). The agent silences itself, captures your new instruction, and executes it immediately without making you repeat yourself.
- **Switch Operatives Mid-Speech**: If an agent is giving a lengthy briefing and you want a different specialist, simply say *"Hey Ultron"*, *"Hey Vision"*, *"Hey Friday"*, or *"Hey Jarvis"*. The speaking agent stops immediately, and the new agent takes over seamlessly.
- **Sub-15ms Cutoff + Pre-Warmed Engine**: Active audio buffers terminate in <15ms, and the audio engine pre-warms a fresh worker in the background while you speak your new sentence so the reply is instant.

---

## 🔮 Ultron Holographic HUD & Hand Gesture Recognition

Ultron includes a standalone cybernetic Holographic HUD dashboard featuring all 6 agents visually present, real-time audio visualizer waveforms, live system telemetry, and AI hand gesture recognition via webcam.

```
+-----------------------------------------------------------------------------------------+
| [⚡ ULTRON HOLOGRAPHIC HUD]    CPU: 14%  RAM: 4.2GB  BATTERY: 92%   [📷 Cam] [✕ Close]  |
+--------------------------+------------------------------+-------------------------------+
|  LIVE HAND GESTURE RADAR |      ARC REACTOR CORE        |     6 OPERATIVE CARDS         |
|                          |                              |                               |
|   ✋ Open Palm -> Mute   |    (((( Audio Wave ))))      |  🔴 Ultron (Commander)        |
|   ✊ Fist      -> Hide   |                              |  🔵 Vision (Backend/Code)     |
|   ☝️ Point Up  -> Listen |  "Yes, sir? Standing by..."  |  🟡 Friday (Word/PDF Docs)    |
|   ✌️ Peace (V) -> Vision |                              |  🟢 Jarvis (QA/Security)      |
|   👍 Thumbs Up -> RollCall|  [ Assemble ] [ Mute Mic ]   |  🟣 Veronica (Visual Media)   |
|   👈 / 👉 Swipe -> Media |  [ Vision ] [ Word Doc ]     |  ⚪ Sentinel (System & Power) |
+--------------------------+------------------------------+-------------------------------+
| > Enter command or speak freely...   (UI can be closed anytime; voice stays active 24/7)|
+-----------------------------------------------------------------------------------------+
```

### 1. Launching the HUD
- **One-Click Batch**: Double-click **`Start-Ultron-HUD.bat`**. It launches Microsoft Edge in standalone frameless app mode (`--app=http://localhost:3800`).
- **Voice Command**: Say *"Hey Ultron, open UI"* (or *"Hey Ultron, show HUD"* / *"open dashboard"*).
- **System Tray**: Right-click the Ultron icon in the Windows taskbar tray and click **Open Holographic HUD**.

### 2. Real-Time Hand Gesture Controls (MediaPipe Hands)
Toggle the **Hand Tracking** switch in the HUD to enable real-time 3D landmark tracking through your webcam:

| Gesture | Action | Description |
| :--- | :--- | :--- |
| ✋ **Open Palm** | **Mute / Stop** | Instantly silences speech and pauses wake-word detection. |
| ✊ **Fist** | **Hide to Background** | Minimizes/closes the HUD window while Ultron keeps running 24/7. |
| ☝️ **Index Point Up** | **Listen Now** | Immediately triggers voice listening without saying the wake word. |
| ✌️ **Peace Sign (V)** | **Switch to Vision** | Instantly switches the active agent to Vision (Code, Backend, SQL). |
| 👍 **Thumbs Up** | **Avengers Assemble** | Triggers the full 5-agent team roll call sound sequence. |
| 👈 / 👉 **Swipe Left / Right** | **Media Control** | Skips to Previous or Next audio/video track on Windows. |

*Built-in safety: gestures require a 380ms hold-to-confirm progress ring and a 1.4s cooldown to eliminate accidental triggers.*

### 3. Close & Work Normally in Background (24/7 Background Mode)
- **Close anytime**: Click `✕`, press `Alt + F4`, or make a ✊ Fist gesture to close the HUD.
- **Voice remains 100% active**: Closing the HUD window **never stops Ultron**. The engine continues running in the Windows background and system tray.
- You can work completely normally in your IDE, browser, or games, and simply say *"Hey Ultron"*, *"Hey Vision"*, *"Hey Friday"*, or *"Hey Jarvis"* anytime.
- Say *"Hey Ultron, open UI"* whenever you want the visual dashboard back!

---

## 🚀 Push Updates to GitHub

To push your latest agents, features, and code to your GitHub repository ([`ayaansyed10981-lab/Ultron-ai-assistant`](https://github.com/ayaansyed10981-lab/Ultron-ai-assistant)):

- **One-Click Batch**: Double-click **`Push-To-GitHub.bat`**. It automatically stages all changes, creates a commit with the new agents and features, and pushes to `origin main`.
- **Or via GitHub Desktop**:
  1. Open GitHub Desktop.
  2. Select `Ultron-ai-assistant`.
  3. Enter summary: *"Update Ultron Multi-Agent Team (Vision, Friday, Jarvis, Avengers assemble)"*.
  4. Click **Commit to main** and then **Push origin**.

---

## Quick Launch & Controls

- **Open Holographic HUD (Dashboard & Hand Gestures)**: Double-click **`Start-Ultron-HUD.bat`** (or say *"Hey Ultron, open UI"*).
- **Run 24/7 in Background**: Double-click **`Start-Ultron.bat`** (or **`Restart-Ultron.bat`**). It launches completely detached so closing File Explorer or other windows will **never** stop Ultron.
- **Stop Ultron**: Double-click **`Stop-Ultron.bat`** (or right-click the Ultron tray icon and click *Exit Ultron*).
- **View Live Console**: Double-click **`Start-Ultron-Console.bat`** if you want to watch live text logs.

---

## Personalized Multi-Agent Voice Training

Calibrate personalized acoustic voice recognition and Whisper phonetic spelling adaptation for each agent:

- **Train Whole Team**: Double-click **`Train-All-Voices.bat`** (or **`Train-My-Voice.bat`**).
  - Step 1: Commander Ultron asks for 4 samples of *"Hey Ultron"* (Microsoft Mark).
  - Step 2: Agent Vision asks for 4 samples of *"Hey Vision"* (Microsoft David).
  - Step 3: Agent Friday asks for 4 samples of *"Hey Friday"* (Microsoft Zira).
  - Step 4: Agent Jarvis asks for 4 samples of *"Hey Jarvis"* (Microsoft David).
- **Train Jarvis Only**: Double-click **`Train-Jarvis-Voice.bat`** (or `npm run train:jarvis`).
- **Train Vision Only**: Double-click **`Train-Vision-Voice.bat`** (or `npm run train:vision`).
- **Train Friday Only**: Double-click **`Train-Friday-Voice.bat`** (or `npm run train:friday`).
- **Train Ultron Only**: Double-click **`Train-Ultron-Voice.bat`** (or `npm run train:ultron`).
