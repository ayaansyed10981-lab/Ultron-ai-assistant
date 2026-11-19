import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from './logger.js';

export const PROJECTS_DIR = path.join(os.homedir(), 'UltronProjects');

function slugify(name) {
  return (
    String(name || 'project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `project-${Date.now()}`
  );
}

function safeRelativePath(rel) {
  const cleaned = String(rel || 'main.txt')
    .replace(/^[/\\]+/, '')
    .replace(/\.\./g, '');
  return cleaned || 'main.txt';
}

function openInDefaultApp(targetPath) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -FilePath '${targetPath.replace(/'/g, "''")}'`],
      { windowsHide: true, timeout: 8000 },
      () => resolve(),
    );
  });
}

function openInVsCode(projectDir, mainFile) {
  return new Promise((resolve) => {
    const args = mainFile ? [projectDir, mainFile] : [projectDir];
    execFile('code.cmd', args, { windowsHide: true, timeout: 8000 }, (err) => {
      if (err) {
        // Fallback to opening the main file in Notepad if VS Code CLI is not in PATH
        if (mainFile) {
          openInDefaultApp(mainFile).then(() => resolve('default'));
        } else {
          openInDefaultApp(projectDir).then(() => resolve('explorer'));
        }
      } else {
        resolve('vscode');
      }
    });
  });
}

function runNodeScript(filePath) {
  return new Promise((resolve) => {
    execFile('node', [filePath], { timeout: 10000, maxBuffer: 512 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: (stdout || '').trim().slice(0, 1000),
        stderr: (stderr || '').trim().slice(0, 500),
      });
    });
  });
}

function runPowerShellScript(filePath) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', filePath],
      { timeout: 10000, maxBuffer: 512 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: (stdout || '').trim().slice(0, 1000),
          stderr: (stderr || '').trim().slice(0, 500),
        });
      },
    );
  });
}

/**
 * Autonomous AI Code Builder: generates complete runnable single/multi-file projects from any voice prompt,
 * saves them to ~/UltronProjects/<project>, and automatically launches them in browser / VS Code / runtime!
 */
export async function generateAndBuildProject(geminiEngine, args) {
  const prompt = String(args.prompt || '').trim();
  const language = String(args.language || 'auto').trim();
  const requestedName = String(args.project_name || '').trim();
  const shouldRun = Boolean(args.run_script);
  const openEditor = args.open_editor !== false;

  if (!prompt) {
    return { ok: false, error: 'A coding prompt is required.' };
  }

  const schema = {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Short lowercase hyphenated folder name (e.g. neon-snake-game, fibonacci-script).',
      },
      summary: {
        type: 'string',
        description: 'One concise spoken sentence summarizing what was built (no markdown).',
      },
      entry_file: {
        type: 'string',
        description: 'Relative path of the primary file (e.g. index.html, main.py, app.js).',
      },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path.' },
            content: { type: 'string', description: 'Complete, clean, runnable file source code.' },
          },
          required: ['path', 'content'],
        },
      },
    },
    required: ['project_name', 'summary', 'entry_file', 'files'],
  };

  const coderPrompt = [
    'You are an expert autonomous software engineer building a complete, working, polished project for the user.',
    `User request: ${prompt}`,
    language !== 'auto' ? `Preferred language/stack: ${language}` : '',
    'Rules:',
    '- Produce complete, runnable, self-contained code with zero TODO placeholders.',
    '- For web apps, games, calculators, or UI requests, create a gorgeous modern dark-mode responsive single-file index.html (with embedded CSS & JS) so it opens and works instantly in any browser with zero build step!',
    '- For scripts (Python, Node.js, PowerShell), include clean comments and working sample output.',
    '- Return ONLY valid JSON matching the required schema.',
  ]
    .filter(Boolean)
    .join('\n');

  logger.info(`[CODER] Building project for: "${prompt}"`);

  const interaction = await geminiEngine._createChatInteraction({
    model: geminiEngine.activeModel,
    store: false,
    input: coderPrompt,
    response_format: schema,
  });

  const rawText = (interaction.output_text || '').trim();
  let spec;
  try {
    spec = JSON.parse(rawText);
  } catch {
    // Strip markdown fences if any model wrapped JSON
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    spec = JSON.parse(cleaned);
  }

  const folderSlug = slugify(requestedName || spec.project_name || 'ultron-app');
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  let projectDir = path.join(PROJECTS_DIR, folderSlug);
  if (fs.existsSync(projectDir)) {
    projectDir = path.join(PROJECTS_DIR, `${folderSlug}-${stamp}`);
  }
  fs.mkdirSync(projectDir, { recursive: true });

  const writtenFiles = [];
  for (const f of spec.files || []) {
    const rel = safeRelativePath(f.path);
    const fullPath = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, String(f.content ?? ''), 'utf8');
    writtenFiles.push(rel);
  }

  const entryRel = safeRelativePath(spec.entry_file || writtenFiles[0] || 'index.html');
  const entryFull = path.join(projectDir, entryRel);

  let launchNote = '';
  let runOutput = null;

  // Automatically preview HTML apps in the browser!
  if (entryRel.toLowerCase().endsWith('.html') && fs.existsSync(entryFull)) {
    await openInDefaultApp(entryFull);
    launchNote = 'opened it in your browser';
  }

  // Optionally execute runnable Node.js / PowerShell scripts
  if (shouldRun && fs.existsSync(entryFull)) {
    if (entryRel.toLowerCase().endsWith('.js') || entryRel.toLowerCase().endsWith('.mjs')) {
      runOutput = await runNodeScript(entryFull);
    } else if (entryRel.toLowerCase().endsWith('.ps1')) {
      runOutput = await runPowerShellScript(entryFull);
    }
  }

  // Open in VS Code for non-HTML code (or whenever editor is requested)
  if (openEditor && !entryRel.toLowerCase().endsWith('.html')) {
    const editorUsed = await openInVsCode(projectDir, fs.existsSync(entryFull) ? entryFull : null);
    launchNote = editorUsed === 'vscode' ? 'opened it in VS Code' : 'opened the file for you';
  }

  logger.info(`[CODER] Created ${writtenFiles.length} file(s) in ${projectDir}`);

  return {
    ok: true,
    projectDir,
    entryFile: entryFull,
    files: writtenFiles,
    summary: spec.summary || `Created ${folderSlug}`,
    launchNote,
    runOutput,
  };
}
