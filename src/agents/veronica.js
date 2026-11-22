import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECTS_DIR } from '../coder.js';
import { logger } from '../logger.js';

export const MEDIA_DIR = path.join(os.homedir(), 'UltronMedia');
function ensureMediaDir() {
  try {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  } catch {
    // Sandbox or host fallback
  }
}

function slugify(name) {
  return (
    String(name || 'media-asset')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `asset-${Date.now()}`
  );
}

/**
 * Agent Veronica: Chief Visual Media & Generative Creative Director
 * Operative under Commander Ultron.
 * Generates:
 *   - Cinematic scrollytelling background video animations & WebGL/Canvas video loops
 *   - High-impact SVG visual brand assets, logos, and illustrations
 *   - Curated color palettes, typography, and scrollytelling visual storyboards
 */
export class VeronicaAgent {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.id = 'veronica';
    this.name = 'Veronica';
    this.alias = 'Creative / Visuals / Media';
  }

  /**
   * Generate a complete visual branding & media kit for a company or website project.
   * Feeds directly into Agent Vision to build high-end scrollytelling websites!
   */
  async generateMediaKit(args) {
    const company = String(args.company || args.prompt || 'Modern Brand').trim();
    const style = String(args.style || 'cinematic modern luxury tech').trim();
    const projectSlug = slugify(args.project_name || company);

    logger.info(`[VERONICA] Crafting visual media kit & video storyboard for: "${company}"`);

    const schema = {
      type: 'object',
      properties: {
        brand_name: { type: 'string', description: 'Brand or company display name.' },
        tagline: { type: 'string', description: 'Compelling brand tagline for the hero section.' },
        color_palette: {
          type: 'object',
          properties: {
            primary: { type: 'string', description: 'Hex code for primary brand color.' },
            secondary: { type: 'string', description: 'Hex code for secondary accent.' },
            background_dark: { type: 'string', description: 'Hex code for deep dark background.' },
            text_light: { type: 'string', description: 'Hex code for clean readable text.' },
            accent_glow: { type: 'string', description: 'Hex code for neon/vibrant glow highlight.' },
          },
          required: ['primary', 'secondary', 'background_dark', 'text_light', 'accent_glow'],
        },
        typography: {
          type: 'object',
          properties: {
            heading_font: { type: 'string', description: 'Google Font name for bold headings (e.g., Plus Jakarta Sans, Syne, Outfit).' },
            body_font: { type: 'string', description: 'Google Font name for readable body text (e.g., Inter, DM Sans).' },
          },
          required: ['heading_font', 'body_font'],
        },
        video_hero_concept: {
          type: 'string',
          description: 'Description of the cinematic video background loop for the hero section.',
        },
        video_canvas_code: {
          type: 'string',
          description: 'Self-contained vanilla JavaScript code that renders an interactive, ultra-smooth 60fps HTML5 Canvas or WebGL cinematic background animation (particles, fluid gradients, constellation lines, or kinetic motion) responsive to mouse movement and scroll depth.',
        },
        logo_svg: {
          type: 'string',
          description: 'Complete, elegant, modern inline SVG logo for the company with viewBox and styled paths.',
        },
        scroll_sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Section DOM id.' },
              title: { type: 'string', description: 'Section title.' },
              subtitle: { type: 'string', description: 'Section subtitle.' },
              visual_concept: { type: 'string', description: 'Visual concept or animation effect on scroll.' },
              body_points: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key feature points or metrics to showcase.',
              },
            },
            required: ['id', 'title', 'visual_concept'],
          },
        },
        summary: {
          type: 'string',
          description: 'One concise spoken sentence by Veronica summarizing the visual media assets generated (no markdown).',
        },
      },
      required: [
        'brand_name',
        'tagline',
        'color_palette',
        'typography',
        'video_hero_concept',
        'video_canvas_code',
        'logo_svg',
        'scroll_sections',
        'summary',
      ],
    };

    const systemPrompt = [
      'You are Veronica, Chief Visual Media & Generative Creative Director for the Ultron Operative Team.',
      'Your specialty is high-end visual design, scrollytelling aesthetics, cinematic video loops, and modern branding.',
      'When crafting media for websites, you create complete, production-ready visual assets that Vision can embed directly into scroll-driven web experiences.',
      'The video_canvas_code must be runnable JavaScript that initializes an HTML5 canvas element with smooth 60fps animations responsive to window resize and scroll position.',
      'The logo_svg must be valid, beautiful modern SVG with inline colors and viewBox.',
      `Brand: ${company}. Style: ${style}.`,
    ].join('\n');

    try {
      const rawText = await this.gemini.generateStructuredJson(
        `Generate a complete visual branding and scrollytelling media kit for:\nCompany: ${company}\nStyle: ${style}`,
        schema,
        systemPrompt,
      );

      const mediaKit = JSON.parse(rawText);

      // Save media kit assets into ~/UltronMedia/<projectSlug>/
      const targetDir = path.join(MEDIA_DIR, projectSlug);
      fs.mkdirSync(targetDir, { recursive: true });

      if (mediaKit.logo_svg) {
        fs.writeFileSync(path.join(targetDir, 'logo.svg'), mediaKit.logo_svg, 'utf8');
      }
      if (mediaKit.video_canvas_code) {
        fs.writeFileSync(path.join(targetDir, 'video-canvas.js'), mediaKit.video_canvas_code, 'utf8');
      }
      fs.writeFileSync(path.join(targetDir, 'media-kit.json'), JSON.stringify(mediaKit, null, 2), 'utf8');

      logger.info(`[VERONICA] Media kit saved to: ${targetDir}`);

      return {
        ok: true,
        agent: this.name,
        specialty: 'Visual Media & Creative Direction',
        projectDir: targetDir,
        mediaKit,
        summary: mediaKit.summary || `I have designed the visual media kit, cinematic video loop, and branding assets for ${company}, sir.`,
      };
    } catch (err) {
      logger.error(`[VERONICA] Media kit generation failed: ${err.message}`);
      return {
        ok: false,
        agent: this.name,
        error: err.message,
        summary: 'I encountered an issue generating the visual media kit, sir.',
      };
    }
  }

  /**
   * Standalone Image / SVG Asset Generation
   */
  async generateImage(args) {
    const prompt = String(args.prompt || '').trim();
    logger.info(`[VERONICA] Generating visual image asset for: "${prompt}"`);

    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the visual asset.' },
        svg_code: { type: 'string', description: 'Complete valid standalone SVG vector image code.' },
        summary: { type: 'string', description: 'One concise spoken sentence summarizing the visual asset.' },
      },
      required: ['title', 'svg_code', 'summary'],
    };

    const systemPrompt = [
      'You are Veronica, Chief Visual Media Director.',
      'Generate stunning, high-precision SVG vector illustrations, icons, or visual artwork with modern colors, gradients, and clean geometry.',
    ].join('\n');

    try {
      const raw = await this.gemini.generateStructuredJson(prompt, schema, systemPrompt);
      const parsed = JSON.parse(raw);
      const filename = `${slugify(parsed.title)}.svg`;
      const filePath = path.join(MEDIA_DIR, filename);
      fs.writeFileSync(filePath, parsed.svg_code, 'utf8');

      logger.info(`[VERONICA] Saved image asset to: ${filePath}`);
      return {
        ok: true,
        agent: this.name,
        filePath,
        summary: parsed.summary || `Visual asset saved to Ultron Media, sir.`,
      };
    } catch (err) {
      logger.error(`[VERONICA] Image generation failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Standalone Scrollytelling Video / Shader Animation Generation
   */
  async generateVideo(args) {
    const prompt = String(args.prompt || '').trim();
    logger.info(`[VERONICA] Generating cinematic video loop for: "${prompt}"`);

    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the video animation.' },
        html_code: {
          type: 'string',
          description: 'A complete, self-contained HTML file with embedded CSS and JavaScript WebGL/Canvas rendering a cinematic 60fps video background loop that reacts smoothly to scrolling and mouse movement.',
        },
        summary: { type: 'string', description: 'One concise spoken sentence describing the video loop.' },
      },
      required: ['title', 'html_code', 'summary'],
    };

    const systemPrompt = [
      'You are Veronica, Generative Video & Cinematic Media Director.',
      'Create an immersive, high-framerate HTML5 WebGL/Canvas video loop. It must run seamlessly in any browser without external heavy dependencies.',
    ].join('\n');

    try {
      const raw = await this.gemini.generateStructuredJson(prompt, schema, systemPrompt);
      const parsed = JSON.parse(raw);
      const filename = `${slugify(parsed.title)}-video.html`;
      const filePath = path.join(MEDIA_DIR, filename);
      fs.writeFileSync(filePath, parsed.html_code, 'utf8');

      logger.info(`[VERONICA] Saved video loop to: ${filePath}`);
      return {
        ok: true,
        agent: this.name,
        filePath,
        summary: parsed.summary || `Cinematic video loop generated and saved to Ultron Media, sir.`,
      };
    } catch (err) {
      logger.error(`[VERONICA] Video generation failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
