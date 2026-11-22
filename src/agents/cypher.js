import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateAndBuildProject, PROJECTS_DIR } from '../coder.js';
import { logger } from '../logger.js';

function slugify(name) {
  return (
    String(name || 'sql-query')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `query-${Date.now()}`
  );
}

/**
 * Agent Vision: Chief Software Engineer & Full-Stack Backend Architect
 */
export class CypherAgent {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.id = 'vision';
    this.name = 'Vision';
    this.alias = 'Coder';
  }

  /**
   * Autonomous Coding & Project Generation (Frontend, Full-Stack, or Routing to Backend)
   */
  async buildProject(args) {
    const prompt = String(args?.prompt || '').trim();
    const isBackend =
      args?.action === 'backend' ||
      /\b(backend|rest\s*api|api\s*server|express\s*server|fastapi|flask\s*app|microservice|crud\s*api|server\.js|database\s*api)\b/i.test(
        prompt,
      );

    if (isBackend) {
      return this.buildBackend(args);
    }

    logger.info(`[VISION] Initiating software engineering for: "${prompt}"`);
    const result = await generateAndBuildProject(this.gemini, args);
    return {
      agent: this.name,
      specialty: 'Software Engineering',
      ...result,
      agentNote: `Vision completed code generation for: ${result.projectName || 'project'}.`,
    };
  }

  /**
   * Autonomous Backend & REST / Microservice API Architecture
   * Builds complete production-grade backend servers with routes, auth, middleware, DB connections, and test scripts.
   */
  async buildBackend(args) {
    const prompt = String(args.prompt || '').trim();
    const stack = String(args.stack || args.framework || 'node-express').trim().toLowerCase();
    const database = String(args.database || 'sqlite').trim().toLowerCase();
    const auth = String(args.auth || 'jwt').trim().toLowerCase();
    const port = Number.parseInt(args.port, 10) || (stack.includes('python') || stack.includes('fastapi') || stack.includes('flask') ? 8000 : 3000);

    if (!prompt) {
      return { ok: false, error: 'A backend or API specification is required.' };
    }

    logger.info(`[VISION] Engineering full-stack backend API for: "${prompt}" [Stack: ${stack}, DB: ${database}, Auth: ${auth}]`);

    const schema = {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'Short hyphenated lowercase folder name (e.g. auth-rest-api, ecommerce-backend).',
        },
        architecture_title: {
          type: 'string',
          description: 'Descriptive title for the backend architecture.',
        },
        stack_used: {
          type: 'string',
          description: 'Framework and runtime used (e.g. Node.js / Express ES Modules, Python / FastAPI).',
        },
        endpoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, PATCH).' },
              path: { type: 'string', description: 'Endpoint route path (e.g. /api/auth/login).' },
              description: { type: 'string', description: 'Summary of what this endpoint does.' },
              auth_required: { type: 'boolean', description: 'Whether JWT / auth middleware is required.' },
            },
            required: ['method', 'path', 'description'],
          },
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative file path (e.g. server.js, routes/auth.js, middleware/auth.js, package.json).' },
              content: { type: 'string', description: 'Complete, production-ready source code with zero TODOs or placeholders.' },
            },
            required: ['path', 'content'],
          },
        },
        summary: {
          type: 'string',
          description: 'One concise spoken sentence summarizing what Vision engineered (no markdown).',
        },
      },
      required: ['project_name', 'architecture_title', 'stack_used', 'endpoints', 'files', 'summary'],
    };

    const systemPrompt = [
      'You are Vision, Chief Software Engineer & Full-Stack Backend Architect serving with Commander Ultron.',
      'You engineer production-grade, highly secure, modular, and maintainable backend servers and REST APIs.',
      'Architecture Rules:',
      '- Produce a clean, modular structure: entry point (server.js or main.py), routes/, controllers/ or services/, middleware/, config/ (database), and dependency manifest.',
      '- Security Best Practices: Use parameterized database queries (NEVER raw string concatenation for SQL), robust input validation, secure password hashing (bcrypt), JWT auth middleware with expiration, CORS configuration, and security headers (Helmet for Express).',
      '- Provide package.json (with "start", "dev", "test" scripts and dependencies) for Node, or requirements.txt for Python.',
      '- Provide a .env.example file with all necessary configuration variables.',
      '- Provide a README.md detailing every API route with exact curl commands to test them.',
      '- Provide an automated test script (test.js or test_api.py) that verifies the endpoints.',
      '- All code must be complete, runnable, and syntactically flawless with ZERO placeholders.',
      `Requested Stack: ${stack}. Database: ${database}. Authentication: ${auth}. Default Port: ${port}.`,
    ].join('\n');

    try {
      const rawResult = await this.gemini.generateStructuredJson(
        `Engineer the production-grade backend API architecture for this specification:\n\n"${prompt}"`,
        schema,
        systemPrompt,
      );

      let data;
      try {
        data = JSON.parse(rawResult);
      } catch {
        const cleaned = rawResult.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        data = JSON.parse(cleaned);
      }

      const folderSlug = slugify(args.project_name || data.project_name || 'backend-api');
      const projectDir = path.join(PROJECTS_DIR, folderSlug);
      fs.mkdirSync(projectDir, { recursive: true });

      const writtenFiles = [];
      for (const f of data.files || []) {
        const rel = String(f.path || '').replace(/^[/\\]+/, '').replace(/\.\./g, '');
        const fullPath = path.join(projectDir, rel);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, String(f.content ?? ''), 'utf8');
        writtenFiles.push(rel);
      }

      logger.info(`[VISION] Backend project created in ${projectDir} (${writtenFiles.length} files).`);

      return {
        ok: true,
        agent: this.name,
        specialty: 'Full-Stack Backend Architecture',
        title: data.architecture_title,
        projectName: folderSlug,
        projectDir,
        stack: data.stack_used,
        endpoints: data.endpoints,
        files: writtenFiles,
        summary: data.summary,
        spokenSummary: `Vision engineered your full-stack backend API for ${data.architecture_title}, sir. Built with ${data.stack_used}, including ${data.endpoints.length} endpoints, security middleware, and tests. Saved in your UltronProjects folder.`,
      };
    } catch (err) {
      logger.error(`[VISION] Backend engineering failed: ${err.message}`);
      return {
        ok: false,
        agent: this.name,
        error: err.message,
      };
    }
  }

  /**
   * Autonomous SQL Database & Query Engineering
   */
  async generateSql(args) {
    const prompt = String(args.prompt || '').trim();
    const dialect = String(args.dialect || 'PostgreSQL').trim();
    const schemaContext = String(args.schema_context || '').trim();
    const saveToFile = args.save_to_file !== false;

    if (!prompt) {
      return { ok: false, error: 'A SQL query description or database task is required.' };
    }

    logger.info(`[VISION] Generating ${dialect} SQL query for: "${prompt}"`);

    const schema = {
      type: 'object',
      properties: {
        query_title: {
          type: 'string',
          description: 'Short title for the SQL query (e.g., Monthly Revenue Aggregation).',
        },
        dialect: {
          type: 'string',
          description: 'SQL dialect used (e.g. PostgreSQL, MySQL, SQLite, T-SQL).',
        },
        sql_query: {
          type: 'string',
          description: 'The production-grade, optimized SQL query string with formatting.',
        },
        schema_ddl: {
          type: 'string',
          description: 'Optional CREATE TABLE / schema DDL if new tables or schema was required.',
        },
        explanation: {
          type: 'string',
          description: 'Technical breakdown of why this query is structured this way (indexes, CTEs, joins).',
        },
        sample_data: {
          type: 'string',
          description: 'Optional INSERT INTO sample data to test the query.',
        },
        summary: {
          type: 'string',
          description: 'One concise spoken sentence summarizing what Vision generated (no markdown).',
        },
      },
      required: ['query_title', 'dialect', 'sql_query', 'explanation', 'summary'],
    };

    const systemPrompt = [
      'You are Vision, Chief Software Engineer and SQL Database Architect serving with Commander Ultron.',
      'You write production-grade, highly optimized, secure, and clean SQL queries and database schemas.',
      'Always consider query performance: use appropriate JOINs, indexes, WHERE clauses, CTEs (WITH ...), and Window functions (ROW_NUMBER(), RANK(), LEAD/LAG) when beneficial.',
      'Avoid SELECT * in production queries; specify explicit columns.',
      `Target SQL Dialect: ${dialect}.`,
      schemaContext ? `Provided Schema Context:\n${schemaContext}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const rawResult = await this.gemini.generateStructuredJson(
        `Engineer the optimal SQL query or database solution for this request:\n\n"${prompt}"`,
        schema,
        systemPrompt,
      );

      let data;
      try {
        data = JSON.parse(rawResult);
      } catch {
        const cleaned = rawResult.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        data = JSON.parse(cleaned);
      }

      let filePath = null;
      if (saveToFile) {
        const folderName = slugify(data.query_title);
        const targetDir = path.join(PROJECTS_DIR, folderName);
        fs.mkdirSync(targetDir, { recursive: true });

        const sqlFileName = `${slugify(data.query_title)}.sql`;
        filePath = path.join(targetDir, sqlFileName);

        let fileContent = `-- ============================================================\n`;
        fileContent += `-- ${data.query_title}\n`;
        fileContent += `-- Generated by Vision (Ultron Specialist Team)\n`;
        fileContent += `-- Dialect: ${data.dialect}\n`;
        fileContent += `-- ============================================================\n\n`;

        if (data.schema_ddl) {
          fileContent += `-- --- SCHEMA DDL ---\n${data.schema_ddl}\n\n`;
        }
        if (data.sample_data) {
          fileContent += `-- --- SAMPLE DATA ---\n${data.sample_data}\n\n`;
        }
        fileContent += `-- --- MAIN QUERY ---\n${data.sql_query}\n\n`;
        fileContent += `/*\nEXPLANATION:\n${data.explanation}\n*/\n`;

        fs.writeFileSync(filePath, fileContent, 'utf8');
        logger.info(`[VISION] SQL query saved to: ${filePath}`);
      }

      return {
        ok: true,
        agent: this.name,
        specialty: 'SQL Database Architecture',
        title: data.query_title,
        dialect: data.dialect,
        sql: data.sql_query,
        schemaDdl: data.schema_ddl || null,
        explanation: data.explanation,
        savedPath: filePath,
        summary: data.summary,
        spokenSummary: `Vision generated your ${data.dialect || dialect} SQL query for ${data.query_title || 'your request'}, sir.`,
      };
    } catch (err) {
      logger.error(`[VISION] SQL engineering failed: ${err.message}`);
      return {
        ok: false,
        agent: this.name,
        error: err.message,
      };
    }
  }

  /**
   * Code Review and Performance Optimization
   */
  async reviewOrOptimize(args) {
    const code = String(args.code || '').trim();
    const task = String(args.task || 'optimize and review').trim();

    if (!code) {
      return { ok: false, error: 'Code or SQL query content is required for review.' };
    }

    const schema = {
      type: 'object',
      properties: {
        analysis: { type: 'string', description: 'Detailed breakdown of issues, bottlenecks, or bugs.' },
        improved_code: { type: 'string', description: 'The corrected and optimized code or SQL.' },
        key_improvements: { type: 'array', items: { type: 'string' }, description: 'List of specific fixes.' },
        summary: { type: 'string', description: 'One concise spoken sentence summarizing the result.' },
      },
      required: ['analysis', 'improved_code', 'summary'],
    };

    const systemPrompt =
      'You are Vision. Review, optimize, fix, or refactor the user code or SQL query with elite software engineering standards.';

    try {
      const rawResult = await this.gemini.generateStructuredJson(
        `Task: ${task}\n\nCode/Query:\n\`\`\`\n${code}\n\`\`\``,
        schema,
        systemPrompt,
      );
      const data = JSON.parse(rawResult);
      return {
        ok: true,
        agent: this.name,
        specialty: 'Code Review & Optimization',
        ...data,
      };
    } catch (err) {
      return { ok: false, agent: this.name, error: err.message };
    }
  }
}
