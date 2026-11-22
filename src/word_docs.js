import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import mammoth from 'mammoth';
import { logger } from './logger.js';

export const DOCUMENTS_DIR = (() => {
  const primary = path.join(os.homedir(), 'UltronDocuments');
  try {
    fs.mkdirSync(primary, { recursive: true });
    return primary;
  } catch {
    const fallback = path.join(os.homedir(), 'Documents', 'UltronDocuments');
    try {
      fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    } catch {
      const localDir = path.join(process.cwd(), 'UltronDocuments');
      try {
        fs.mkdirSync(localDir, { recursive: true });
        return localDir;
      } catch {
        return primary;
      }
    }
  }
})();

/**
 * Clean spoken or messy document name queries
 */
export function cleanDocQuery(raw) {
  let q = String(raw || '').trim();
  // Strip quotes and apostrophes
  q = q.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').trim();
  // Strip leading speech phrasing (e.g. "my word document", "the document", "file")
  q = q.replace(/^(?:(?:the|my|our|a|an)\s+)*(?:word\s+)?(?:document|doc|file)\s+/i, '').trim();
  q = q.replace(/^(?:the|my|our|a|an)\s+/i, '').trim();
  // Strip trailing extension or trailing doc keywords
  q = q.replace(/(?:\.docx|\.doc)$/i, '').trim();
  q = q.replace(/\s+(?:document|doc|file)$/i, '').trim();
  return q;
}

/**
 * Get all candidate directories where Word documents may reside
 */
export function getSearchDirectories() {
  const home = os.homedir();
  const dirs = [
    DOCUMENTS_DIR,
    path.join(home, 'Documents'),
    path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    process.cwd(),
  ];
  const unique = [];
  for (const d of dirs) {
    if (!d) continue;
    try {
      if (fs.existsSync(d) && !unique.includes(d)) {
        unique.push(d);
      }
    } catch {
      // ignore
    }
  }
  return unique;
}

/**
 * Intelligent fuzzy document resolver: finds existing Word document (.docx)
 * by spoken, partial, fuzzy, or exact name across system document directories.
 */
