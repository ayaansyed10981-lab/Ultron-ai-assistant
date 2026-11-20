import { CypherAgent } from './cypher.js';
import { ScribeAgent } from './scribe.js';
import { JarvisAgent } from './jarvis.js';
import { ULTRON_TEAM, getSpokenTeamIntro } from './team_registry.js';
import { logger } from '../logger.js';

/**
 * Ultron Team Orchestrator
 * Coordinates simultaneous multi-agent team missions:
 *   - Vision: Chief Software Engineer & SQL Database Architect
 *   - Friday: Executive Document Architect (Word & PDF)
 *   - Jarvis: Chief Quality Assurance Engineer & System Inspector
 *   - Ultron: Supreme Commander, orchestrating all three in parallel
 */
export class TeamOrchestrator {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.vision = new CypherAgent(geminiEngine);
    this.cypher = this.vision; // alias
    this.friday = new ScribeAgent(geminiEngine);
    this.scribe = this.friday; // alias
    this.jarvis = new JarvisAgent(geminiEngine);
  }

  getTeamRoster() {
    return ULTRON_TEAM;
  }

  getIntroduction() {
    return getSpokenTeamIntro();
  }

  /**
   * Run a coordinated multi-agent team mission with SIMULTANEOUS PARALLEL execution
   */
  async runMission(missionPrompt) {
    logger.info(`[ORCHESTRATOR] Ultron deploying team in parallel for mission: "${missionPrompt}"`);

    const schema = {
      type: 'object',
      properties: {
        mission_title: { type: 'string', description: 'Brief title of the mission.' },
        needs_vision: {
          type: 'boolean',
          description: 'True if software coding, web apps, scripts, database architecture, or SQL queries are needed.',
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
      '- Vision: Chief Software Engineer and SQL Database Architect.',
      '- Friday: Executive Document Architect for Word (.docx) and PDF (.pdf) reports.',
      '- Jarvis: Chief Quality Assurance Engineer, auditing and verifying apps, SQL, Word, and PDF files.',
      'Operatives execute tasks SIMULTANEOUSLY in parallel. Decompose the mission so Vision codes while Friday writes documents, and Jarvis inspects the deliverables.',
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

      // 1. Dispatch Vision and Friday SIMULTANEOUSLY in parallel!
      logger.info(
        `[ORCHESTRATOR] Executing tasks simultaneously (Vision: ${Boolean(plan.needs_vision)}, Friday: ${Boolean(plan.needs_friday)})...`,
      );

      const parallelJobs = [];

      // Vision Task Job
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

      // Friday Task Job
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
      let fridayOutput = null;

      for (const res of jobResults) {
        if (res.status === 'fulfilled' && res.value) {
          results.reports.push(res.value);
          if (res.value.agent === 'Vision') visionOutput = res.value.output;
          if (res.value.agent === 'Friday') fridayOutput = res.value.output;
        } else if (res.status === 'rejected') {
          logger.error(`[PARALLEL] Operative task failed: ${res.reason?.message}`);
        }
      }

      // 2. Jarvis Automated Quality Assurance Audit (checks apps, SQL, Word, and PDF files!)
      const shouldAudit = plan.needs_jarvis !== false;
      let jarvisAudit = null;
      if (shouldAudit && (visionOutput || fridayOutput)) {
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
