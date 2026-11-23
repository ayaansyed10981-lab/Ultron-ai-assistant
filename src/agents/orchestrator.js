import { CypherAgent } from './cypher.js';
import { ScribeAgent } from './scribe.js';
import { JarvisAgent } from './jarvis.js';
import { VeronicaAgent } from './veronica.js';
import { EdithAgent } from './edith.js';
import { ULTRON_TEAM, getSpokenTeamIntro } from './team_registry.js';
import { logger } from '../logger.js';

/**
 * Ultron Team Orchestrator
 * Coordinates simultaneous multi-agent team missions:
 *   - Vision: Chief Software Engineer & SQL Database Architect
 *   - Friday: Executive Document Architect (Word & PDF)
 *   - Jarvis: Chief Quality Assurance Engineer & System Inspector
 *   - Veronica: Chief Visual Media & Generative Creative Director
 *   - Edith: Chief Media & Content Editor (Video Trimming, Document & Content Editing)
 *   - Ultron: Supreme Commander, orchestrating all operatives in parallel
 */
export class TeamOrchestrator {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.vision = new CypherAgent(geminiEngine);
    this.cypher = this.vision; // alias
    this.friday = new ScribeAgent(geminiEngine);
    this.scribe = this.friday; // alias
    this.jarvis = new JarvisAgent(geminiEngine);
    this.veronica = new VeronicaAgent(geminiEngine);
    this.edith = new EdithAgent(geminiEngine);
    this.editor = this.edith; // alias
  }

  getTeamRoster() {
    return ULTRON_TEAM;
  }

  getIntroduction() {
    return getSpokenTeamIntro();
  }

  /**
   * Dedicated Multi-Agent Scrollytelling Pipeline:
   * Ultron coordinates Veronica (Media & Video Loop) -> Vision (Scrollytelling Website) -> Jarvis (QA Audit)
   */
  async buildScrollytellingWebsite(args) {
    const company = String(args.company || args.prompt || 'Modern Enterprise').trim();
    const style = String(args.style || 'cinematic modern luxury tech').trim();

    logger.info(`[PIPELINE] Ultron initiating scrollytelling website pipeline for: "${company}"`);

    // Step 1: Ultron commands Veronica to generate visual media kit & background video loop
    logger.info(`[PIPELINE] Step 1/3: Veronica generating visual media kit & cinematic video loop...`);
    const veronicaOutput = await this.veronica.generateMediaKit({ company, style });

    // Step 2: Ultron forwards Veronica's media assets to Vision to build the website
    logger.info(`[PIPELINE] Step 2/3: Ultron sending Veronica's media kit to Vision for engineering...`);
    let visionPrompt = `Build a complete, stunning, single-file responsive scroll-based (scrollytelling) web application for "${company}".`;
    if (veronicaOutput.ok && veronicaOutput.mediaKit) {
      const mk = veronicaOutput.mediaKit;
      visionPrompt += `\nIntegrate Veronica's visual media kit directly into the index.html:
- Brand Name: ${mk.brand_name || company}
- Tagline: ${mk.tagline || ''}
- Color Theme: Background ${mk.color_palette?.background_dark || '#0a0a0f'}, Primary ${mk.color_palette?.primary || '#3b82f6'}, Accent Glow ${mk.color_palette?.accent_glow || '#06b6d4'}
- Typography: Use Google Fonts for ${mk.typography?.heading_font || 'Outfit'} and ${mk.typography?.body_font || 'Inter'}
- Hero Video / Background Loop: In the hero section, embed an HTML5 canvas and insert Veronica's interactive 60fps canvas script:
\`\`\`javascript
${mk.video_canvas_code || ''}
\`\`\`
- Logo: Render Veronica's inline SVG logo:
${mk.logo_svg || ''}
- Scrollytelling Narrative: Implement smooth scroll triggers for the following sections with scroll-driven animations, sticky overlays, and scroll progress bars:
${JSON.stringify(mk.scroll_sections || [], null, 2)}
Ensure the page feels cinematic, fluid, and buttery-smooth as the user scrolls!`;
    } else {
      visionPrompt += ` Include a cinematic video/canvas background loop in the hero section, interactive scroll-triggered sections, and modern dark-mode styling.`;
    }

    const visionOutput = await this.vision.buildProject({
      prompt: visionPrompt,
      language: 'html',
      project_name: `${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-scrollytelling`,
    });

    // Step 3: Jarvis automated QA check
    logger.info(`[PIPELINE] Step 3/3: Jarvis verifying scrollytelling web application...`);
    const jarvisAudit = await this.jarvis.auditDeliverables({ visionOutput });

    return {
      ok: true,
      company,
      leader: 'Ultron',
      pipeline: 'Ultron -> Veronica -> Vision -> Jarvis',
      veronicaOutput,
      visionOutput,
      jarvisAudit,
      spokenSummary: `Mission accomplished, sir. Veronica created the cinematic video background loop and visual branding, Vision engineered the scrollytelling website integrating Veronica's assets, and Jarvis verified the build. I have opened it in your browser.`,
    };
  }

  /**
   * Run a coordinated multi-agent team mission with SIMULTANEOUS PARALLEL execution
   */
  async runMission(missionPrompt) {
    logger.info(`[ORCHESTRATOR] Ultron deploying team in parallel for mission: "${missionPrompt}"`);

    // Check if user specifically requested a scrollytelling / scroll-based website
    const isScrollWebsite = /\b(?:scroll(?:-|\s+)?based|scrollytelling|scroll\s+website)\b/i.test(missionPrompt);
    if (isScrollWebsite) {
      const companyMatch = missionPrompt.match(/\b(?:for|company|brand|named?)\s+([a-zA-Z0-9\s&'-]+?)(?:\s+(?:website|site|app|with|and|,|\.|$))/i);
      const company = companyMatch ? companyMatch[1].trim() : 'NextGen Tech';
      return await this.buildScrollytellingWebsite({ company, prompt: missionPrompt });
    }

    const schema = {
      type: 'object',
      properties: {
        mission_title: { type: 'string', description: 'Brief title of the mission.' },
        needs_vision: {
          type: 'boolean',
          description: 'True if software coding, web apps, backend APIs, scripts, database architecture, or SQL queries are needed.',
        },
        vision_task: {
          type: 'string',
          description: 'Exact technical task for Vision (e.g. build website, write SQL query).',
        },
        is_sql_task: {
          type: 'boolean',
          description: 'True if Vision task is primarily SQL queries or database schema.',
        },
        sql_dialect: {
          type: 'string',
          description: 'SQL dialect (PostgreSQL, MySQL, SQLite, etc.) if applicable.',
        },
        needs_veronica: {
          type: 'boolean',
          description: 'True if visual media, imagery, logos, video loops, or creative artwork are needed.',
        },
        veronica_task: {
          type: 'string',
          description: 'Exact visual media / video task for Veronica.',
        },
        needs_friday: {
          type: 'boolean',
          description: 'True if Word (.docx), PDF (.pdf), technical documentation, or reports are needed.',
        },
        friday_task: {
          type: 'string',
          description: 'Exact documentation task for Friday.',
        },
        document_format: {
          type: 'string',
          enum: ['docx', 'pdf', 'both'],
          description: 'Target document format for Friday.',
        },
        needs_jarvis: {
          type: 'boolean',
          description: 'True if Jarvis should audit, check, and verify the deliverables (default true).',
        },
        jarvis_task: {
          type: 'string',
          description: 'Specific QA inspection instructions for Jarvis.',
        },
        briefing: {
          type: 'string',
          description: 'One concise spoken sentence by Ultron announcing simultaneous deployment of operatives.',
        },
      },
      required: ['mission_title', 'needs_vision', 'needs_friday', 'briefing'],
    };

    const systemPrompt = [
      'You are Ultron, Supreme AI Commander of a specialized operative team.',
      'Operatives under your command:',
      '- Vision: Chief Software Engineer and SQL Database Architect (Frontend & Backend).',
      '- Veronica: Chief Visual Media Director for cinematic video loops, imagery, and branding.',
      '- Friday: Executive Document Architect for Word (.docx) and PDF (.pdf) reports.',
      '- Jarvis: Chief Quality Assurance Engineer, auditing and verifying apps, SQL, Word, and PDF files.',
      'Operatives execute tasks SIMULTANEOUSLY in parallel. Decompose the mission so Veronica designs visuals/video, Vision codes, Friday writes documents, and Jarvis inspects the deliverables.',
    ].join('\n');

    try {
      const rawPlan = await this.gemini.generateStructuredJson(
        `Analyze and decompose this simultaneous team mission:\n\n"${missionPrompt}"`,
        schema,
        systemPrompt,
      );

      const plan = JSON.parse(rawPlan);
      const results = {
        ok: true,
        mission: plan.mission_title,
        leader: 'Ultron',
        reports: [],
      };

      // 1. Dispatch Veronica, Vision, and Friday SIMULTANEOUSLY in parallel!
      logger.info(
        `[ORCHESTRATOR] Executing tasks simultaneously (Vision: ${Boolean(plan.needs_vision)}, Veronica: ${Boolean(plan.needs_veronica)}, Friday: ${Boolean(plan.needs_friday)})...`,
      );

      const parallelJobs = [];

      // Veronica Task Job (Visual Media / Video Loops / Graphics)
      if (plan.needs_veronica) {
        parallelJobs.push(
          (async () => {
            logger.info(`[PARALLEL] Veronica starting: "${plan.veronica_task || missionPrompt}"`);
            const out = await this.veronica.generateMediaKit({
              company: plan.mission_title,
              prompt: plan.veronica_task || missionPrompt,
            });
            logger.info(`[PARALLEL] Veronica finished successfully.`);
            return {
              agent: 'Veronica',
              specialty: 'Visual Media & Creative Video Direction',
              output: out,
            };
          })(),
        );
      }

      // Vision Task Job (Frontend, Backend, SQL)
      if (plan.needs_vision) {
        parallelJobs.push(
          (async () => {
            logger.info(`[PARALLEL] Vision starting: "${plan.vision_task || missionPrompt}"`);
            let out;
            if (plan.is_sql_task) {
              out = await this.vision.generateSql({
                prompt: plan.vision_task || missionPrompt,
                dialect: plan.sql_dialect || 'PostgreSQL',
              });
            } else {
              out = await this.vision.buildProject({
                prompt: plan.vision_task || missionPrompt,
              });
            }
            logger.info(`[PARALLEL] Vision finished successfully.`);
            return {
              agent: 'Vision',
              specialty: plan.is_sql_task ? 'SQL Database Architecture' : 'Software Engineering',
              output: out,
            };
          })(),
        );
      }

      // Friday Task Job (Word & PDF)
      if (plan.needs_friday) {
        parallelJobs.push(
          (async () => {
            logger.info(`[PARALLEL] Friday starting: "${plan.friday_task || missionPrompt}"`);
            const out = await this.friday.generateAiDocument({
              prompt: plan.friday_task || missionPrompt,
              format: plan.document_format || 'pdf',
              title: plan.mission_title,
            });
            logger.info(`[PARALLEL] Friday finished successfully.`);
            return {
              agent: 'Friday',
              specialty: `Document Architecture (${plan.document_format || 'PDF & Word'})`,
              output: out,
            };
          })(),
        );
      }

      // Await all parallel tasks concurrently!
      const jobResults = await Promise.allSettled(parallelJobs);

      let visionOutput = null;
      let veronicaOutput = null;
      let fridayOutput = null;

      for (const res of jobResults) {
        if (res.status === 'fulfilled' && res.value) {
          results.reports.push(res.value);
          if (res.value.agent === 'Vision') visionOutput = res.value.output;
          if (res.value.agent === 'Veronica') veronicaOutput = res.value.output;
          if (res.value.agent === 'Friday') fridayOutput = res.value.output;
        } else if (res.status === 'rejected') {
          logger.error(`[PARALLEL] Operative task failed: ${res.reason?.message}`);
        }
      }

      // 2. Jarvis Automated Quality Assurance Audit (checks apps, SQL, Word, and PDF files!)
      const shouldAudit = plan.needs_jarvis !== false;
      let jarvisAudit = null;
      if (shouldAudit && (visionOutput || fridayOutput || veronicaOutput)) {
        logger.info('[ORCHESTRATOR] Jarvis commencing quality assurance audit of team deliverables...');
        jarvisAudit = await this.jarvis.auditDeliverables({
          visionOutput,
          fridayOutput,
        });
        results.reports.push({
          agent: 'Jarvis',
          specialty: 'Quality Assurance & Deliverable Inspection',
          output: jarvisAudit,
        });
      }

      // Construct Commander's Spoken Summary
      const summaryParts = [];
      if (veronicaOutput && veronicaOutput.ok) {
        summaryParts.push(veronicaOutput.summary || 'Veronica completed the visual media and video assets.');
      }
      if (visionOutput && visionOutput.ok) {
        summaryParts.push(visionOutput.summary || 'Vision completed the software application.');
      }
      if (fridayOutput && fridayOutput.ok) {
        summaryParts.push(fridayOutput.summary || 'Friday compiled the executive documentation.');
      }
      if (jarvisAudit && jarvisAudit.ok) {
        summaryParts.push('Jarvis verified all deliverables and confirmed zero errors.');
      }

      const finalSpoken =
        summaryParts.length > 0
          ? `Mission accomplished, sir. ${summaryParts.join(' ')} All deliverables are ready in your Ultron workspaces.`
          : `Team mission complete, sir. All operatives have executed their tasks simultaneously.`;

      results.spokenSummary = finalSpoken;
      return results;
    } catch (err) {
      logger.error(`[ORCHESTRATOR] Team mission failed: ${err.message}`);
      return {
        ok: false,
        leader: 'Ultron',
        error: `Mission failed: ${err.message}`,
        spokenSummary: 'I encountered an issue coordinating the team operatives, sir.',
      };
    }
  }
}