export function findExistingWordDocument(inputQuery) {
  if (!inputQuery) return null;
  const raw = String(inputQuery).trim();
  if (!raw) return null;

  // 1. Direct absolute or home-relative path check
  const home = os.homedir();
  let expanded = raw;
  if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    expanded = path.join(home, expanded.slice(2));
  }
  if (path.isAbsolute(expanded)) {
    try {
      if (fs.existsSync(expanded) && fs.statSync(expanded).isFile()) {
        return {
          path: path.resolve(expanded),
          filename: path.basename(expanded),
          baseName: path.basename(expanded, path.extname(expanded)),
          score: 100,
        };
      }
      const withDocx = expanded.toLowerCase().endsWith('.docx') ? expanded : `${expanded}.docx`;
      if (fs.existsSync(withDocx) && fs.statSync(withDocx).isFile()) {
        return {
          path: path.resolve(withDocx),
          filename: path.basename(withDocx),
          baseName: path.basename(withDocx, path.extname(withDocx)),
          score: 100,
        };
      }
    } catch {
      // ignore
    }
  }

  const clean = cleanDocQuery(raw);
  if (!clean) return null;

  const cleanLower = clean.toLowerCase();
  const cleanSlug = cleanLower.replace(/[^a-z0-9]/g, '');
  const cleanTokens = cleanLower.split(/[\s_\-]+/).filter(Boolean);

  const searchDirs = getSearchDirectories();
  const candidates = [];

  for (const dir of searchDirs) {
    let files = [];
    try {
      files = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const f of files) {
      if (!f.isFile()) continue;
      const fName = f.name;
      // Skip temporary lock files or hidden files
      if (fName.startsWith('~$') || fName.startsWith('._') || fName.startsWith('.')) continue;
      if (!fName.toLowerCase().endsWith('.docx') && !fName.toLowerCase().endsWith('.doc')) continue;

      const fullPath = path.join(dir, fName);
      const baseName = path.basename(fName, path.extname(fName));
      const baseLower = baseName.toLowerCase();
      const baseSlug = baseLower.replace(/[^a-z0-9]/g, '');
      const baseTokens = baseLower.split(/[\s_\-]+/).filter(Boolean);

      let score = 0;

      // 1. Exact base match (case-insensitive)
      if (baseLower === cleanLower) {
        score = 100;
      }
      // 2. Exact slug match (e.g. "project-proposal" matches "Project Proposal")
      else if (baseSlug === cleanSlug && cleanSlug.length > 2) {
        score = 95;
      }
      // 3. Substring match
      else if (baseLower.includes(cleanLower) && cleanLower.length >= 3) {
        score = 80 + Math.min(15, Math.round((cleanLower.length / baseLower.length) * 15));
      } else if (cleanLower.includes(baseLower) && baseLower.length >= 3) {
        score = 75 + Math.min(15, Math.round((baseLower.length / cleanLower.length) * 15));
      }
      // 4. Slug substring match
      else if (baseSlug.includes(cleanSlug) && cleanSlug.length >= 3) {
        score = 70 + Math.min(15, Math.round((cleanSlug.length / baseSlug.length) * 15));
      } else if (cleanSlug.includes(baseSlug) && baseSlug.length >= 3) {
        score = 65 + Math.min(15, Math.round((baseSlug.length / cleanSlug.length) * 15));
      }
      // 5. Word token overlap
      else if (cleanTokens.length > 0 && baseTokens.length > 0) {
        let matchCount = 0;
        for (const ct of cleanTokens) {
          if (baseTokens.some((bt) => bt === ct || (ct.length > 3 && bt.includes(ct)))) {
            matchCount++;
          }
        }
        if (matchCount > 0) {
          const ratio = matchCount / Math.max(cleanTokens.length, baseTokens.length);
          score = Math.round(55 + ratio * 35);
        }
      }

      // If both contain distinct numbers/timestamps, avoid false matches
      const cleanNums = cleanLower.match(/\d+/g) || [];
      const baseNums = baseLower.match(/\d+/g) || [];
      if (cleanNums.length > 0 && baseNums.length > 0) {
        const numOverlap = cleanNums.some((n) => baseNums.includes(n));
        if (!numOverlap) {
          score -= 30; // Different timestamps or document numbers
        }
      }

      if (score >= 65) {
        // Priority bonus for default UltronDocuments directory
        if (dir === DOCUMENTS_DIR) {
          score += 10;
        }
        try {
          const stat = fs.statSync(fullPath);
          candidates.push({
            path: fullPath,
            filename: fName,
            baseName,
            dir,
            score,
            mtime: stat.mtimeMs,
          });
        } catch {
          // ignore
        }
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by score descending, then by mtime descending (most recent first)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.mtime - a.mtime;
  });

  return candidates[0];
}

/**
 * Safely release Word lock on a document via PowerShell COM if Word currently has it open
 */
