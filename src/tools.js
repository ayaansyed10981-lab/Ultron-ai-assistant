import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { TEMP_DIR } from './config.js';
import { generateAndBuildProject } from './coder.js';
import {
  createWordDocument,
  readWordDocument,
  appendToWordDocument,
  generateAiWordDocument,
  editWordDocument,
  findExistingWordDocument,
  listWordDocuments,
  openInWord,
  resolveWordDocPath,
  DOCUMENTS_DIR,
} from './word_docs.js';
import { TeamOrchestrator } from './agents/orchestrator.js';
import { logger } from './logger.js';

const NOTES_FILE = path.join(os.homedir(), 'UltronNotes', 'notes.md');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NATIVE_CONTROL_SCRIPT = path.join(__dirname, 'native', 'computer_control.ps1');

const DANGEROUS_SHELL_PATTERNS = [
  /\bformat-volume\b/i,
  /\bclear-disk\b/i,
  /\bremove-item\b[^\n]*(\bc:\\\s*$|c:\\windows|system32)/i,
  /\bdel\b[^\n]*(c:\\windows|system32)/i,
  /\brd\s+\/s\s+\/q\s+c:\\/i,
  /\bbcdedit\b/i,
  /\bdiskpart\b/i,
  /\breg\s+delete\s+hklm/i,
];

function resolveUserPath(inputPath) {
  if (!inputPath) return os.homedir();
  const home = os.homedir();
  const normalized = inputPath.trim();
  const shortcuts = {
    desktop: path.join(home, 'Desktop'),
    documents: path.join(home, 'Documents'),
    downloads: path.join(home, 'Downloads'),
    pictures: path.join(home, 'Pictures'),
    music: path.join(home, 'Music'),
    videos: path.join(home, 'Videos'),
    home,
    '~': home,
  };
  const lower = normalized.toLowerCase();
  if (shortcuts[lower]) return shortcuts[lower];
  if (normalized.startsWith('~/') || normalized.startsWith('~\\')) {
    return path.join(home, normalized.slice(2));
  }
  return path.resolve(normalized);
}

/**
 * Persistent Native Windows ARM64 Computer Control Worker
 */
export class ComputerController {
  constructor(config, onTimerFire) {
    this.config = config;
    this.onTimerFire = onTimerFire;
    this.geminiEngine = null;
    this.orchestrator = null;
    this.hudServer = null;
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.stopping = false;
    this.timers = new Map();
    this.nextTimerId = 1;
  }

  setGeminiEngine(engine) {
    this.geminiEngine = engine;
    this.orchestrator = new TeamOrchestrator(engine);
  }

  setHudServer(hudServer) {
    this.hudServer = hudServer;
  }

  setActiveTasksGetter(fn) {
    this.getActiveTasksSummary = fn;
  }

  setCallModeHandler(fn) {
    this.callModeHandler = fn;
  }

  async checkCallStatus() {
    try {
      const data = await this._callNative('check_call_status', {});
      return data || { inCall: false };
    } catch {
      return { inCall: false };
    }
  }

