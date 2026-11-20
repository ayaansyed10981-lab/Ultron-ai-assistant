/**
 * Ultron Multi-Agent Team Registry
 * Supreme Leader: Ultron
 * Subordinate Specialists: Vision (Code & SQL), Friday (Word & PDF), Sentinel (System)
 */

export const ULTRON_TEAM = {
  leader: {
    id: 'ultron',
    name: 'Ultron',
    title: 'Supreme Commander & Voice Interface',
    description:
      'Coordinates all specialized agents, analyzes user voice requests, delegates tasks, synthesizes outputs, controls the Windows PC, and delivers concise spoken briefings to the user.',
    avatar: '⚡',
  },
  specialists: {
    vision: {
      id: 'vision',
      name: 'Vision',
      alias: 'Coder',
      wakeWords: ['Hey Vision', 'Vision', 'Hey Coder', 'Coder', 'Hey Cypher', 'Cypher', 'Hey Code'],
      title: 'Chief Software Engineer & SQL Database Architect',
      description:
        'Specialized in writing complete code projects, full-stack applications, scripts, and designing, optimizing, and executing complex SQL queries (PostgreSQL, MySQL, SQLite, SQL Server).',
      skills: [
        'Full-Stack Code Development (Python, JS, TS, HTML/CSS, C++, Go, Rust, PowerShell)',
        'Complex SQL Queries (Window functions, CTEs, Multi-table JOINs, Aggregates, Subqueries)',
        'Database Schema Architecture (DDL, Foreign Keys, Indexes, Constraints, Migrations)',
        'Code Refactoring, Debugging, and Query Optimization',
        'Autonomous Project Generation in ~/UltronProjects',
      ],
      avatar: '💻',
    },
    friday: {
      id: 'friday',
      name: 'Friday',
      alias: 'Writer / Doc',
      wakeWords: ['Hey Friday', 'Friday', 'Hey Writer', 'Writer', 'Hey Doc', 'Doc', 'Hey Scribe', 'Scribe'],
      title: 'Executive Document Architect & Technical Writer',
      description:
        'Specialized in autonomously drafting, formatting, styling, and summarizing Microsoft Word (.docx) documents and PDF (.pdf) reports with executive tables, headers, and bullet points.',
      skills: [
        'Microsoft Word (.docx) Generation & Formatting with Office Integration',
        'Executive PDF (.pdf) Document Creation with Title Banners & Typography',
        'Document Reading, Extraction, Summarization, and Text Search',
        'Technical Specifications, Business Proposals, Contracts, and Resumes',
        'Autonomous Document Storage in ~/UltronDocuments',
      ],
      avatar: '📄',
    },
    jarvis: {
      id: 'jarvis',
      name: 'Jarvis',
      alias: 'Inspector / QA',
      wakeWords: ['Hey Jarvis', 'Jarvis', 'Okay Jarvis'],
      title: 'Chief Quality Assurance Engineer & System Inspector',
      description:
        'Specialized in checking, auditing, testing, and verifying Vision\'s web apps, code, and SQL queries, as well as Friday\'s Word (.docx) and PDF (.pdf) documents.',
      skills: [
        'Web Application & Code Syntax Verification in ~/UltronProjects',
        'SQL Database Query & Schema Safety Audit (CTEs, joins, index safety)',
        'Microsoft Word (.docx) Structure & Format Verification in ~/UltronDocuments',
        'PDF (.pdf) Layout, Typography & Page Stream Inspection',
        'Multi-Agent Quality Assurance Certification',
      ],
      avatar: '🔍',
    },
    sentinel: {
      id: 'sentinel',
      name: 'Sentinel',
      title: 'System Operator & Hardware Guardian',
      description:
        'Specialized in Windows 11 hardware automation, telemetry (battery, RAM, disk, brightness, volume), process control, and screen vision.',
      skills: [
        'System Telemetry & Hardware Control',
        'Window Management & App Automation',
        'Screen Vision & Screenshot Analysis',
        'Timers & Scheduled Reminders',
      ],
      avatar: '🛡️',
    },
  },
};

export function getTeamSummary() {
  const leader = ULTRON_TEAM.leader;
  const specialists = Object.values(ULTRON_TEAM.specialists);

  const lines = [
    `Team Leader: ${leader.name} (${leader.title})`,
    'Specialist Operatives:',
  ];

  for (const s of specialists) {
    lines.push(`- ${s.name}: ${s.title}`);
  }

  return lines.join('\n');
}

export function getSpokenTeamIntro() {
  return (
    'I command our specialized AI operative team, sir. ' +
    'Vision is our Chief Software Engineer and SQL Database Architect. You can talk to him directly anytime by saying "Hey Vision". ' +
    'Friday is our Executive Document Architect for Word documents and PDF reports. You can talk to her directly anytime by saying "Hey Friday". ' +
    'Jarvis is our Chief Quality Assurance Engineer, auditing and verifying all code, SQL, Word, and PDF documents. You can talk to him directly anytime by saying "Hey Jarvis". ' +
    'And I am Ultron, commanding your PC and system control. You can speak to any of us individually, or command all of us to execute simultaneously whenever you wish.'
  );
}

export function getVisionIntro() {
  return 'I am Vision, your Chief Software Engineer and SQL Database Architect, sir. Tell me what software you want to build or what SQL query you need.';
}

export function getFridayIntro() {
  return 'I am Friday, your Executive Document Architect, sir. Tell me what Word document or PDF report you would like me to create.';
}

export function getJarvisIntro() {
  return 'I am Jarvis, your Chief Quality Assurance Engineer and System Inspector, sir. Tell me which application, SQL query, Word document, or PDF report you would like me to audit and verify.';
}

export function getUltronIntro() {
  return 'I am Ultron, Supreme Commander of your personal multi-agent AI team, sir. I lead Vision for software and SQL, Friday for Word and PDF documents, Jarvis for quality assurance and verification, and Sentinel for PC control.';
}