export function closeWordDocIfOpen(targetPath) {
  return new Promise((resolve) => {
    const escaped = targetPath.replace(/'/g, "''");
    const script = `
$full = [System.IO.Path]::GetFullPath('${escaped}')
$fname = [System.IO.Path]::GetFileName($full)
try {
  $word = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
  if ($word) {
    foreach ($doc in $word.Documents) {
      if ($doc.FullName -eq $full -or $doc.Name -eq $fname) {
        $doc.Close([Microsoft.Office.Interop.Word.WdSaveOptions]::wdDoNotSaveChanges)
      }
    }
  }
} catch {}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { windowsHide: true, timeout: 3500 },
      () => resolve(true),
    );
  });
}

/**
 * Safely write Word document buffer to disk, handling file locks (e.g. Word open)
 */
export async function safeWriteWordDoc(targetPath, buffer) {
  try {
    fs.writeFileSync(targetPath, buffer);
    return { ok: true, path: targetPath, originalSaved: true, wasLocked: false };
  } catch (err) {
    if (err.code !== 'EBUSY' && err.code !== 'EPERM') {
      throw err;
    }
    logger.warn(`Document is locked by Microsoft Word: ${targetPath}. Attempting graceful release...`);
  }

  // Attempt to close open document handle in Word
  try {
    await closeWordDocIfOpen(targetPath);
    await new Promise((r) => setTimeout(r, 250));
    fs.writeFileSync(targetPath, buffer);
    logger.info(`Successfully wrote to document after releasing Word handle: ${targetPath}`);
    return { ok: true, path: targetPath, originalSaved: true, wasLocked: true };
  } catch (releaseErr) {
    logger.warn(`Could not overwrite locked file directly: ${releaseErr.message}. Writing updated revision...`);
  }

  // Fallback: write to updated revision filename
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath) || '.docx';
  const base = path.basename(targetPath, ext);
  const updatedPath = path.join(dir, `${base}_Updated${ext}`);

  try {
    fs.writeFileSync(updatedPath, buffer);
    logger.info(`Saved updated copy to: ${updatedPath}`);
    return { ok: true, path: updatedPath, originalSaved: false, wasLocked: true };
  } catch (fallbackErr) {
    const tsPath = path.join(dir, `${base}_${Date.now()}${ext}`);
    fs.writeFileSync(tsPath, buffer);
    return { ok: true, path: tsPath, originalSaved: false, wasLocked: true };
  }
}

/**
 * Resolve and normalize user-provided Word document paths
 */
export function resolveWordDocPath(inputPath, defaultFilename = 'Document.docx') {
  const target = String(inputPath || '').trim();

  if (!target) {
    return path.join(DOCUMENTS_DIR, defaultFilename);
  }

  const home = os.homedir();
  const shortcuts = {
    documents: path.join(home, 'Documents'),
    desktop: path.join(home, 'Desktop'),
    downloads: path.join(home, 'Downloads'),
    ultron: DOCUMENTS_DIR,
    ultrondocuments: DOCUMENTS_DIR,
    '~': home,
  };

  const lower = target.toLowerCase();
  if (shortcuts[lower]) {
    return path.join(shortcuts[lower], defaultFilename);
  }

  // If it's an explicit absolute path, use it directly without hijacking
  let expanded = target;
  if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    expanded = path.join(home, expanded.slice(2));
  }
  if (path.isAbsolute(expanded)) {
    if (!expanded.toLowerCase().endsWith('.docx') && !expanded.toLowerCase().endsWith('.doc')) {
      expanded += '.docx';
    }
    return path.resolve(expanded);
  }

  // If an existing file matches this spoken query, return that exact path!
  const existing = findExistingWordDocument(target);
  if (existing && existing.score >= 70) {
    return existing.path;
  }

  let finalPath = path.join(DOCUMENTS_DIR, target);
  // Ensure .docx extension
  if (!finalPath.toLowerCase().endsWith('.docx') && !finalPath.toLowerCase().endsWith('.doc')) {
    finalPath += '.docx';
  }

  return path.resolve(finalPath);
}

/**
 * Open any document in Microsoft Word or default system handler
 */
export function openInWord(targetPath) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -FilePath '${targetPath.replace(/'/g, "''")}'`],
      { windowsHide: true, timeout: 8000 },
      (err) => {
        if (err) {
          logger.warn(`Failed to launch Word for ${targetPath}: ${err.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      },
    );
  });
}

/**
 * Parse Markdown/plain text into structured sections and elements
 */
export function parseContentToSections(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let currentSection = { heading: '', level: 1, paragraphs: [], bulletPoints: [], table: null };

  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];

  function commitTable() {
    if (tableHeaders.length > 0 && tableRows.length > 0) {
      currentSection.table = { headers: tableHeaders, rows: tableRows };
    }
    inTable = false;
    tableHeaders = [];
    tableRows = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (inTable) commitTable();
      continue;
    }

    // Markdown Table row: | Col 1 | Col 2 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      // Skip separator row (|---|---|)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    }
    if (inTable) {
      commitTable();
    }

    // Heading: # Heading or ## Subheading
    const hMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (hMatch) {
      if (currentSection.heading || currentSection.paragraphs.length > 0 || currentSection.bulletPoints.length > 0 || currentSection.table) {
        sections.push(currentSection);
      }
      currentSection = {
        heading: hMatch[2].trim(),
        level: hMatch[1].length,
        paragraphs: [],
        bulletPoints: [],
        table: null,
      };
      continue;
    }

    // Bullet point: - Item or * Item or • Item
    const bMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bMatch) {
      currentSection.bulletPoints.push(bMatch[1].trim());
      continue;
    }

    // Numbered point: 1. Item
    const nMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (nMatch) {
      currentSection.bulletPoints.push(nMatch[1].trim());
      continue;
    }

    // Normal paragraph
    currentSection.paragraphs.push(trimmed);
  }

  if (inTable) {
    commitTable();
  }

  if (currentSection.heading || currentSection.paragraphs.length > 0 || currentSection.bulletPoints.length > 0 || currentSection.table) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Build docx elements from structured sections
 */
function buildSectionElements(sections) {
  const children = [];

  for (const sec of sections) {
    // 1. Heading
    if (sec.heading) {
      const level = sec.level === 3 ? HeadingLevel.HEADING_3 : sec.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1;
      const color = sec.level === 1 ? '1F4E79' : sec.level === 2 ? '2E74B5' : '333333';
      const size = sec.level === 1 ? 28 : sec.level === 2 ? 24 : 22; // half-points

      children.push(
        new Paragraph({
          text: sec.heading,
          heading: level,
          spacing: { before: 240, after: 120 },
        }),
      );
    }

    // 2. Paragraphs
    if (Array.isArray(sec.paragraphs)) {
      for (const p of sec.paragraphs) {
        if (!p) continue;
        children.push(
          new Paragraph({
            spacing: { after: 140, line: 276 },
            children: [
              new TextRun({
                text: String(p),
                size: 22, // 11pt
                font: 'Calibri',
              }),
            ],
          }),
        );
      }
    }

    // 3. Bullet Points
    if (Array.isArray(sec.bulletPoints)) {
      for (const bp of sec.bulletPoints) {
        if (!bp) continue;
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80, line: 240 },
            children: [
              new TextRun({
                text: String(bp),
                size: 22,
                font: 'Calibri',
              }),
            ],
          }),
        );
      }
    }

    // 4. Table
    if (sec.table && Array.isArray(sec.table.headers) && Array.isArray(sec.table.rows)) {
      const rows = [];

      // Header row
      rows.push(
        new TableRow({
          children: sec.table.headers.map(
            (h) =>
              new TableCell({
                shading: { fill: '1F4E79' },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: String(h),
                        bold: true,
                        color: 'FFFFFF',
                        size: 20,
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
      );

      // Data rows
      sec.table.rows.forEach((rowCells, idx) => {
        const bg = idx % 2 === 0 ? 'F8F9FA' : 'FFFFFF';
        rows.push(
          new TableRow({
            children: (Array.isArray(rowCells) ? rowCells : []).map(
              (cellText) =>
                new TableCell({
                  shading: { fill: bg },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: String(cellText),
                          size: 20,
                          font: 'Calibri',
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
        );
      });

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        }),
      );

      // Small spacing after table
      children.push(new Paragraph({ spacing: { after: 140 } }));
    }
  }

  return children;
}

/**
 * Create a new Microsoft Word (.docx) document with executive styling
 */
export async function createWordDocument(options = {}) {
  const {
    title = 'Document',
    subtitle = '',
    author = 'Syed / Ultron Assistant',
    date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    filename = 'Document.docx',
    outputPath,
    sections = [],
    rawContent = '',
    openAfter = true,
  } = options;

  const targetPath = resolveWordDocPath(outputPath || filename, filename);
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  } catch {
    // ignore
  }

  const children = [];

  // Title Block
  if (title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 100, after: 80 },
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 36, // 18pt
            color: '1F4E79',
            font: 'Calibri',
          }),
        ],
      }),
    );
  }

  // Subtitle / Metadata
  const metaBits = [];
  if (subtitle) metaBits.push(subtitle);
  if (author) metaBits.push(`Prepared by: ${author}`);
  if (date) metaBits.push(`Date: ${date}`);

  if (metaBits.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 260 },
        children: [
          new TextRun({
            text: metaBits.join('  |  '),
            italics: true,
            size: 20,
            color: '595959',
            font: 'Calibri',
          }),
        ],
      }),
    );
  }

  // Parse raw content if passed
  let allSections = [...sections];
  if (rawContent && rawContent.trim()) {
    allSections = allSections.concat(parseContentToSections(rawContent));
  }

  // If no sections provided, add placeholder paragraph
  if (allSections.length === 0) {
    allSections.push({
      heading: 'Overview',
      level: 1,
      paragraphs: ['Document generated by Ultron personal assistant.'],
      bulletPoints: [],
    });
  }

  const sectionElements = buildSectionElements(allSections);
  children.push(...sectionElements);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch (1440 twips)
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const writeRes = await safeWriteWordDoc(targetPath, buffer);
  const finalPath = writeRes.path || targetPath;

  let opened = false;
  if (openAfter) {
    opened = await openInWord(finalPath);
  }

  const stats = fs.statSync(finalPath);
  logger.info(`Created Word document: ${finalPath} (${stats.size} bytes)`);

  return {
    ok: true,
    path: finalPath,
    filename: path.basename(finalPath),
    sizeBytes: stats.size,
    openedInWord: opened,
    sectionCount: allSections.length,
    message: `Created Word document "${path.basename(finalPath)}" in ${path.dirname(finalPath)}${opened ? ' and opened it in Microsoft Word.' : '.'}`,
  };
}

/**
 * Read and extract text, structure, and metadata from an existing Word (.docx) document
 */
export async function readWordDocument(filePath) {
  const resolved = findExistingWordDocument(filePath);
  const targetPath = resolved ? resolved.path : resolveWordDocPath(filePath);

  if (!fs.existsSync(targetPath)) {
    const available = listWordDocuments().map((d) => d.name).slice(0, 5);
    const suggestion = available.length > 0 ? ` Available documents: ${available.join(', ')}` : '';
    return {
      ok: false,
      error: `File not found: ${targetPath}.${suggestion}`,
    };
  }

  const buffer = fs.readFileSync(targetPath);
  const rawTextResult = await mammoth.extractRawText({ buffer });
  const text = (rawTextResult.value || '').trim();

  let htmlPreview = '';
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    htmlPreview = htmlResult.value || '';
  } catch {
    // ignore
  }

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const stats = fs.statSync(targetPath);

  return {
    ok: true,
    path: targetPath,
    filename: path.basename(targetPath),
    wordCount: words,
    characterCount: text.length,
    lastModified: stats.mtime.toLocaleString(),
    sizeBytes: stats.size,
    content: text.slice(0, 8000),
    truncated: text.length > 8000,
    preview: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
  };
}

/**
 * Append new content or sections to an existing Word document
 */
export async function appendToWordDocument(options = {}) {
  const {
    filePath,
    newHeading = '',
    content = '',
    bulletPoints = [],
    table = null,
    outputPath,
    openAfter = true,
  } = options;

  const resolved = findExistingWordDocument(filePath);
  const targetPath = resolved ? resolved.path : resolveWordDocPath(filePath);
  if (!fs.existsSync(targetPath)) {
    return { ok: false, error: `Word document not found: ${targetPath}` };
  }

  // Read existing text from document
  const existing = await readWordDocument(targetPath);
  if (!existing.ok) return existing;

  // Build combined content
  const existingSections = parseContentToSections(existing.content);
  const newSection = {
    heading: newHeading || 'Appended Section',
    level: 1,
    paragraphs: content ? [content] : [],
    bulletPoints: Array.isArray(bulletPoints) ? bulletPoints : [],
    table: table || null,
  };
  existingSections.push(newSection);

  const savePath = outputPath ? resolveWordDocPath(outputPath) : targetPath;

  const result = await createWordDocument({
    title: path.basename(targetPath, path.extname(targetPath)).replace(/[_-]+/g, ' '),
    subtitle: `Updated on ${new Date().toLocaleDateString()}`,
    outputPath: savePath,
    sections: existingSections,
    openAfter,
  });

  return {
    ok: true,
    path: result.path || savePath,
    filename: path.basename(result.path || savePath),
    appendedHeading: newSection.heading,
    message: `Appended new content to "${path.basename(result.path || savePath)}" and refreshed document in Word.`,
  };
}

/**
 * Autonomous AI Word Document Editor:
 * Locates an existing document by name, reads its contents,
 * intelligently incorporates the user's edits/additions with Gemini,
 * safely writes the updated document (handling Word file-locks),
 * and launches the updated document in Microsoft Word!
 */
export async function editWordDocument(geminiEngine, options = {}) {
  const docName = String(
    options.documentName ||
      options.document_name ||
      options.filePath ||
      options.file_path ||
      options.filename ||
      options.title ||
      '',
  ).trim();
  const instructions = String(
    options.instructions || options.edit_instructions || options.prompt || '',
  ).trim();
  const directContent = String(options.content || '').trim();
  const directHeading = String(options.heading || '').trim();
  const openDoc = options.openAfter !== false && options.open_document !== false;

  logger.info(`[WORD_DOCS] Editing Word document "${docName}": "${instructions || directContent}"`);

  // 1. Locate the existing document
  const found = findExistingWordDocument(docName);
  let targetPath = null;
  let existingContent = '';
  let existingTitle = '';

  if (found) {
    targetPath = found.path;
    existingTitle = found.baseName.replace(/[_-]+/g, ' ');
    const readRes = await readWordDocument(targetPath);
    if (readRes.ok) {
      existingContent = readRes.content || '';
    }
  } else {
    // If file doesn't exist, check if user provided a path
    targetPath = resolveWordDocPath(docName || 'Document.docx');
    existingTitle = path.basename(targetPath, path.extname(targetPath)).replace(/[_-]+/g, ' ');
  }

  // 2. If Gemini is available and we have an edit prompt / instruction:
  if (geminiEngine && (instructions || (directContent && !directHeading))) {
    const schema = {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Document title (keep existing or update if requested).',
        },
        subtitle: {
          type: 'string',
          description: 'Subtitle, revision date, or version info.',
        },
        sections: {
          type: 'array',
          description:
            'Ordered list of all document sections, with all previous sections preserved and the requested additions or edits seamlessly integrated.',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'Section title' },
              level: { type: 'integer', description: 'Heading level (1 or 2)' },
              paragraphs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Body paragraphs for this section',
              },
              bulletPoints: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet points if applicable',
              },
              table: {
                type: 'object',
                description: 'Optional structured table',
                properties: {
                  headers: { type: 'array', items: { type: 'string' } },
                  rows: {
                    type: 'array',
                    items: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
            required: ['heading', 'paragraphs'],
          },
        },
        change_summary: {
          type: 'string',
          description: '1-sentence spoken summary of what was edited, added, or updated.',
        },
      },
      required: ['title', 'sections', 'change_summary'],
    };

    const systemPrompt = [
      'You are Friday, Executive Document Architect & Technical Writer.',
      'Your task is to edit, update, or append to an existing Microsoft Word document based on the user instructions.',
      'CRITICAL: PRESERVE all existing document content, structure, and facts unless the user specifically asked to remove or replace them.',
      'Seamlessly weave the requested new content, section, or correction into the document with professional corporate formatting.',
      'Never generate placeholder brackets like "[insert here]". Write complete, thorough, polished executive text.',
    ].join(' ');

    const promptText = [
      `Document Name: ${path.basename(targetPath)}`,
      existingContent
        ? `Existing Document Content:\n"""\n${existingContent.slice(0, 10000)}\n"""`
        : '(This is a new document)',
      `User Edit Instructions:\n"${instructions || directContent}"`,
    ].join('\n\n');

    try {
      const rawResult = await geminiEngine.generateStructuredJson(promptText, schema, systemPrompt);
      let docData;
      try {
        docData = JSON.parse(rawResult);
      } catch {
        const cleaned = rawResult.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        docData = JSON.parse(cleaned);
      }

      const saveRes = await createWordDocument({
        title: docData.title || existingTitle,
        subtitle: docData.subtitle || `Updated ${new Date().toLocaleDateString()}`,
        outputPath: targetPath,
        sections: docData.sections || [],
        openAfter: openDoc,
      });

      return {
        ok: true,
        path: saveRes.path,
        filename: path.basename(saveRes.path),
        title: docData.title,
        sectionCount: (docData.sections || []).length,
        summary:
          docData.change_summary ||
          `Friday updated "${path.basename(saveRes.path)}" with your requested edits and opened it in Word, sir.`,
        openedInWord: saveRes.openedInWord,
      };
    } catch (err) {
      logger.error(`AI Word editing failed: ${err.message}. Falling back to direct section append.`);
    }
  }

  // Fallback: Direct section append / edit without AI
  const existingSections = existingContent ? parseContentToSections(existingContent) : [];
  existingSections.push({
    heading: directHeading || 'Updated Section',
    level: 1,
    paragraphs: [instructions || directContent || 'Updated content.'],
    bulletPoints: [],
    table: null,
  });

  const saveRes = await createWordDocument({
    title: existingTitle || 'Document',
    subtitle: `Updated ${new Date().toLocaleDateString()}`,
    outputPath: targetPath,
    sections: existingSections,
    openAfter: openDoc,
  });

  return {
    ok: true,
    path: saveRes.path,
    filename: path.basename(saveRes.path),
    title: existingTitle,
    sectionCount: existingSections.length,
    summary: `Friday updated "${path.basename(saveRes.path)}" and opened it in Word, sir.`,
    openedInWord: saveRes.openedInWord,
  };
}

/**
 * Autonomous AI Word Document Builder:
 * Takes any natural language voice prompt, asks Gemini to structure it professionally,
 * builds a complete formatted .docx document, and launches it in Microsoft Word!
 */
export async function generateAiWordDocument(geminiEngine, args = {}) {
  const prompt = String(args.prompt || '').trim();
  const docType = String(args.document_type || 'auto').trim();
  const requestedFilename = String(args.filename || '').trim();
  const openDoc = args.open_document !== false;

  if (!prompt) {
    return { ok: false, error: 'A document prompt or topic is required.' };
  }

  const schema = {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Clean sanitized filename ending in .docx (e.g. Project_Proposal.docx, Leave_Application.docx)',
      },
      title: {
        type: 'string',
        description: 'Professional document title (e.g. Project Proposal: Automated Logistics System)',
      },
      subtitle: {
        type: 'string',
        description: 'Short subtitle or category (e.g. Confidential Business Plan | Version 1.0)',
      },
      sections: {
        type: 'array',
        description: 'Ordered list of document sections with headings, paragraphs, bullet points, and optional tables',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string', description: 'Section title' },
            level: { type: 'integer', description: 'Heading level: 1 for main, 2 for sub' },
            paragraphs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Body text paragraphs for this section',
            },
            bulletPoints: {
              type: 'array',
              items: { type: 'string' },
              description: 'Key bullet points or action items',
            },
            table: {
              type: 'object',
              description: 'Optional structured data table for this section (e.g. timelines, pricing, milestones)',
              properties: {
                headers: { type: 'array', items: { type: 'string' } },
                rows: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
          required: ['heading', 'paragraphs'],
        },
      },
    },
    required: ['filename', 'title', 'sections'],
  };

  const systemPrompt = [
    'You are Ultron, an expert executive document writer and business architect.',
    'Your task is to generate complete, rich, highly professional Microsoft Word documents (.docx) based on the user prompt.',
    'Write thorough, detailed, polished corporate/academic/technical content with real information, numbers, sections, bullet points, and tables where applicable.',
    'NEVER generate vague placeholders like "[insert details here]". Write the actual comprehensive content.',
    `Target document type: ${docType}.`,
  ].join(' ');

  try {
    const rawResult = await geminiEngine.generateStructuredJson(
      `Generate a complete, professional, comprehensive Word document for this request:\n\n"${prompt}"`,
      schema,
      systemPrompt,
    );

    const docData = JSON.parse(rawResult);
    const chosenFilename = requestedFilename || docData.filename || `Document_${Date.now()}.docx`;

    const created = await createWordDocument({
      title: docData.title || 'Executive Document',
      subtitle: docData.subtitle || '',
      author: 'Syed / Ultron Assistant',
      filename: chosenFilename,
      sections: docData.sections || [],
      openAfter: openDoc,
    });

    return {
      ok: true,
      path: created.path,
      filename: created.filename,
      title: docData.title,
      sectionCount: (docData.sections || []).length,
      openedInWord: created.openedInWord,
      summary: `Created Word document "${docData.title}" with ${(docData.sections || []).length} sections and opened it in Microsoft Word.`,
    };
  } catch (err) {
    logger.error(`AI Word Document generation failed: ${err.message}`);
    // Fallback: create basic document with the raw prompt
    const fallbackFilename = requestedFilename || `Document_${Date.now()}.docx`;
    const fallback = await createWordDocument({
      title: 'Word Document',
      filename: fallbackFilename,
      rawContent: prompt,
      openAfter: openDoc,
    });
    return {
      ok: true,
      path: fallback.path,
      filename: fallback.filename,
      title: 'Word Document',
      summary: `Created Word document "${fallback.filename}" and opened it in Microsoft Word.`,
    };
  }
}

/**
 * List recent Word documents in UltronDocuments and Documents folders
 */
export function listWordDocuments(folderPath) {
  const searchDirs = folderPath
    ? [resolveWordDocPath(folderPath)]
    : [DOCUMENTS_DIR, path.join(os.homedir(), 'Documents')];
  const results = [];
  const seenPaths = new Set();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const lower = e.name.toLowerCase();
      if (!lower.endsWith('.docx') && !lower.endsWith('.doc')) continue;
      if (e.name.startsWith('~$') || e.name.startsWith('.')) continue;

      const full = path.join(dir, e.name);
      if (seenPaths.has(full)) continue;
      seenPaths.add(full);

      try {
        const stat = fs.statSync(full);
        results.push({
          name: e.name,
          path: full,
          folder: path.basename(dir),
          sizeKb: Math.round(stat.size / 1024),
          modified: stat.mtime.toLocaleString(),
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        // ignore
      }
    }
  }

  return results
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 25);
}
