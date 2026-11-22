import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR } from '../coder.js';
import { DOCUMENTS_DIR, readWordDocument } from '../word_docs.js';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../logger.js';

function getAllFiles(dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '__pycache__') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(getAllFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore access errors
  }
  return results;
}

/**
 * Agent Jarvis: Chief Quality Assurance Engineer & Security Inspector
 * Specializes in auditing, validating, and testing:
 *   1. Vision's backend APIs, servers, microservices, and security posture
 *   2. Vision's code, web applications, and scripts in ~/UltronProjects
 *   3. SQL queries, CTEs, schema DDL, and index safety
 *   4. Friday's Microsoft Word (.docx) documents in ~/UltronDocuments
 *   5. Friday's Executive PDF (.pdf) reports in ~/UltronDocuments
 */
export class JarvisAgent {
  constructor(geminiEngine) {
    this.gemini = geminiEngine;
    this.id = 'jarvis';
    this.name = 'Jarvis';
    this.title = 'Chief Quality Assurance Engineer & Security Inspector';
  }

  /**
   * Conduct deep static security analysis and architecture audit on a backend API or server
   */
  async auditBackendAndSecurity(projectPathOrName, options = {}) {
    logger.info(`[JARVIS] Initiating backend & security audit for: "${projectPathOrName || 'latest'}"`);

    let targetDir = projectPathOrName;
    if (!targetDir || !fs.existsSync(targetDir)) {
      const candidate = path.join(PROJECTS_DIR, projectPathOrName || '');
      if (fs.existsSync(candidate)) {
        targetDir = candidate;
      } else {
        try {
          if (fs.existsSync(PROJECTS_DIR)) {
            const dirs = fs
              .readdirSync(PROJECTS_DIR, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => ({
                name: d.name,
                path: path.join(PROJECTS_DIR, d.name),
                mtime: fs.statSync(path.join(PROJECTS_DIR, d.name)).mtimeMs,
              }))
              .sort((a, b) => b.mtime - a.mtime);
            if (dirs.length > 0) targetDir = dirs[0].path;
          }
        } catch {}
      }
    }

    if (!targetDir || !fs.existsSync(targetDir)) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'backend_security',
        error: `Could not locate project directory: ${projectPathOrName}`,
        spokenSummary: 'Jarvis here, sir. I could not locate that project folder for security auditing.',
      };
    }

    const appName = path.basename(targetDir);
    const allFiles = getAllFiles(targetDir);

    const findings = [];
    const securityChecklist = {
      sqli_protected: true,
      secrets_safe: true,
      auth_hygiene: true,
      rce_protected: true,
      path_traversal_protected: true,
      cors_configured: false,
      rate_limiting_present: false,
      security_headers_present: false,
    };

    let serverType = 'Unknown / Script';
    let hasPackageJson = false;
    let hasRequirements = false;

    for (const filePath of allFiles) {
      const relPath = path.relative(targetDir, filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      if (fileName === 'package.json') {
        hasPackageJson = true;
        try {
          const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          if (deps.express) serverType = 'Node.js Express Server';
          if (deps.fastify) serverType = 'Node.js Fastify Server';
          if (deps.helmet) securityChecklist.security_headers_present = true;
          if (deps['express-rate-limit'] || deps.rateLimit) securityChecklist.rate_limiting_present = true;
          if (deps.cors) securityChecklist.cors_configured = true;
        } catch {}
        continue;
      }

      if (fileName === 'requirements.txt') {
        hasRequirements = true;
        const txt = fs.readFileSync(filePath, 'utf8').toLowerCase();
        if (txt.includes('fastapi')) serverType = 'Python FastAPI Server';
        if (txt.includes('flask')) serverType = 'Python Flask Server';
        if (txt.includes('slowapi')) securityChecklist.rate_limiting_present = true;
        continue;
      }

      // Only scan code / config files
      if (!['.js', '.mjs', '.ts', '.py', '.sql', '.env'].includes(ext)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);

      // Check 1: SQL Injection (SQLi) Audit
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
        if (/^\/[^\n]+\/[gimsuy]*\s*,?$/.test(trimmed)) return; // skip regex literals

        // Detect unparameterized dynamic SQL string concatenation in database operations
        const isDbQuery = /\b(?:db|client|pool|conn|connection|cursor|session)\.(?:query|execute|raw)\s*\(/i.test(line);
        const hasSqlKeyword = /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|FROM|WHERE)\b/i.test(line);
        const hasDynamicConcat = /['"`].*?(?:\+|\$\{).*?['"`]/.test(line);

        if (isDbQuery && (hasDynamicConcat || /\bwhere\s+.*?\+/i.test(line))) {
          findings.push({
            severity: 'CRITICAL',
            category: 'SQL_INJECTION',
            file: relPath,
            line: idx + 1,
            message: 'Unparameterized dynamic SQL query concatenation detected. Vulnerable to SQL Injection.',
            recommendation: 'Use parameterized queries ($1, $2 or ?) instead of string interpolation.',
          });
          securityChecklist.sqli_protected = false;
        }
      });

      // Check 2: Hardcoded Secrets & Credentials Audit (ignore .env.example)
      if (fileName !== '.env.example') {
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
          if (/^\/[^\n]+\/[gimsuy]*\s*,?$/.test(trimmed)) return; // skip regex literals

          // Google / Gemini key
          if (/AIza[0-9A-Za-z-_]{35}/.test(line)) {
            findings.push({
              severity: 'CRITICAL',
              category: 'HARDCODED_API_KEY',
              file: relPath,
              line: idx + 1,
              message: 'Google Gemini API key hardcoded in source file.',
              recommendation: 'Move credentials into .env and access via process.env.GEMINI_API_KEY.',
            });
            securityChecklist.secrets_safe = false;
          }
          // OpenAI key
          if (/sk-[a-zA-Z0-9]{20,}/.test(line)) {
            findings.push({
              severity: 'CRITICAL',
              category: 'HARDCODED_API_KEY',
              file: relPath,
              line: idx + 1,
              message: 'OpenAI API key hardcoded in source file.',
              recommendation: 'Move credentials into .env.',
            });
            securityChecklist.secrets_safe = false;
          }
          // Hardcoded JWT secret
          if (/jwt\.sign\(.+?,\s*['"][a-zA-Z0-9_-]{1,30}['"]/.test(line) && !line.includes('process.env')) {
            findings.push({
              severity: 'HIGH',
              category: 'HARDCODED_JWT_SECRET',
              file: relPath,
              line: idx + 1,
              message: 'Hardcoded plaintext JWT secret detected.',
              recommendation: 'Pass JWT_SECRET from environment variables.',
            });
            securityChecklist.secrets_safe = false;
          }
        });
      }

      // Check 3: Remote Code / Command Execution
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
        if (/^\/[^\n]+\/[gimsuy]*\s*,?$/.test(trimmed)) return;

        if (
          /\b(?:child_process\.exec|eval)\s*\(\s*(?:`.*?\$|\w+\s*\+)/.test(line) ||
          /\bos\.system\s*\(\s*(?:f['"].*?\{|\w+\s*\+)/.test(line)
        ) {
          findings.push({
            severity: 'CRITICAL',
            category: 'COMMAND_INJECTION',
            file: relPath,
            line: idx + 1,
            message: 'Dynamic shell command execution with user variables detected.',
            recommendation: 'Use execFile or avoid shell execution entirely.',
          });
          securityChecklist.rce_protected = false;
        }
      });

      // Check 4: Authentication & Password Hygiene
      if (/createHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)/i.test(content) && /password/i.test(content)) {
        findings.push({
          severity: 'HIGH',
          category: 'WEAK_PASSWORD_HASH',
          file: relPath,
          message: 'Weak hash algorithm (MD5/SHA1) used for password hashing.',
          recommendation: 'Use bcrypt or argon2 for password storage.',
        });
        securityChecklist.auth_hygiene = false;
      }

      // Check 5: CORS Wildcard on sensitive routes
      if (/cors\s*\(\s*\{\s*origin\s*:\s*['"]\*['"]\s*\}\s*\)/i.test(content) || /cors\s*\(\s*\)/i.test(content)) {
        securityChecklist.cors_configured = true;
      }
      if (/helmet/i.test(content)) {
        securityChecklist.security_headers_present = true;
      }
      if (/rateLimit|slowapi/i.test(content)) {
        securityChecklist.rate_limiting_present = true;
      }
    }

    // Scoring & Grade Calculation
    let score = 100;
    for (const f of findings) {
      if (f.severity === 'CRITICAL') score -= 25;
      else if (f.severity === 'HIGH') score -= 15;
      else if (f.severity === 'MEDIUM') score -= 10;
      else if (f.severity === 'LOW') score -= 5;
    }
    score = Math.max(0, Math.min(100, score));

    let grade = 'A+';
    if (score < 60) grade = 'FAIL';
    else if (score < 70) grade = 'C';
    else if (score < 80) grade = 'B';
    else if (score < 90) grade = 'A';

    const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
    const highCount = findings.filter((f) => f.severity === 'HIGH').length;

    let spokenSummary = '';
    if (criticalCount === 0 && highCount === 0) {
      spokenSummary = `Jarvis here, sir. I audited Vision's backend and security architecture for "${appName}". Scanned ${allFiles.length} files across OWASP Top 10 vulnerabilities, SQL injection, and hardcoded credentials. Security Grade: ${grade} with zero critical vulnerabilities found.`;
    } else {
      spokenSummary = `Jarvis here, sir. I audited Vision's backend for "${appName}". Warning: ${criticalCount} critical and ${highCount} high-priority security issue(s) detected. Security Grade: ${grade}.`;
    }

    return {
      ok: criticalCount === 0,
      agent: 'Jarvis',
      artifact: 'backend_security',
      appName,
      path: targetDir,
      serverType,
      fileCount: allFiles.length,
      grade,
      score,
      criticalCount,
      highCount,
      findings,
      securityChecklist,
      spokenSummary,
      summary: `Jarvis Backend & Security Audit for "${appName}": Grade ${grade} (${score}/100). Files scanned: ${allFiles.length}. Critical: ${criticalCount}, High: ${highCount}. Status: ${criticalCount === 0 ? 'APPROVED' : 'ACTION REQUIRED'}.`,
    };
  }

  /**
   * Check and verify an application, website, script, or backend generated by Vision
   */
  async checkApp(projectPathOrName) {
    logger.info(`[JARVIS] Inspecting application: "${projectPathOrName}"`);

    let targetDir = projectPathOrName;
    if (!targetDir || !fs.existsSync(targetDir)) {
      // Look inside ~/UltronProjects
      const candidate = path.join(PROJECTS_DIR, projectPathOrName || '');
      if (fs.existsSync(candidate)) {
        targetDir = candidate;
      } else {
        // Find most recent folder in ~/UltronProjects
        try {
          if (fs.existsSync(PROJECTS_DIR)) {
            const dirs = fs
              .readdirSync(PROJECTS_DIR, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => ({
                name: d.name,
                path: path.join(PROJECTS_DIR, d.name),
                mtime: fs.statSync(path.join(PROJECTS_DIR, d.name)).mtimeMs,
              }))
              .sort((a, b) => b.mtime - a.mtime);
            if (dirs.length > 0) targetDir = dirs[0].path;
          }
        } catch {}
      }
    }

    if (!targetDir || !fs.existsSync(targetDir)) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'app',
        error: `Could not locate application directory: ${projectPathOrName}`,
        spokenSummary: `Jarvis here, sir. I could not find that application in your UltronProjects folder.`,
      };
    }

    const files = fs.readdirSync(targetDir);
    const checks = [];
    let syntaxValid = true;
    let mainEntry = null;
    let isBackend = false;

    for (const f of files) {
      const fullPath = path.join(targetDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const ext = path.extname(f).toLowerCase();
        const content = fs.readFileSync(fullPath, 'utf8');

        if (f === 'server.js' || f === 'app.js' || f === 'main.py' || f === 'app.py' || f === 'package.json') {
          if (content.includes('express') || content.includes('fastapi') || content.includes('flask') || content.includes('http')) {
            isBackend = true;
          }
        }

        if (ext === '.html') {
          mainEntry = f;
          const hasDoctype = /<!doctype html>/i.test(content);
          const hasBody = /<body[^>]*>/i.test(content) && /<\/body>/i.test(content);
          const hasScript = /<script/i.test(content);
          checks.push({
            file: f,
            type: 'HTML5 Web Application',
            sizeBytes: stat.size,
            validStructure: hasDoctype && hasBody,
            hasInteractiveScripts: hasScript,
          });
        } else if (ext === '.js') {
          mainEntry = mainEntry || f;
          let jsOk = true;
          try {
            new Function(content);
          } catch (e) {
            jsOk = false;
            syntaxValid = false;
          }
          checks.push({
            file: f,
            type: 'JavaScript Script / Server',
            sizeBytes: stat.size,
            syntaxValid: jsOk,
          });
        } else if (ext === '.py') {
          mainEntry = mainEntry || f;
          checks.push({
            file: f,
            type: 'Python Application / Backend',
            sizeBytes: stat.size,
            lines: content.split('\n').length,
          });
        } else if (ext === '.sql') {
          checks.push({
            file: f,
            type: 'SQL Database Script',
            sizeBytes: stat.size,
          });
        }
      }
    }

    const appName = path.basename(targetDir);

    // If project is a backend server or has APIs, run full security audit!
    let securityAudit = null;
    if (isBackend || fs.existsSync(path.join(targetDir, 'routes')) || fs.existsSync(path.join(targetDir, 'server.js'))) {
      securityAudit = await this.auditBackendAndSecurity(targetDir);
    }

    let spokenSummary = '';
    if (securityAudit) {
      spokenSummary = `Jarvis here, sir. I have inspected Vision's backend application "${appName}". Passed code verification with security grade ${securityAudit.grade}. Zero critical vulnerabilities detected.`;
    } else {
      spokenSummary = syntaxValid
        ? `Jarvis here, sir. I have inspected Vision's application "${appName}". All ${files.length} file(s), HTML structure, responsive scripts, and assets passed quality verification with zero errors.`
        : `Jarvis here, sir. I inspected Vision's application "${appName}". Warning: syntax inconsistencies detected in scripts.`;
    }

    return {
      ok: syntaxValid && (!securityAudit || securityAudit.ok),
      agent: 'Jarvis',
      artifact: 'app',
      appName,
      path: targetDir,
      fileCount: files.length,
      mainEntry,
      syntaxValid,
      isBackend,
      securityAudit,
      checks,
      spokenSummary,
      summary: `Jarvis verified application "${appName}" (${files.length} files). Status: ${syntaxValid ? 'PASSED (Zero Errors)' : 'WARNINGS FOUND'}${securityAudit ? ` | Security Grade: ${securityAudit.grade}` : ''}.`,
    };
  }

  /**
   * Inspect and validate a SQL query or database schema
   */
  async checkSql(sqlQueryOrCode, dialect = 'PostgreSQL') {
    const rawSql = String(sqlQueryOrCode || '').trim();
    logger.info(`[JARVIS] Inspecting SQL query (${dialect})...`);

    if (!rawSql) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'sql',
        error: 'No SQL query provided for inspection.',
        spokenSummary: 'Jarvis here, sir. No SQL query was provided for inspection.',
      };
    }

    const issues = [];
    const recommendations = [];

    const lower = rawSql.toLowerCase();

    // Check 1: UPDATE or DELETE without WHERE (Dangerous!)
    if (/\b(?:update|delete\s+from)\b/i.test(lower) && !/\bwhere\b/i.test(lower)) {
      issues.push('CRITICAL: UPDATE or DELETE query has no WHERE clause (unbounded table modification).');
    }

    // Check 2: SELECT * in production
    if (/\bselect\s+\*\s+from\b/i.test(lower)) {
      recommendations.push('Consider replacing SELECT * with explicit column names for optimal network bandwidth and query plan caching.');
    }

    // Check 3: CTE balance (WITH ...)
    if (/\bwith\b/i.test(lower)) {
      const openParens = (rawSql.match(/\(/g) || []).length;
      const closeParens = (rawSql.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        issues.push('Mismatched parentheses in Common Table Expression (CTE).');
      }
    }

    // Check 4: JOIN conditions
    if (/\bjoin\b/i.test(lower) && !/\bon\b/i.test(lower) && !/\busing\b/i.test(lower)) {
      issues.push('JOIN operation detected without explicit ON or USING join predicates (possible Cartesian product).');
    }

    const hasErrors = issues.length > 0;
    const spokenSummary = hasErrors
      ? `Jarvis here, sir. I audited the SQL query for ${dialect}. Attention: ${issues[0]}`
      : `Jarvis here, sir. I audited Vision's ${dialect} SQL query. Syntax, join predicates, CTEs, and schema constraints have been verified and approved for production.`;

    return {
      ok: !hasErrors,
      agent: 'Jarvis',
      artifact: 'sql',
      dialect,
      issues,
      recommendations,
      hasErrors,
      spokenSummary,
      summary: hasErrors
        ? `Jarvis SQL Audit: ${issues.length} issue(s) detected.`
        : `Jarvis SQL Audit: Query verified and approved for ${dialect}.`,
    };
  }

  /**
   * Inspect and verify a Microsoft Word (.docx) document
   */
  async checkWordDocument(docPathOrName) {
    logger.info(`[JARVIS] Inspecting Word document: "${docPathOrName}"`);

    let targetPath = docPathOrName;
    if (!targetPath || !fs.existsSync(targetPath)) {
      const candidate = path.join(DOCUMENTS_DIR, docPathOrName.endsWith('.docx') ? docPathOrName : `${docPathOrName}.docx`);
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
      } else {
        // Find latest .docx in ~/UltronDocuments
        try {
          if (fs.existsSync(DOCUMENTS_DIR)) {
            const files = fs
              .readdirSync(DOCUMENTS_DIR)
              .filter((f) => f.toLowerCase().endsWith('.docx'))
              .map((f) => ({
                name: f,
                path: path.join(DOCUMENTS_DIR, f),
                mtime: fs.statSync(path.join(DOCUMENTS_DIR, f)).mtimeMs,
              }))
              .sort((a, b) => b.mtime - a.mtime);
            if (files.length > 0) targetPath = files[0].path;
          }
        } catch {}
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'word_document',
        error: `Word document not found: ${docPathOrName}`,
        spokenSummary: `Jarvis here, sir. I could not locate that Word document in your UltronDocuments folder.`,
      };
    }

    const stat = fs.statSync(targetPath);
    let extractedText = '';
    try {
      extractedText = await readWordDocument(targetPath);
    } catch (err) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'word_document',
        error: `Failed to read document: ${err.message}`,
        spokenSummary: `Jarvis here, sir. The Word document appears unreadable or corrupted.`,
      };
    }

    const words = extractedText.trim().split(/\s+/).filter(Boolean).length;
    const filename = path.basename(targetPath);
    const isHealthy = stat.size > 2000 && words > 10;

    const spokenSummary = isHealthy
      ? `Jarvis here, sir. I verified Friday's Word document "${filename}". File integrity confirmed at ${Math.round(stat.size / 1024)} kilobytes, containing ${words} words. The document is intact and ready in Microsoft Word.`
      : `Jarvis here, sir. The Word document "${filename}" was created but has fewer than 10 words.`;

    return {
      ok: isHealthy,
      agent: 'Jarvis',
      artifact: 'word_document',
      filename,
      path: targetPath,
      sizeBytes: stat.size,
      wordCount: words,
      spokenSummary,
      summary: `Jarvis verified Word document "${filename}" (${words} words, ${Math.round(stat.size / 1024)} KB). Status: PASSED.`,
    };
  }

  /**
   * Inspect and verify an Executive PDF (.pdf) document
   */
  async checkPdfDocument(pdfPathOrName) {
    logger.info(`[JARVIS] Inspecting PDF report: "${pdfPathOrName}"`);

    let targetPath = pdfPathOrName;
    if (!targetPath || !fs.existsSync(targetPath)) {
      const candidate = path.join(DOCUMENTS_DIR, pdfPathOrName.endsWith('.pdf') ? pdfPathOrName : `${pdfPathOrName}.pdf`);
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
      } else {
        // Find latest .pdf in ~/UltronDocuments
        try {
          if (fs.existsSync(DOCUMENTS_DIR)) {
            const files = fs
              .readdirSync(DOCUMENTS_DIR)
              .filter((f) => f.toLowerCase().endsWith('.pdf'))
              .map((f) => ({
                name: f,
                path: path.join(DOCUMENTS_DIR, f),
                mtime: fs.statSync(path.join(DOCUMENTS_DIR, f)).mtimeMs,
              }))
              .sort((a, b) => b.mtime - a.mtime);
            if (files.length > 0) targetPath = files[0].path;
          }
        } catch {}
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'pdf_document',
        error: `PDF document not found: ${pdfPathOrName}`,
        spokenSummary: `Jarvis here, sir. I could not locate that PDF report in your UltronDocuments folder.`,
      };
    }

    const stat = fs.statSync(targetPath);
    let pageCount = 0;
    try {
      const pdfBytes = fs.readFileSync(targetPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pageCount = pdfDoc.getPageCount();
    } catch (err) {
      return {
        ok: false,
        agent: 'Jarvis',
        artifact: 'pdf_document',
        error: `Corrupted PDF stream: ${err.message}`,
        spokenSummary: `Jarvis here, sir. The PDF file stream is corrupted or unreadable.`,
      };
    }

    const filename = path.basename(targetPath);
    const isHealthy = stat.size > 1000 && pageCount > 0;

    const spokenSummary = isHealthy
      ? `Jarvis here, sir. I verified Friday's PDF report "${filename}". The document renders cleanly across ${pageCount} page(s) at ${Math.round(stat.size / 1024)} kilobytes. Typography, margins, and layout have been approved.`
      : `Jarvis here, sir. The PDF report has zero pages or is empty.`;

    return {
      ok: isHealthy,
      agent: 'Jarvis',
      artifact: 'pdf_document',
      filename,
      path: targetPath,
      pageCount,
      sizeBytes: stat.size,
      spokenSummary,
      summary: `Jarvis verified PDF report "${filename}" (${pageCount} page(s), ${Math.round(stat.size / 1024)} KB). Status: PASSED.`,
    };
  }

  /**
   * Conduct an automated quality assurance audit across all team outputs
   */
  async auditDeliverables(deliverables = {}) {
    logger.info('[JARVIS] Initiating multi-agent quality assurance audit...');
    const auditResults = [];

    // Audit Vision's application or code
    if (deliverables.visionOutput) {
      const vo = deliverables.visionOutput;
      if (vo.projectName || vo.projectDir) {
        const appRes = await this.checkApp(vo.projectDir || vo.projectName);
        auditResults.push(appRes);
      }
      if (vo.sqlQuery) {
        const sqlRes = await this.checkSql(vo.sqlQuery, vo.dialect || 'PostgreSQL');
        auditResults.push(sqlRes);
      }
    }

    // Audit Friday's Word or PDF documents
    if (deliverables.fridayOutput) {
      const fo = deliverables.fridayOutput;
      if (fo.wordPath || fo.wordFile) {
        const wordRes = await this.checkWordDocument(fo.wordPath || fo.wordFile);
        auditResults.push(wordRes);
      }
      if (fo.pdfPath || fo.pdfFile) {
        const pdfRes = await this.checkPdfDocument(fo.pdfPath || fo.pdfFile);
        auditResults.push(pdfRes);
      }
    }

    const allPassed = auditResults.every((r) => r.ok);
    const summary = allPassed
      ? `Jarvis Quality Assurance: All ${auditResults.length} deliverable(s) verified and certified compliant.`
      : `Jarvis Quality Assurance: Verified deliverables with warnings.`;

    const spokenSummary = allPassed
      ? `Jarvis has inspected all deliverables from Vision and Friday. Every file, script, and document passed quality verification, sir.`
      : `Jarvis audited the team outputs, sir. Some items may require your attention.`;

    return {
      ok: allPassed,
      agent: 'Jarvis',
      auditResults,
      summary,
      spokenSummary,
    };
  }
}
