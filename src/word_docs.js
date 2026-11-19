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

export const DOCUMENTS_DIR = path.join(os.homedir(), 'UltronDocuments');

// Ensure storage directory exists
try {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
} catch {
  // ignore
}

/**
 * Resolve and normalize user-provided Word document paths
 */
export function resolveWordDocPath(inputPath, defaultFilename = 'Document.docx') {
  const home = os.homedir();
  let target = String(inputPath || '').trim();

  if (!target) {
    return path.join(DOCUMENTS_DIR, defaultFilename);
  }

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

  if (target.startsWith('~/') || target.startsWith('~\\')) {
    target = path.join(home, target.slice(2));
  } else if (!path.isAbsolute(target)) {
    // If it's just a filename (e.g., "Report" or "report.docx"), put it in ~/UltronDocuments/
    target = path.join(DOCUMENTS_DIR, target);
  }

  // Ensure .docx extension
  if (!target.toLowerCase().endsWith('.docx')) {
    target += '.docx';
  }

  return path.resolve(target);
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
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

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
  fs.writeFileSync(targetPath, buffer);

  let opened = false;
  if (openAfter) {
    opened = await openInWord(targetPath);
  }

  const stats = fs.statSync(targetPath);
  logger.info(`Created Word document: ${targetPath} (${stats.size} bytes)`);

  return {
    ok: true,
    path: targetPath,
    filename: path.basename(targetPath),
    sizeBytes: stats.size,
    openedInWord: opened,
    sectionCount: allSections.length,
    message: `Created Word document "${path.basename(targetPath)}" in ${path.dirname(targetPath)}${opened ? ' and opened it in Microsoft Word.' : '.'}`,
  };
}

/**
 * Read and extract text, structure, and metadata from an existing Word (.docx) document
 */
export async function readWordDocument(filePath) {
  const targetPath = resolveWordDocPath(filePath);

  if (!fs.existsSync(targetPath)) {
    return {
      ok: false,
      error: `File not found: ${targetPath}`,
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

  const targetPath = resolveWordDocPath(filePath);
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
    title: path.basename(targetPath, '.docx').replace(/[_-]+/g, ' '),
    subtitle: `Updated on ${new Date().toLocaleDateString()}`,
    outputPath: savePath,
    sections: existingSections,
    openAfter,
  });

  return {
    ok: true,
    path: savePath,
    filename: path.basename(savePath),
    appendedHeading: newSection.heading,
    message: `Appended new content to "${path.basename(savePath)}" and refreshed document in Word.`,
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
 * List recent Word documents in UltronDocuments folder
 */
export function listWordDocuments(folderPath) {
  const targetDir = folderPath ? resolveWordDocPath(folderPath) : DOCUMENTS_DIR;
  if (!fs.existsSync(targetDir)) return [];

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.docx'))
    .map((e) => {
      const full = path.join(targetDir, e.name);
      const stat = fs.statSync(full);
      return {
        name: e.name,
        path: full,
        sizeKb: Math.round(stat.size / 1024),
        modified: stat.mtime.toLocaleString(),
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, 20);
}
