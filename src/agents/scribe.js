import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  appendToWordDocument,
  createWordDocument,
  DOCUMENTS_DIR,
  editWordDocument,
  findExistingWordDocument,
  generateAiWordDocument,
  openInWord,
  readWordDocument,
  resolveWordDocPath,
} from '../word_docs.js';
import { logger } from '../logger.js';

function slugifyDoc(name) {
  return (
    String(name || 'document')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 45) || `doc-${Date.now()}`
  );
}

function openFileDefault(filePath) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -FilePath '${filePath.replace(/'/g, "''")}'`],
      { windowsHide: true, timeout: 8000 },
      (err) => resolve(!err),
    );
  });
}

/**
 * Agent Friday: Executive Document Architect & Technical Writer
 * Specializes in Microsoft Word (.docx) & Executive PDF (.pdf) documents
 */
export class ScribeAgent {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.id = 'friday';
    this.name = 'Friday';
    this.alias = 'Writer';
  }

  /**
   * Create an executive PDF document (.pdf) with clean typography, headers, and tables
   */
  async createPdfDocument(options = {}) {
    const {
      title = 'Executive Report',
      subtitle = '',
      author = 'Friday (Ultron Team)',
      date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      filename,
      sections = [],
      openAfter = true,
    } = options;

    const baseName = slugifyDoc(filename || title);
    const targetPath = path.join(DOCUMENTS_DIR, `${baseName}.pdf`);
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const obliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 595.28; // A4
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 50;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let currentY = PAGE_HEIGHT - 40;

    function checkPageOverflow(neededHeight) {
      if (currentY - neededHeight < 60) {
        currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        currentY = PAGE_HEIGHT - 60;
        return true;
      }
      return false;
    }

    function drawWrapped(text, font, size, color, indent = 0) {
      const words = String(text || '').split(/\s+/).filter(Boolean);
      let line = '';
      const availableWidth = CONTENT_WIDTH - indent;

      for (const w of words) {
        const testLine = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(testLine, size) > availableWidth) {
          checkPageOverflow(size + 6);
          currentPage.drawText(line, {
            x: MARGIN + indent,
            y: currentY,
            size,
            font,
            color,
          });
          currentY -= size + 5;
          line = w;
        } else {
          line = testLine;
        }
      }

      if (line) {
        checkPageOverflow(size + 6);
        currentPage.drawText(line, {
          x: MARGIN + indent,
          y: currentY,
          size,
          font,
          color,
        });
        currentY -= size + 5;
      }
    }

    // 1. Header Banner
    currentPage.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 90,
      width: PAGE_WIDTH,
      height: 90,
      color: rgb(0.12, 0.31, 0.47), // #1F4E79
    });

    currentPage.drawText(title.slice(0, 50), {
      x: MARGIN,
      y: PAGE_HEIGHT - 55,
      size: 20,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    currentY = PAGE_HEIGHT - 110;

    // 2. Metadata line
    const metaText = `${subtitle ? `${subtitle}  |  ` : ''}Prepared by: ${author}  |  ${date}`;
    currentPage.drawText(metaText, {
      x: MARGIN,
      y: currentY,
      size: 10,
      font: obliqueFont,
      color: rgb(0.35, 0.35, 0.35),
    });
    currentY -= 25;

    // 3. Render Sections
    for (const sec of sections) {
      checkPageOverflow(40);

      // Section Heading
      if (sec.heading) {
        currentY -= 10;
        currentPage.drawText(sec.heading, {
          x: MARGIN,
          y: currentY,
          size: 14,
          font: boldFont,
          color: rgb(0.12, 0.31, 0.47),
        });
        currentY -= 6;

        // Thin accent line under heading
        currentPage.drawLine({
          start: { x: MARGIN, y: currentY },
          end: { x: MARGIN + 120, y: currentY },
          thickness: 1.5,
          color: rgb(0.18, 0.45, 0.71),
        });
        currentY -= 14;
      }

      // Paragraphs
      if (Array.isArray(sec.paragraphs)) {
        for (const p of sec.paragraphs) {
          drawWrapped(p, regularFont, 10.5, rgb(0.15, 0.15, 0.15), 0);
          currentY -= 6;
        }
      }

      // Bullet points
      if (Array.isArray(sec.bulletPoints)) {
        for (const bp of sec.bulletPoints) {
          checkPageOverflow(18);
          currentPage.drawText('•', {
            x: MARGIN + 6,
            y: currentY,
            size: 12,
            font: boldFont,
            color: rgb(0.18, 0.45, 0.71),
          });
          drawWrapped(bp, regularFont, 10, rgb(0.2, 0.2, 0.2), 20);
          currentY -= 3;
        }
      }

      // Simple Table
      if (sec.table && Array.isArray(sec.table.headers) && Array.isArray(sec.table.rows)) {
        checkPageOverflow(60);
        const colCount = Math.max(1, sec.table.headers.length);
        const colWidth = CONTENT_WIDTH / colCount;
        const rowHeight = 22;

        // Header Background
        currentPage.drawRectangle({
          x: MARGIN,
          y: currentY - rowHeight + 4,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: rgb(0.12, 0.31, 0.47),
        });

        // Header Text
        sec.table.headers.forEach((h, idx) => {
          currentPage.drawText(String(h).slice(0, 24), {
            x: MARGIN + idx * colWidth + 8,
            y: currentY - 12,
            size: 9.5,
            font: boldFont,
            color: rgb(1, 1, 1),
          });
        });
        currentY -= rowHeight;

        // Data Rows
        sec.table.rows.forEach((row, rIdx) => {
          checkPageOverflow(rowHeight + 10);
          const bg = rIdx % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1);
          currentPage.drawRectangle({
            x: MARGIN,
            y: currentY - rowHeight + 4,
            width: CONTENT_WIDTH,
            height: rowHeight,
            color: bg,
          });

          (Array.isArray(row) ? row : []).forEach((cell, cIdx) => {
            currentPage.drawText(String(cell).slice(0, 30), {
              x: MARGIN + cIdx * colWidth + 8,
              y: currentY - 12,
              size: 9,
              font: regularFont,
              color: rgb(0.15, 0.15, 0.15),
            });
          });
          currentY -= rowHeight;
        });
        currentY -= 14;
      }
    }

    // 4. Draw Page Numbers on all pages
    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      page.drawLine({
        start: { x: MARGIN, y: 40 },
        end: { x: PAGE_WIDTH - MARGIN, y: 40 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });

      page.drawText(`Ultron Intelligence  |  Page ${i + 1} of ${pageCount}`, {
        x: MARGIN,
        y: 26,
        size: 8.5,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(targetPath, pdfBytes);
    logger.info(`[SCRIBE] Created PDF document: ${targetPath} (${pdfBytes.length} bytes)`);

    let opened = false;
    if (openAfter) {
      opened = await openFileDefault(targetPath);
    }

    return {
      ok: true,
      agent: this.name,
      format: 'pdf',
      path: targetPath,
      filename: path.basename(targetPath),
      sizeBytes: pdfBytes.length,
      pageCount,
      opened,
      message: `Agent Scribe created PDF report "${path.basename(targetPath)}" (${pageCount} pages)${opened ? ' and opened it.' : '.'}`,
    };
  }

  /**
   * Create an executive Word document (.docx) using the core word engine
   */
  async createWordDocument(options = {}) {
    logger.info(`[SCRIBE] Creating Word document: "${options.title || options.filename}"`);
    const res = await createWordDocument({
      author: 'Agent Scribe (Ultron Team)',
      ...options,
    });
    return {
      agent: this.name,
      format: 'docx',
      ...res,
    };
  }

  /**
   * Edit or update an existing Word document by name or file path
   */
  async editDocument(options = {}) {
    logger.info(
      `[SCRIBE] Friday editing Word document: "${options.documentName || options.filename || options.title || options.filePath || options.file_path}"`,
    );
    return await editWordDocument(this.gemini, options);
  }

  /**
   * Append content or sections to an existing Word document
   */
  async appendDocument(options = {}) {
    logger.info(`[SCRIBE] Friday appending to document: "${options.filePath || options.filename}"`);
    return await appendToWordDocument(options);
  }

  /**
   * Autonomous AI Document Generator:
   * Generates complete Word (.docx) or PDF (.pdf) or BOTH simultaneously from any voice prompt!
   * Automatically routes to editDocument if the prompt asks to edit or update an existing document.
   */
  async generateAiDocument(args = {}) {
    const prompt = String(args.prompt || '').trim();
    const format = String(args.format || 'both').toLowerCase(); // 'docx' | 'pdf' | 'both'
    const requestedTitle = String(args.title || '').trim();
    const action = String(args.action || args.operation || '').toLowerCase();
    const docQuery = args.document_name || args.documentName || args.file_path || args.filename;

    if (!prompt && !docQuery) {
      return { ok: false, error: 'A document prompt or topic is required.' };
    }

    // If an edit/append action is explicitly requested, or if the prompt mentions editing an existing document
    const isEditIntent =
      action === 'edit' ||
      action === 'append' ||
      action === 'update' ||
      /\b(?:edit|update|modify|change|add\s+to|append\s+to)\b/i.test(prompt);

    if (isEditIntent) {
      const existing = findExistingWordDocument(docQuery || prompt);
      if (existing || action === 'edit' || action === 'append' || action === 'update') {
        logger.info(
          `[SCRIBE] Routing to editDocument for "${existing ? existing.filename : docQuery || prompt}"`,
        );
        return await this.editDocument({
          documentName: existing ? existing.filename : docQuery || requestedTitle,
          instructions: args.edit_instructions || prompt,
          ...args,
        });
      }
    }

    logger.info(`[SCRIBE] Generating [${format.toUpperCase()}] document for: "${prompt}"`);

    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Professional document title.' },
        subtitle: { type: 'string', description: 'Category or subtitle.' },
        filename_base: { type: 'string', description: 'Lowercase hyphenated file basename without extension.' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              level: { type: 'integer' },
              paragraphs: { type: 'array', items: { type: 'string' } },
              bulletPoints: { type: 'array', items: { type: 'string' } },
              table: {
                type: 'object',
                properties: {
                  headers: { type: 'array', items: { type: 'string' } },
                  rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                },
              },
            },
            required: ['heading', 'paragraphs'],
          },
        },
      },
      required: ['title', 'filename_base', 'sections'],
    };

    const systemPrompt =
      'You are Friday (also known as Writer), Chief Document Architect serving with Commander Ultron. Write thorough, professional, executive documents with clear sections, real information, bullet points, and data tables.';

    try {
      const rawResult = await this.gemini.generateStructuredJson(
        `Draft a comprehensive, polished document for:\n\n"${prompt}"`,
        schema,
        systemPrompt,
      );

      let docSpec;
      try {
        docSpec = JSON.parse(rawResult);
      } catch {
        const cleaned = rawResult.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        docSpec = JSON.parse(cleaned);
      }

      const finalTitle = requestedTitle || docSpec.title || 'Executive Document';
      const fileBase = slugifyDoc(docSpec.filename_base || finalTitle);

      const outputs = [];

      // 1. Generate Word document if requested
      if (format === 'docx' || format === 'both' || format === 'word') {
        const wordRes = await this.createWordDocument({
          title: finalTitle,
          subtitle: docSpec.subtitle,
          filename: `${fileBase}.docx`,
          sections: docSpec.sections || [],
          openAfter: format === 'docx' || format === 'word',
        });
        outputs.push({ format: 'docx', path: wordRes.path, filename: wordRes.filename });
      }

      // 2. Generate PDF document if requested
      if (format === 'pdf' || format === 'both') {
        const pdfRes = await this.createPdfDocument({
          title: finalTitle,
          subtitle: docSpec.subtitle,
          filename: fileBase,
          sections: docSpec.sections || [],
          openAfter: true, // open PDF viewer
        });
        outputs.push({ format: 'pdf', path: pdfRes.path, filename: pdfRes.filename });
      }

      return {
        ok: true,
        agent: this.name,
        specialty: 'Document Architecture (Word & PDF)',
        title: finalTitle,
        sectionCount: (docSpec.sections || []).length,
        files: outputs,
        summary: `Friday created your ${format.toUpperCase()} documentation "${finalTitle}" with ${(docSpec.sections || []).length} sections and opened it, sir.`,
      };
    } catch (err) {
      logger.error(`[SCRIBE] AI Document generation failed: ${err.message}`);
      return { ok: false, agent: this.name, error: err.message };
    }
  }

  /**
   * Read or summarize an existing document
   */
  async inspectDocument(filePath) {
    return await readWordDocument(filePath);
  }
}
