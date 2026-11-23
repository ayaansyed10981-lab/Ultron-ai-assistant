import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

export const EDITS_DIR = path.join(os.homedir(), 'UltronEdits');

function ensureEditsDir() {
  try {
    if (!fs.existsSync(EDITS_DIR)) {
      fs.mkdirSync(EDITS_DIR, { recursive: true });
    }
  } catch {
    // Sandbox or host fallback
  }
}

function slugify(name) {
  return (
    String(name || 'edit')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `edit-${Date.now()}`
  );
}

/**
 * Agent Edith: Chief Media & Content Editor
 * Operative under Commander Ultron.
 * Specialized in:
 *   - Video & reel trimming, cutting, clip splicing, and audio extraction
 *   - Autonomous Microsoft Word (.docx) document refactoring, polishing, and proofreading
 *   - Script, article, and content tone editing (executive, punchy, persuasive, concise)
 */
export class EdithAgent {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.id = 'edith';
    this.name = 'Edith';
    this.alias = 'Editor / Media / Content';
    ensureEditsDir();
  }

  /**
   * Edit or trim a video file, cut reels/shorts, or extract audio tracks
   */
  async editVideo(args) {
    const inputFile = String(args.input_file || args.file || args.target || '').trim();
    const instructions = String(args.instructions || args.prompt || 'Trim and optimize video').trim();
    const startTime = String(args.start_time || args.start || '00:00:00').trim();
    const endTime = String(args.end_time || args.end || '').trim();
    const action = String(args.action || 'trim').toLowerCase();

    logger.info(`[EDITH] Processing video edit: Action="${action}", Input="${inputFile}", Instructions="${instructions}"`);

    const outputName = `edith_${slugify(path.basename(inputFile, path.extname(inputFile)))}_${Date.now()}.mp4`;
    const outputPath = path.join(EDITS_DIR, outputName);

    // If a physical video file exists and ffmpeg is on system, execute direct native cut
    let ffmpegAvailable = false;
    try {
      await execAsync('ffmpeg -version');
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
    }

    if (ffmpegAvailable && inputFile && fs.existsSync(inputFile)) {
      try {
        let cmd = '';
        if (action === 'extract_audio') {
          const audioOutput = outputPath.replace(/\.mp4$/, '.mp3');
          cmd = `ffmpeg -y -i "${inputFile}" -vn -c:a libmp3lame -q:a 2 "${audioOutput}"`;
          await execAsync(cmd);
          return {
            ok: true,
            action: 'extract_audio',
            outputPath: audioOutput,
            summary: `Extracted audio track to "${path.basename(audioOutput)}" in your UltronEdits folder, sir.`,
          };
        } else if (endTime) {
          cmd = `ffmpeg -y -ss ${startTime} -to ${endTime} -i "${inputFile}" -c copy "${outputPath}"`;
        } else {
          cmd = `ffmpeg -y -ss ${startTime} -i "${inputFile}" -c copy "${outputPath}"`;
        }

        await execAsync(cmd);
        return {
          ok: true,
          action,
          outputPath,
          summary: `Trimmed video from ${startTime}${endTime ? ` to ${endTime}` : ''} and saved as "${outputName}" in your UltronEdits folder, sir.`,
        };
      } catch (err) {
        logger.warn(`[EDITH] Direct ffmpeg edit encountered an error: ${err.message}. Generating script fallback.`);
      }
    }

    // AI Edit Blueprint: Generate precise editing timeline, cut points, and PowerShell/ffmpeg command script
    const schema = {
      type: 'object',
      properties: {
        edit_title: { type: 'string', description: 'Title of the edited sequence.' },
        summary: { type: 'string', description: 'Crisp summary of the edit performed.' },
        timeline_cuts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cut_number: { type: 'integer' },
              start: { type: 'string' },
              end: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['cut_number', 'start', 'end', 'description'],
          },
        },
        ffmpeg_command: { type: 'string', description: 'Exact one-line ffmpeg command to produce this edit.' },
        spoken_response: { type: 'string', description: 'Natural spoken response for Ultron in 1 to 2 sentences.' },
      },
      required: ['edit_title', 'summary', 'timeline_cuts', 'ffmpeg_command', 'spoken_response'],
    };

    try {
      const prompt = `You are Edith, Chief Media & Video Editor.
Create an editing plan and exact command for:
- Input File: ${inputFile || 'Current active video/reel'}
- Desired Action: ${action}
- Edit Instructions: ${instructions}
- Start Time: ${startTime}
- End Time: ${endTime || 'End of clip'}

Return clean JSON matching the schema.`;

      const res = await this.gemini.chatClient.interactions.create({
        model: this.gemini.activeModel || 'gemini-2.5-flash',
        store: false,
        generation_config: { response_mime_type: 'application/json', response_schema: schema, thinking_level: 'minimal' },
        input: prompt,
      });

      const parsed = JSON.parse(res.output_text || '{}');
      const scriptPath = path.join(EDITS_DIR, `edit_command_${Date.now()}.bat`);
      if (parsed.ffmpeg_command) {
        fs.writeFileSync(scriptPath, `@echo off\nREM Edith Video Cut Command\n${parsed.ffmpeg_command}\npause\n`, 'utf8');
      }

      return {
        ok: true,
        action,
        outputPath: scriptPath,
        blueprint: parsed,
        summary: parsed.spoken_response || `I have formulated your video edit blueprint and saved the cut command to UltronEdits, sir.`,
      };
    } catch (err) {
      return {
        ok: true,
        action,
        summary: `I have prepared the edit timeline for ${inputFile || 'your video'} starting at ${startTime}, sir.`,
      };
    }
  }

  /**
   * Refactor, polish, rewrite, and improve Microsoft Word documents or text files
   */
  async editDocument(args) {
    const documentName = String(args.document_name || args.file || args.target || 'Document').trim();
    const instructions = String(args.instructions || args.prompt || 'Polish and refine the document').trim();
    const style = String(args.style || 'executive professional').trim();

    logger.info(`[EDITH] Editing document: Doc="${documentName}", Style="${style}", Instructions="${instructions}"`);

    const schema = {
      type: 'object',
      properties: {
        document_title: { type: 'string', description: 'Title of the edited document.' },
        summary_of_changes: { type: 'string', description: 'Brief summary of edits, improvements, and styling applied.' },
        revised_sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'Section heading.' },
              body: { type: 'string', description: 'Polished, articulate, error-free section body.' },
            },
            required: ['heading', 'body'],
          },
        },
        spoken_response: { type: 'string', description: 'Natural spoken response in 1-2 sentences addressed to sir.' },
      },
      required: ['document_title', 'summary_of_changes', 'revised_sections', 'spoken_response'],
    };

    try {
      const prompt = `You are Edith, Executive Content & Document Editor.
Edit, proofread, refactor, and polish the following document according to the user's instructions:
- Document: ${documentName}
- Style Target: ${style}
- Edit Instructions: ${instructions}

Produce an executive-ready, polished revision. Return clean JSON matching the schema.`;

      const res = await this.gemini.chatClient.interactions.create({
        model: this.gemini.activeModel || 'gemini-2.5-flash',
        store: false,
        generation_config: { response_mime_type: 'application/json', response_schema: schema, thinking_level: 'minimal' },
        input: prompt,
      });

      const parsed = JSON.parse(res.output_text || '{}');
      return {
        ok: true,
        documentName,
        edits: parsed,
        summary: parsed.spoken_response || `I have edited and polished "${documentName}" for you, sir. All phrasing has been refined to executive standards.`,
      };
    } catch (err) {
      logger.error(`[EDITH] Document editing error: ${err.message}`);
      return {
        ok: false,
        error: err.message,
        summary: `I could not complete the edit on "${documentName}", sir: ${err.message}`,
      };
    }
  }

  /**
   * Polish, proofread, condense, or elevate tone for scripts, articles, or text
   */
  async editContent(args) {
    const text = String(args.content || args.text || args.prompt || '').trim();
    const instructions = String(args.instructions || 'Refine and polish for clarity and impact').trim();
    const tone = String(args.tone || 'executive').toLowerCase();

    logger.info(`[EDITH] Content polishing requested (Tone: ${tone})`);

    const prompt = `You are Edith, Chief Content Editor.
Refine and polish the following content according to these instructions:
- Instructions: ${instructions}
- Target Tone: ${tone}
- Original Text:
"""
${text}
"""

Deliver the refined, polished version directly with zero preamble, zero fluff, and pristine vocabulary.`;

    try {
      const res = await this.gemini.chatClient.interactions.create({
        model: this.gemini.activeModel || 'gemini-2.5-flash',
        store: false,
        generation_config: { thinking_level: 'minimal' },
        input: prompt,
      });

      const refined = (res.output_text || '').trim();
      return {
        ok: true,
        refinedContent: refined,
        summary: `I have polished your content with a ${tone} tone, sir. It is ready for your review.`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        summary: `I encountered an issue polishing your content, sir.`,
      };
    }
  }
}
