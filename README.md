# ⚡ Ultron AI Assistant (Windows 11 ARM64 Native)

Your personal 24/7 voice-activated AI assistant named **Ultron**, engineered specifically for **Windows 11 ARM64 (Snapdragon)** with zero x86 emulation and instant native execution.

---

## 🚀 Key Features

- **100% Native Windows ARM64 (Snapdragon)**: Native `arm64` Node.js + WinRT & Win32 APIs for instant performance.
- **Offline Wake Word ("Hey Ultron" / "Ultron")**: Dual-engine offline neural acoustic detection running directly on your Snapdragon CPU with zero cloud latency.
- **Powered by Gemini API**:
  - Reasoning, conversation memory, and multi-tool function calling via the Google Gen AI SDK (`@google/genai`).
  - Strict guardrails: Respectful butler style ("sir"), never opens apps without explicit command.
- **Autonomous Software Engineer**: Generates complete runnable projects, games, and web apps from natural voice prompts and opens them in the browser or VS Code.
- **Microsoft Word Documents (.docx)**: Autonomously creates, formats (headings, tables, bullet points), reads, edits, and opens Word documents directly in Microsoft Word (`~/UltronDocuments/`).
- **Complete Windows Computer Control**:
  - Launch apps (`Chrome`, `Word`, `Notepad`, `Terminal`, `Spotify`, `Settings`, etc.)
  - Control volume, media playback, brightness, and power
  - Manage windows (minimize, maximize, close, switch, lock PC)
  - Screen vision: Captures and analyzes your primary screen
  - Battery, RAM, and system diagnostics
  - Background spoken timers and voice notes
- **Active 24/7 in Windows System Tray**: Runs silently in the background with auto-recovery.

---

## 🔒 Security & Privacy

This repository uses environment variables for all secrets. **Your API keys and personal files are never committed to GitHub.**
- The real `.env` file is excluded via `.gitignore`.
- Copy `.env.example` to `.env` and insert your own Gemini API key.

---

## 🛠️ Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/<YOUR-USERNAME>/ultron-assistant.git
cd ultron-assistant
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Add your Gemini API Key
Copy the template configuration:
```bash
copy .env.example .env
```
Open `.env` and add your Google AI Studio key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Run Ultron
- **Interactive Console**: Double-click `start-jarvis.bat` (or run `npm start`).
- **Silent Background System Tray**: Double-click `start-jarvis-background.vbs`.

---

## 🗣️ Example Voice Commands

Say **"Hey Ultron"** (wait for the chime / "Yes, sir?"):
- *"Open Chrome and search YouTube for lo-fi beats."*
- *"Create a Word document: a project proposal for AI automation."*
- *"Build a neon snake game in HTML and JavaScript."*
- *"What's my battery percentage and screen brightness?"*
- *"Take a note: Meeting tomorrow at 10 AM."*
- *"Set a timer for 15 minutes."*
- *"Lock my computer."*