  async start() {
    if (this.proc) return;
    this.stopping = false;

    await new Promise((resolve, reject) => {
      const proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', NATIVE_CONTROL_SCRIPT],
        { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
      );
      this.proc = proc;
      let resolved = false;

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'ready') {
            resolved = true;
            resolve();
            return;
          }
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.ok) res(msg.data);
            else rej(new Error(msg.error || 'Native control action failed'));
          }
        } catch {
          // ignore non-JSON
        }
      });

      proc.stderr.on('data', (d) => {
        const txt = d.toString('utf8').trim();
        if (txt) logger.warn(`ComputerControl stderr: ${txt}`);
      });

      proc.on('exit', (code) => {
        this.proc = null;
        for (const [, { reject: rej }] of this.pending) {
          rej(new Error(`ComputerControl exited (code ${code})`));
        }
        this.pending.clear();
        if (!resolved) reject(new Error(`ComputerControl failed to start (code ${code})`));
      });
    });
  }

  async _callNative(action, args = {}) {
    if (!this.proc) {
      await this.start();
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.proc.stdin.write(`${JSON.stringify({ id, action, args })}\n`, 'utf8');
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  stop() {
    this.stopping = true;
    for (const entry of this.timers.values()) {
      clearTimeout(entry.timeout);
    }
    this.timers.clear();

    if (this.proc) {
      try {
        this.proc.stdin.write(`${JSON.stringify({ id: 0, action: 'exit' })}\n`);
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.proc) {
          try {
            this.proc.kill();
          } catch {
            // ignore
          }
        }
      }, 400);
    }
  }

  /**
   * Gemini Interactions API function tool definitions
   */
  getToolDeclarations() {
    const tools = [
      {
        type: 'function',
        name: 'open_app',
        description:
          'Launch an application on Windows ONLY when the user explicitly commands you to open, launch, or start an app (e.g. "open notepad", "launch calculator", "open vs code", "open spotify"). NEVER launch an app when the user is asking a question or having a conversation.',
        parameters: {
          type: 'object',
          properties: {
            app: {
              type: 'string',
              description: 'Friendly app name or executable path.',
            },
            arguments: {
              type: 'string',
              description: 'Optional command-line arguments to pass to the app.',
            },
          },
          required: ['app'],
        },
      },
      {
        type: 'function',
        name: 'open_url',
        description:
          'Open a website URL in the browser ONLY when the user explicitly commands you to "open browser", "open website", or "open this link". NEVER use this tool to answer general knowledge questions, questions about characters (like Obito, Naruto, etc.), definitions, or trivia. Always answer knowledge questions directly from your own AI brain.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Full URL to open (e.g., https://github.com).',
            },
          },
          required: ['url'],
        },
      },
      {
        type: 'function',
        name: 'control_media_volume',
        description: 'Control Windows system audio volume or media playback.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              enum: [
                'volume_up',
                'volume_down',
                'mute',
                'play_pause',
                'next_track',
                'prev_track',
                'stop_media',
              ],
              description: 'The volume or media action to perform.',
            },
            steps: {
              type: 'integer',
              description: 'Number of steps for volume_up or volume_down (default 5, each step is ~2%).',
            },
          },
          required: ['command'],
        },
      },
      {
        type: 'function',
        name: 'manage_windows',
        description:
          'List open Windows desktop windows, focus/minimize/maximize/close a window by title or app name, show desktop, or lock the PC screen.',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['list', 'focus', 'minimize', 'maximize', 'close', 'show_desktop', 'lock_screen'],
              description: 'Window operation to perform.',
            },
            title: {
              type: 'string',
              description: 'Partial window title or process name (required for focus, minimize, maximize, close).',
            },
          },
          required: ['operation'],
        },
      },
      {
        type: 'function',
        name: 'keyboard_action',
        description:
          'Type text into the currently focused Windows app or press a keyboard shortcut (e.g., ctrl+c, ctrl+v, ctrl+s, alt+tab, ctrl+w, win+s, enter).',
        parameters: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['type', 'hotkey'],
              description: 'Whether to type text or press a key combination.',
            },
            text: {
              type: 'string',
              description: 'Text to type when mode is "type".',
            },
            press_enter: {
              type: 'boolean',
              description: 'Whether to press Enter after typing.',
            },
            keys: {
              type: 'string',
              description: 'Hotkey combo when mode is "hotkey" (e.g., "ctrl+c", "alt+tab", "ctrl+shift+esc").',
            },
          },
          required: ['mode'],
        },
      },
      {
        type: 'function',
        name: 'mouse_action',
        description: 'Move mouse cursor, click, double-click, right-click, or scroll.',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['move', 'left_click', 'double_click', 'right_click', 'scroll_up', 'scroll_down'],
            },
            x: { type: 'integer', description: 'Optional screen X coordinate.' },
            y: { type: 'integer', description: 'Optional screen Y coordinate.' },
            amount: { type: 'integer', description: 'Scroll clicks (default 3).' },
          },
          required: ['operation'],
        },
      },
      {
        type: 'function',
        name: 'capture_screen',
        description:
          'Take a screenshot of the user current Windows screen so you can see and describe or help with what is on screen.',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Brief reason for taking the screenshot.',
            },
          },
        },
      },
      {
        type: 'function',
        name: 'clipboard_tool',
        description: 'Read text currently in the Windows clipboard or copy new text to the clipboard.',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['read', 'write'],
            },
            text: {
              type: 'string',
              description: 'Text to copy when operation is "write".',
            },
          },
          required: ['operation'],
        },
      },
      {
        type: 'function',
        name: 'file_manager',
        description:
          'List files in a folder (supports shortcuts: Desktop, Documents, Downloads, Pictures, home), read a text file, or create/write a text file.',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['list', 'read', 'write'],
            },
            target_path: {
              type: 'string',
              description: 'Folder or file path (e.g., "Desktop", "Documents", or full Windows path).',
            },
            content: {
              type: 'string',
              description: 'Content to write when operation is "write".',
            },
          },
          required: ['operation', 'target_path'],
        },
      },
      {
        type: 'function',
        name: 'get_system_info',
        description:
          'Get live Windows ARM64 computer status: current time, date, battery percentage, charging status, available RAM, free disk space, and architecture.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        type: 'function',
        name: 'set_timer',
        description:
          'Set a spoken timer or reminder that fires in the background and announces the message aloud.',
        parameters: {
          type: 'object',
          properties: {
            seconds: {
              type: 'integer',
              description: 'Duration in seconds until the timer or reminder fires.',
            },
            label: {
              type: 'string',
              description: 'Short reminder message to announce when the timer finishes.',
            },
          },
          required: ['seconds', 'label'],
        },
      },
      {
        type: 'function',
        name: 'code_and_build',
        description:
          'Autonomously write complete single-file or multi-file code/projects/websites/games/scripts from ANY coding prompt, save them to ~/UltronProjects, and automatically open HTML apps in the browser or code in VS Code (or run scripts). ALWAYS use this tool whenever the user asks you to write code, build a website, create a game, or make a script.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Full description of what code, app, website, game, or script to build.',
            },
            language: {
              type: 'string',
              description: 'Preferred language or stack (e.g. html, python, javascript, powershell, auto).',
            },
            project_name: {
              type: 'string',
              description: 'Optional short folder name for the project.',
            },
            run_script: {
              type: 'boolean',
              description: 'Set true if the user asked to run/execute a JS or PowerShell script immediately.',
            },
          },
          required: ['prompt'],
        },
      },
      {
        type: 'function',
        name: 'notes_manager',
        description:
          'Manage the user personal notes and to-do list stored locally in ~/UltronNotes/notes.md (add a note, list/read all notes, or clear notes).',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['add', 'read', 'clear'],
            },
            text: {
              type: 'string',
              description: 'Note or to-do item text when operation is "add".',
            },
          },
          required: ['operation'],
        },
      },
      {
        type: 'function',
        name: 'screen_brightness',
        description: 'Get, increase, decrease, or set the laptop screen brightness (0 to 100 percent).',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['get', 'up', 'down', 'set'],
            },
            level: {
              type: 'integer',
              description: 'Brightness percentage (0-100) when operation is "set".',
            },
          },
          required: ['operation'],
        },
      },
      {
        type: 'function',
        name: 'save_screenshot',
        description: 'Take a screenshot of the screen and save it permanently as a PNG image in Pictures/Screenshots or Desktop.',
        parameters: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              enum: ['screenshots', 'desktop'],
              description: 'Where to save the screenshot (default: screenshots).',
            },
          },
        },
      },
      {
        type: 'function',
        name: 'get_weather_and_web',
        description: 'Get real-time live weather for the user current location or a specified city.',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'Optional city name (leave blank for automatic local weather).',
            },
          },
        },
      },
      {
        type: 'function',
        name: 'word_document_manager',
        description:
          'Create, edit, update, append to, read, or list Microsoft Word documents (.docx). Use this whenever the user asks to create a Word document, edit or update an existing Word document by name, append content to a document, read or summarize a .docx file, or list saved documents. When editing, documents are safely resolved even by partial or spoken names, updated, and automatically opened in Microsoft Word.',
        parameters: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['create', 'edit', 'update', 'append', 'read', 'list', 'open'],
              description: 'The Word document operation to perform. Use "edit" or "update" to modify or append to an existing document by name.',
            },
            prompt: {
              type: 'string',
              description: 'Description or topic of the Word document to write when creating with AI, or edit instructions.',
            },
            document_name: {
              type: 'string',
              description: 'Name or partial title of the existing Word document to edit, update, or read (e.g. "Project Proposal", "meeting notes").',
            },
            instructions: {
              type: 'string',
              description: 'Specific editing instructions or additions to apply to the existing document.',
            },
            title: {
              type: 'string',
              description: 'Document title.',
            },
            filename: {
              type: 'string',
              description: 'Filename ending in .docx (e.g. Project_Proposal.docx).',
            },
            file_path: {
              type: 'string',
              description: 'Path or filename of the Word document when reading, editing, appending, or opening.',
            },
            content: {
              type: 'string',
              description: 'Text, markdown, or notes to include in the document.',
            },
            heading: {
              type: 'string',
              description: 'Section heading when appending new content.',
            },
          },
          required: ['operation'],
        },
      },
      {
        type: 'function',
        name: 'delegate_to_cypher',
        description:
          'Deploy Agent Vision (Chief Software Engineer & Full-Stack Backend Architect) to engineer full-stack software, build production backend REST/GraphQL APIs and microservices (Node.js/Express, Python/FastAPI/Flask), write frontend web apps, or engineer optimized SQL queries and database schemas (PostgreSQL, MySQL, SQLite, SQL Server). ALWAYS call this tool whenever the user asks for code, programming, backend, APIs, servers, or SQL queries.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['code', 'backend', 'sql', 'review'],
              description: 'Whether to write software code, build a backend API/server, engineer a SQL database query, or review/optimize code.',
            },
            prompt: {
              type: 'string',
              description: 'Full description of the software project, backend API, or SQL database query to engineer.',
            },
            stack: {
              type: 'string',
              description: 'Framework/stack when action is "backend" (e.g. node-express, fastapi, flask, auto).',
            },
            database: {
              type: 'string',
              description: 'Database system for backend (e.g. sqlite, postgresql, mongodb, mysql, none).',
            },
            auth: {
              type: 'string',
              description: 'Authentication strategy (e.g. jwt, api_key, session, none).',
            },
            dialect: {
              type: 'string',
              description: 'SQL dialect (PostgreSQL, MySQL, SQLite, SQL Server, etc.) when action is "sql".',
            },
            language: {
              type: 'string',
              description: 'Programming language (Python, JavaScript, HTML, C++, PowerShell, etc.) when action is "code".',
            },
            schema_context: {
              type: 'string',
              description: 'Existing table schema or context for SQL queries.',
            },
          },
          required: ['action', 'prompt'],
        },
      },
      {
        type: 'function',
        name: 'delegate_to_scribe',
        description:
          'Deploy Agent Friday (Executive Document Architect) to create, edit, update, append to, read, or summarize Microsoft Word (.docx) documents and executive PDF (.pdf) reports. When asked to edit or update an existing document by name, Friday locates it (using smart fuzzy matching even for partial or spoken names), integrates your requested changes or additions, and automatically opens the updated document in Microsoft Word.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'edit', 'update', 'append', 'read', 'list'],
              description: 'Action to perform: "edit" or "update" to modify an existing document by name, "create" for a new document, "read" to inspect.',
            },
            prompt: {
              type: 'string',
              description: 'Detailed description of the document to create or the editing instructions.',
            },
            document_name: {
              type: 'string',
              description: 'Name or partial title of the existing Word document to edit, update, or read (e.g. "Project Proposal", "meeting notes", "report.docx").',
            },
            file_path: {
              type: 'string',
              description: 'Path or filename of the document.',
            },
            edit_instructions: {
              type: 'string',
              description: 'Specific additions, sections, modifications, or updates to make to the existing document.',
            },
            content: {
              type: 'string',
              description: 'Direct text or content to add or append to the document.',
            },
            heading: {
              type: 'string',
              description: 'Section heading for new or edited content.',
            },
            format: {
              type: 'string',
              enum: ['docx', 'pdf', 'both'],
              description: 'Output format: "docx" for Word, "pdf" for PDF, or "both" for both formats simultaneously.',
            },
            title: {
              type: 'string',
              description: 'Document title.',
            },
          },
          required: ['prompt'],
        },
      },
      {
        type: 'function',
        name: 'delegate_to_jarvis',
        description:
          'Deploy Agent Jarvis (Chief Quality Assurance Engineer & Security Inspector) to inspect, audit, test, and conduct rigorous security checks (OWASP Top 10, SQL injection, hardcoded secrets, auth hygiene) on Vision\'s backend APIs, servers, full-stack code, and SQL databases, as well as Friday\'s Microsoft Word (.docx) and PDF (.pdf) documents. ALWAYS call this tool whenever the user asks to check, inspect, test, review, audit, or verify an app, backend, security, SQL query, Word document, or PDF report.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['check_app', 'audit_backend', 'security_check', 'check_sql', 'check_word', 'check_pdf', 'audit_all'],
              description: 'Whether to check a web application, audit backend API & security vulnerabilities, run security check, check SQL query, check Word document, check PDF, or audit all deliverables.',
            },
            target: {
              type: 'string',
              description: 'Project name, backend folder path, filename, or SQL query string to inspect.',
            },
            dialect: {
              type: 'string',
              description: 'SQL dialect (PostgreSQL, MySQL, SQLite, SQL Server) if action is check_sql.',
            },
          },
          required: ['action'],
        },
      },
      {
        type: 'function',
        name: 'team_mission_coordinator',
        description:
          'Deploy the Ultron Specialist Team (Vision for code/apps/websites/SQL, Friday for Word/PDF documents, and Jarvis for quality verification) on a simultaneous parallel mission to build code, create documents, and audit deliverables at the exact same time.',
        parameters: {
          type: 'object',
          properties: {
            mission_prompt: {
              type: 'string',
              description: 'Full mission directive describing what software/database to build and what documentation/reports to produce.',
            },
          },
          required: ['mission_prompt'],
        },
      },
      {
        type: 'function',
        name: 'delegate_to_veronica',
        description:
          'Delegate visual branding, cinematic video loops, imagery, SVG vector art, or scrollytelling visual assets to Agent Veronica (Chief Visual Media & Creative Director).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['media_kit', 'video', 'image'],
              description:
                'Whether to generate a full branding/scrollytelling media kit, a standalone video loop, or an image/SVG asset.',
            },
            company: {
              type: 'string',
              description: 'Company or product name for branding/media kit generation.',
            },
            prompt: {
              type: 'string',
              description: 'Description of the visual, video, or branding asset.',
            },
            style: {
              type: 'string',
              description: 'Aesthetic theme (e.g. cinematic, cyberpunk, luxury, minimal, tech).',
            },
          },
          required: ['action', 'prompt'],
        },
      },
      {
        type: 'function',
        name: 'make_phone_call',
        description:
          'Place a phone call to the user or a phone number. Use when the user asks to call them, call their phone, dial a number, or ring their mobile.',
        parameters: {
          type: 'object',
          properties: {
            phone_number: {
              type: 'string',
              description:
                'The phone number to call with country code (e.g. +91XXXXXXXXXX or +1XXXXXXXXXX). If omitted, uses USER_PHONE_NUMBER from .env.',
            },
            message: {
              type: 'string',
              description:
                'Message or greeting for Ultron to speak when the user answers (for automated cloud voice calling).',
            },
          },
        },
      },
      {
        type: 'function',
        name: 'send_whatsapp_message',
        description:
          'Open WhatsApp Desktop, search for a contact or dial a phone number, paste a message, and send it. Use whenever the user asks to open WhatsApp, message someone, text someone on WhatsApp, or send a WhatsApp message.',
        parameters: {
          type: 'object',
          properties: {
            contact: {
              type: 'string',
              description: 'Contact name (e.g. "Mom", "Sarah", "John Doe") or phone number with country code (e.g. "+919876543210").',
            },
            message: {
              type: 'string',
              description: 'The text message to type and send.',
            },
            pressEnter: {
              type: 'boolean',
              description: 'Whether to automatically press enter to send the message immediately (default true).',
            },
          },
          required: ['contact', 'message'],
        },
      },
      {
        type: 'function',
        name: 'open_and_write',
        description:
          'Open or activate any Windows application (Notepad, Word, VS Code, etc.) and write, type, or paste text/content into it immediately. Use when the user asks to open an app and write or type something.',
        parameters: {
          type: 'object',
          properties: {
            app: {
              type: 'string',
              description: 'Application to open (e.g. "notepad", "word", "vscode"). Default is "notepad".',
            },
            text: {
              type: 'string',
              description: 'The text or content to write/type into the application.',
            },
            pressEnter: {
              type: 'boolean',
              description: 'Whether to press Enter after typing (default true).',
            },
          },
          required: ['text'],
        },
      },
    ];

    if (this.config.allowShell) {
      tools.push({
        type: 'function',
        name: 'run_powershell',
        description:
          'Execute a non-destructive Windows PowerShell command for advanced computer tasks (e.g., checking Wi-Fi, finding files, creating folders, checking running processes). Never run destructive or system-damaging commands.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'PowerShell command to execute.',
            },
          },
          required: ['command'],
        },
      });
    }

    return tools;
  }

  /**
   * Execute a Gemini function call and return { text, imageBase64?, imageMimeType? }
   */
  async executeTool(name, args = {}) {
    logger.tool(`${name}(${JSON.stringify(args)})`);

    try {
      switch (name) {
        case 'open_app': {
          const data = await this._callNative('open_app', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'open_url': {
          const data = await this._callNative('open_url', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'control_media_volume': {
          const data = await this._callNative('media_volume', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'manage_windows': {
          if (args.operation === 'list') {
            const data = await this._callNative('list_windows', {});
            return { text: JSON.stringify({ ok: true, ...data }) };
          }
          const data = await this._callNative('window_action', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'keyboard_action': {
          if (args.mode === 'type') {
            const data = await this._callNative('keyboard_type', {
              text: args.text || '',
              pressEnter: Boolean(args.press_enter),
            });
            return { text: JSON.stringify({ ok: true, ...data }) };
          }
          const data = await this._callNative('keyboard_hotkey', { keys: args.keys || '' });
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'mouse_action': {
          const data = await this._callNative('mouse_action', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'capture_screen': {
          const shotPath = path.join(TEMP_DIR, `screen_${Date.now()}.png`);
          const data = await this._callNative('screenshot', { path: shotPath });
          const imageBase64 = fs.readFileSync(shotPath).toString('base64');
          try {
            fs.unlinkSync(shotPath);
          } catch {
            // ignore
          }
          return {
            text: JSON.stringify({
              ok: true,
              message: `Captured primary screen (${data.width}x${data.height}). Analyze the attached image to answer the user.`,
            }),
            imageBase64,
            imageMimeType: 'image/png',
          };
        }

        case 'clipboard_tool': {
          if (args.operation === 'read') {
            const data = await this._callNative('clipboard_get', {});
            return { text: JSON.stringify({ ok: true, text: (data.text || '').slice(0, 4000) }) };
          }
          const data = await this._callNative('clipboard_set', { text: args.text || '' });
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'file_manager': {
          const resolved = resolveUserPath(args.target_path);
          if (args.operation === 'list') {
            const entries = fs.readdirSync(resolved, { withFileTypes: true }).slice(0, 50);
            const items = entries.map((e) => ({
              name: e.name,
              type: e.isDirectory() ? 'folder' : 'file',
            }));
            return { text: JSON.stringify({ ok: true, path: resolved, items }) };
          }
          if (args.operation === 'read') {
            const raw = fs.readFileSync(resolved, 'utf8');
            return {
              text: JSON.stringify({
                ok: true,
                path: resolved,
                content: raw.slice(0, 6000),
                truncated: raw.length > 6000,
              }),
            };
          }
          if (args.operation === 'write') {
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
            fs.writeFileSync(resolved, String(args.content ?? ''), 'utf8');
            return { text: JSON.stringify({ ok: true, path: resolved, message: 'File written.' }) };
          }
          throw new Error(`Unsupported file_manager operation: ${args.operation}`);
        }

        case 'get_system_info': {
          const data = await this._callNative('system_info', {});
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'set_timer': {
          const secs = Math.max(1, Math.min(86400, Number.parseInt(args.seconds, 10) || 60));
          const label = String(args.label || 'Timer complete').trim();
          const timerId = this.nextTimerId++;
          const timeout = setTimeout(() => {
            this.timers.delete(timerId);
            if (this.onTimerFire) {
              this.onTimerFire(label);
            }
          }, secs * 1000);
          this.timers.set(timerId, { label, timeout, endsAt: Date.now() + secs * 1000 });
          return {
            text: JSON.stringify({
              ok: true,
              timerId,
              seconds: secs,
              label,
              message: `Timer #${timerId} set for ${secs} seconds: ${label}`,
            }),
          };
        }

        case 'code_and_build': {
          if (!this.geminiEngine) {
            return { text: JSON.stringify({ ok: false, error: 'Coder engine not linked.' }) };
          }
          const built = await generateAndBuildProject(this.geminiEngine, args);
          return { text: JSON.stringify(built) };
        }

        case 'notes_manager': {
          const op = String(args.operation || 'read').toLowerCase();
          fs.mkdirSync(path.dirname(NOTES_FILE), { recursive: true });
          if (op === 'add') {
            const entry = String(args.text || '').trim();
            if (!entry) return { text: JSON.stringify({ ok: false, error: 'Empty note text.' }) };
            const stamp = new Date().toLocaleString();
            fs.appendFileSync(NOTES_FILE, `- [${stamp}] ${entry}\n`, 'utf8');
            return { text: JSON.stringify({ ok: true, message: `Saved note: ${entry}` }) };
          }
          if (op === 'clear') {
            fs.writeFileSync(NOTES_FILE, '', 'utf8');
            return { text: JSON.stringify({ ok: true, message: 'Cleared all notes.' }) };
          }
          const existing = fs.existsSync(NOTES_FILE) ? fs.readFileSync(NOTES_FILE, 'utf8').trim() : '';
          return {
            text: JSON.stringify({
              ok: true,
              notes: existing || 'No notes saved yet.',
            }),
          };
        }

        case 'screen_brightness': {
          const data = await this._callNative('brightness', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'save_screenshot': {
          const data = await this._callNative('save_screenshot', args);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        case 'get_weather_and_web': {
          const city = String(args.city || '').trim();
          const url = `https://wttr.in/${encodeURIComponent(city)}?format=%l:+%C,+%t+(feels+like+%f),+humidity+%h,+wind+%w`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!resp.ok) throw new Error(`Weather lookup failed (${resp.status})`);
          const summary = (await resp.text()).trim();
          return { text: JSON.stringify({ ok: true, weather: summary }) };
        }

        case 'word_document_manager': {
          const op = String(args.operation || 'create').toLowerCase();
          if (op === 'create') {
            if (args.prompt && this.geminiEngine) {
              const res = await generateAiWordDocument(this.geminiEngine, args);
              return { text: JSON.stringify(res) };
            }
            const res = await createWordDocument({
              title: args.title || 'Document',
              filename: args.filename || 'Document.docx',
              rawContent: args.content || '',
              openAfter: true,
            });
            return { text: JSON.stringify(res) };
          }
          if (op === 'edit' || op === 'update') {
            const res = await editWordDocument(this.geminiEngine, {
              documentName: args.document_name || args.file_path || args.filename,
              filePath: args.file_path || args.filename,
              instructions: args.instructions || args.prompt || args.content,
              content: args.content,
              heading: args.heading,
              openAfter: true,
            });
            return { text: JSON.stringify(res) };
          }
          if (op === 'read') {
            const res = await readWordDocument(args.file_path || args.filename || args.document_name);
            return { text: JSON.stringify(res) };
          }
          if (op === 'append') {
            const res = await appendToWordDocument({
              filePath: args.file_path || args.filename || args.document_name,
              newHeading: args.heading || '',
              content: args.content || '',
              openAfter: true,
            });
            return { text: JSON.stringify(res) };
          }
          if (op === 'list') {
            const docs = listWordDocuments(args.file_path);
            return { text: JSON.stringify({ ok: true, documents: docs }) };
          }
          if (op === 'open') {
            const resolved = findExistingWordDocument(args.file_path || args.filename || args.document_name);
            const target = resolved ? resolved.path : resolveWordDocPath(args.file_path || args.filename || args.document_name);
            const opened = await openInWord(target);
            return { text: JSON.stringify({ ok: opened, path: target, filename: path.basename(target) }) };
          }
          throw new Error(`Unsupported word_document_manager operation: ${op}`);
        }

        case 'delegate_to_cypher': {
          if (!this.orchestrator) {
            return { text: JSON.stringify({ ok: false, error: 'Agent Cypher not initialized.' }) };
          }
          const action = String(args.action || 'code').toLowerCase();
          if (action === 'backend') {
            const res = await this.orchestrator.cypher.buildBackend(args);
            return { text: JSON.stringify(res) };
          }
          if (action === 'sql') {
            const res = await this.orchestrator.cypher.generateSql({
              prompt: args.prompt,
              dialect: args.dialect || 'PostgreSQL',
              schema_context: args.schema_context,
            });
            return { text: JSON.stringify(res) };
          }
          if (action === 'review') {
            const res = await this.orchestrator.cypher.reviewOrOptimize(args);
            return { text: JSON.stringify(res) };
          }
          const res = await this.orchestrator.cypher.buildProject(args);
          return { text: JSON.stringify(res) };
        }

        case 'delegate_to_scribe': {
          if (!this.orchestrator) {
            return { text: JSON.stringify({ ok: false, error: 'Agent Scribe not initialized.' }) };
          }
          const action = String(args.action || '').toLowerCase();
          const docQuery = args.document_name || args.file_path || args.filename;
          const isEdit =
            action === 'edit' ||
            action === 'append' ||
            action === 'update' ||
            (docQuery && /\b(?:edit|update|modify|change|add|append)\b/i.test(args.prompt || ''));

          if (isEdit) {
            const res = await this.orchestrator.scribe.editDocument({
              documentName: docQuery,
              filePath: args.file_path || args.filename,
              instructions: args.edit_instructions || args.prompt || args.content,
              content: args.content,
              heading: args.heading,
              ...args,
            });
            return { text: JSON.stringify(res) };
          }
          if (action === 'read') {
            const res = await this.orchestrator.scribe.inspectDocument(docQuery || args.prompt);
            return { text: JSON.stringify(res) };
          }
          const res = await this.orchestrator.scribe.generateAiDocument(args);
          return { text: JSON.stringify(res) };
        }

        case 'delegate_to_jarvis': {
          if (!this.orchestrator || !this.orchestrator.jarvis) {
            return { text: JSON.stringify({ ok: false, error: 'Agent Jarvis not initialized.' }) };
          }
          const action = String(args.action || 'audit_all').toLowerCase();
          let res;
          if (action === 'audit_backend' || action === 'security_check' || action === 'security') {
            res = await this.orchestrator.jarvis.auditBackendAndSecurity(args.target, args);
          } else if (action === 'check_app') {
            res = await this.orchestrator.jarvis.checkApp(args.target);
          } else if (action === 'check_sql') {
            res = await this.orchestrator.jarvis.checkSql(args.target, args.dialect || 'PostgreSQL');
          } else if (action === 'check_word') {
            res = await this.orchestrator.jarvis.checkWordDocument(args.target);
          } else if (action === 'check_pdf') {
            res = await this.orchestrator.jarvis.checkPdfDocument(args.target);
          } else {
            res = await this.orchestrator.jarvis.auditDeliverables({});
          }
          return { text: JSON.stringify(res) };
        }

        case 'delegate_to_veronica': {
          if (!this.orchestrator || !this.orchestrator.veronica) {
            return { text: JSON.stringify({ ok: false, error: 'Agent Veronica not initialized.' }) };
          }
          const action = String(args.action || 'media_kit').toLowerCase();
          let res;
          if (action === 'video') {
            res = await this.orchestrator.veronica.generateVideo(args);
          } else if (action === 'image') {
            res = await this.orchestrator.veronica.generateImage(args);
          } else {
            res = await this.orchestrator.veronica.generateMediaKit(args);
          }
          return { text: JSON.stringify(res) };
        }

        case 'team_mission_coordinator': {
          if (!this.orchestrator) {
            return { text: JSON.stringify({ ok: false, error: 'Team Orchestrator not initialized.' }) };
          }
          const res = await this.orchestrator.runMission(args.mission_prompt || args.prompt);
          return { text: JSON.stringify(res) };
        }

        case 'run_powershell': {
          if (!this.config.allowShell) {
            return { text: JSON.stringify({ ok: false, error: 'Shell execution is disabled in .env.' }) };
          }
          const cmd = String(args.command || '').trim();
          for (const pat of DANGEROUS_SHELL_PATTERNS) {
            if (pat.test(cmd)) {
              return {
                text: JSON.stringify({
                  ok: false,
                  error: 'Blocked potentially destructive command for safety.',
                }),
              };
            }
          }
          const output = await new Promise((resolve) => {
            execFile(
              'powershell.exe',
              ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
              { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
              (err, stdout, stderr) => {
                resolve({
                  ok: !err,
                  stdout: (stdout || '').trim().slice(0, 3500),
                  stderr: (stderr || '').trim().slice(0, 1000),
                  error: err ? err.message : undefined,
                });
              },
            );
          });
          return { text: JSON.stringify(output) };
        }

        case 'make_phone_call': {
          const res = await this.makePhoneCall(args.phone_number, args.message);
          return { text: JSON.stringify(res) };
        }

        case 'send_whatsapp_message': {
          const contact = String(args.contact || '').trim();
          const message = String(args.message || '').trim();
          const pressEnter = args.pressEnter !== false;
          if (!contact || !message) {
            return {
              text: JSON.stringify({ ok: false, error: 'Both contact and message are required.' }),
            };
          }
          const res = await this.sendWhatsAppMessage(contact, message, pressEnter);
          return { text: JSON.stringify(res) };
        }

        case 'open_and_write': {
          const app = String(args.app || 'notepad').trim();
          const text = String(args.text || args.content || '').trim();
          const pressEnter = args.pressEnter !== false;
          const data = await this.openAndWrite(app, text, pressEnter);
          return { text: JSON.stringify({ ok: true, ...data }) };
        }

        default:
          return { text: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }) };
      }
    } catch (err) {
      logger.error(`Tool ${name} failed: ${err.message}`);
      return { text: JSON.stringify({ ok: false, error: err.message }) };
    }
  }

  /**
   * Make a phone call using Twilio Voice (cloud) or Windows Phone Link (local)
   */
  async makePhoneCall(phoneNumber, message) {
    const targetNumber = phoneNumber || process.env.USER_PHONE_NUMBER;
    const spokenMessage =
      message ||
      'Hello sir, this is Ultron calling from your computer. All systems and operatives are operational.';

    if (!targetNumber) {
      return {
        ok: false,
        error:
          'No phone number configured. Please set USER_PHONE_NUMBER in .env or provide a phone number.',
      };
    }

    const cleanNumber = targetNumber.replace(/[^\d+]/g, '');

    // Auto-activate Call Mode so Ultron never interrupts while the user is on the call
    if (this.callModeHandler) {
      this.callModeHandler(true, 15);
    }

    // Check if Twilio Voice credentials are provided in .env
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const twiml = `<Response><Say voice="Polly.Matthew">${spokenMessage.replace(/[<>&]/g, '')}</Say></Response>`;
        const body = new URLSearchParams({
          To: cleanNumber,
          From: twilioFrom,
          Twiml: twiml,
        });

        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        const data = await res.json();
        if (res.ok && data.sid) {
          logger.info(`[PHONE] Twilio voice call placed to ${cleanNumber} (Call SID: ${data.sid})`);
          return {
            ok: true,
            provider: 'twilio',
            callSid: data.sid,
            message: `Placing phone call to ${cleanNumber} via Twilio Voice. Your phone should be ringing now, sir.`,
          };
        }
        logger.warn(`[PHONE] Twilio error: ${data.message || JSON.stringify(data)}; falling back to Phone Link.`);
      } catch (err) {
        logger.error(`[PHONE] Twilio call failed: ${err.message}`);
      }
    }

    // Default & Zero-Config: Windows Phone Link via tel: protocol
    return new Promise((resolve) => {
      execFile(
        'cmd.exe',
        ['/c', 'start', '', `tel:${cleanNumber}`],
        { windowsHide: true },
        (err) => {
          if (err) {
            resolve({ ok: false, error: `Failed to trigger dialer: ${err.message}` });
          } else {
            logger.info(`[PHONE] Initiated phone call to ${cleanNumber} via Windows Phone Link.`);
            resolve({
              ok: true,
              provider: 'phonelink',
              message: `Calling ${cleanNumber} via Windows Phone Link, sir.`,
            });
          }
        },
      );
    });
  }

  /**
   * Send WhatsApp message via Windows WhatsApp Desktop app or URI
   */
  async sendWhatsAppMessage(contact, message, pressEnter = true) {
    return this._callNative('whatsapp_send_message', { contact, message, pressEnter });
  }

  /**
   * Directly open an application and write/paste text into it immediately
   */
  async openAndWrite(app = 'notepad', text = '', pressEnter = true) {
    return this._callNative('open_and_type', { app, text, pressEnter });
  }

  /**
   * Directly type/paste text into the currently active/focused window
   */
  async typeActiveWindow(text = '', pressEnter = true) {
    return this._callNative('type_active_window', { text, pressEnter });
  }
}
