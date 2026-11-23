import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import { openHudWindow } from './hud_server.js';
import { normalizeSpokenTranscript } from './audio.js';
import { playSongDirectly } from './music.js';
import {
  getSpokenTeamIntro,
  getVisionIntro,
  getFridayIntro,
  getJarvisIntro,
  getVeronicaIntro,
  getEdithIntro,
  getUltronIntro,
} from './agents/team_registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_DIR = path.join(__dirname, 'agents');

const APP_KEYWORDS = [
  'google chrome',
  'microsoft edge',
  'file explorer',
  'task manager',
  'snipping tool',
  'vs code',
  'vscode',
  'chrome',
  'edge',
  'notepad',
  'calculator',
  'calc',
  'paint',
  'explorer',
  'files',
  'terminal',
  'cmd',
  'powershell',
  'settings',
  'spotify',
  'whatsapp',
  'mail',
  'calendar',
  'store',
  'clock',
  'camera',
  'photos',
  'word',
  'excel',
  'powerpoint',
  'copilot',
  'phone link',
  'phonelink',
  'phone',
];

const SITE_SHORTCUTS = {
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  gmail: 'https://mail.google.com',
  calendar: 'https://calendar.google.com',
  'google calendar': 'https://calendar.google.com',
  meet: 'https://meet.google.com/new',
  'google meet': 'https://meet.google.com/new',
  github: 'https://github.com',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  reddit: 'https://www.reddit.com',
  netflix: 'https://www.netflix.com',
  amazon: 'https://www.amazon.com',
  whatsapp: 'https://web.whatsapp.com',
};

/**
 * Ultra-fast (<50ms) local command router for common single-intent computer actions.
 * Returns a spoken reply string if handled immediately, or null to let Gemini handle it.
 */
export async function tryFastPath(rawText, controller, activeAgent = 'ultron') {
  let text = String(rawText || '')
    .toLowerCase()
    .replace(
      /^(hey\s+|ok\s+|okay\s+|hi\s+|hello\s+)?(ultron|altron|jarvis|charvis|vision|vizion|vishon|vison|region|legion|vyram|revision|friday|fryday|coder|writer|doc|cypher|scribe)[\s,.:!?-]*/i,
      '',
    )
    .replace(/^(please\s+|can you\s+|could you\s+|i want you to\s+|go ahead and\s+|just\s+)/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();

  text = normalizeSpokenTranscript(text);

  // If the user simply said the wake name (e.g. "Hey Vision", "Hey Friday", "Hey Jarvis", "Hey Ultron"), reply instantly (<2ms)
  if (!text) {
    const norm = String(activeAgent || 'ultron').toLowerCase();
    if (norm === 'vision' || norm === 'coder' || norm === 'cypher') {
      return 'Yes, sir? Vision here. What web app, backend API, or SQL database are we building?';
    }
    if (norm === 'friday' || norm === 'writer' || norm === 'scribe') {
      return 'Yes, sir? Friday here. Which document or report shall I create?';
    }
    if (norm === 'jarvis' || norm === 'inspector' || norm === 'qa') {
      return 'Yes, sir? Jarvis here. What code, backend API, security audit, or document shall I inspect?';
    }
    if (norm === 'veronica' || norm === 'media' || norm === 'creative' || norm === 'video') {
      return 'Yes, sir? Veronica here. What visual assets, branding, or video loops shall I create?';
    }
    if (norm === 'edith' || norm === 'editor' || norm === 'cut' || norm === 'cutter') {
      return 'Yes, sir? Edith here. What video, reel, document, or content shall I edit?';
    }
    return 'Ultron online, sir. How can I assist you?';
  }

  // 0. Avengers Assemble Multi-Agent Roll Call
  if (/\b(?:avengers?\s+assemble|team\s+assemble|assemble\s+the\s+team|assemble|roll\s*call)\b/i.test(text)) {
    return { isRollCall: true };
  }

  // 0.1 Active Background Operations Status Inquiry
  if (/\b(?:what\s+is\s+vision\s+doing|is\s+vision\s+working|vision\s+status)\b/i.test(text)) {
    if (controller && typeof controller.getActiveTasksSummary === 'function') {
      return controller.getActiveTasksSummary('vision');
    }
    return 'Vision is on standby, sir.';
  }
  if (/\b(?:what\s+is\s+friday\s+doing|is\s+friday\s+working|friday\s+status)\b/i.test(text)) {
    if (controller && typeof controller.getActiveTasksSummary === 'function') {
      return controller.getActiveTasksSummary('friday');
    }
    return 'Friday is on standby, sir.';
  }
  if (/\b(?:what\s+is\s+jarvis\s+doing|is\s+jarvis\s+working|jarvis\s+status)\b/i.test(text)) {
    if (controller && typeof controller.getActiveTasksSummary === 'function') {
      return controller.getActiveTasksSummary('jarvis');
    }
    return 'Jarvis is on standby, sir.';
  }
  if (/\b(?:what\s+is\s+veronica\s+doing|is\s+veronica\s+working|veronica\s+status)\b/i.test(text)) {
    if (controller && typeof controller.getActiveTasksSummary === 'function') {
      return controller.getActiveTasksSummary('veronica');
    }
    return 'Veronica is on standby, sir.';
  }
  if (/\b(?:what\s+is\s+edith\s+doing|is\s+edith\s+working|edith\s+status)\b/i.test(text)) {
    if (controller && typeof controller.getActiveTasksSummary === 'function') {
      return controller.getActiveTasksSummary('edith');
    }
    return 'Edith is on standby, sir.';
  }
  if (/\b(?:what\s+is\s+(?:the\s+)?team\s+doing|what\s+are\s+(?:the\s+)?agents\s+doing|team\s+status|status\s+of\s+agents|status\s+of\s+(?:the\s+)?team|what\s+are\s+you\s+all\s+doing|who\s+is\s+working)\b/i.test(text)) {
    if (controller && typeof controller.getActiveTasksSummary === 'function') {
      return controller.getActiveTasksSummary();
    }
    return 'All operatives are currently on standby ready for your command, sir.';
  }

  // 0. Direct Agent Switching
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:vision|coder|cypher)$/i.test(text) || text === 'vision' || text === 'coder') {
    return { switchAgent: 'vision', text: 'Switching to Vision, sir. Vision standing by.' };
  }
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:friday|writer|scribe|doc|document)$/i.test(text) || text === 'friday' || text === 'writer' || text === 'doc') {
    return { switchAgent: 'friday', text: 'Switching to Friday, sir. Friday standing by.' };
  }
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:jarvis|inspector|qa)$/i.test(text) || text === 'jarvis') {
    return { switchAgent: 'jarvis', text: 'Switching to Jarvis, sir. Jarvis standing by for inspection.' };
  }
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:veronica|media|creative|visuals?)$/i.test(text) || text === 'veronica') {
    return { switchAgent: 'veronica', text: 'Switching to Veronica, sir. Veronica standing by for visual media.' };
  }
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:edith|editor|cutter)$/i.test(text) || text === 'edith' || text === 'editor') {
    return { switchAgent: 'edith', text: 'Switching to Edith, sir. Edith standing by for media and content editing.' };
  }
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:ultron|altron)$/i.test(text) || text === 'ultron') {
    return { switchAgent: 'ultron', text: 'Ultron standing by, sir.' };
  }

  // 0.1 Specialist Agent Name Inquiries
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:coding|code|programmer|developer|software|backend|sql)\s+agent|who\s+is\s+(?:the\s+)?(?:coder|vision|cypher|programmer)\s+agent|who\s+(?:writes|codes|engineers)\s+(?:the\s+)?(?:code|software|backend|api|sql)|coding\s+agent)\b/i.test(text)) {
    return 'Vision is our Chief Software Engineer and Full-Stack Backend Architect, sir. He engineers web applications, backend APIs, microservices, and SQL databases. You can talk to him directly anytime by saying "Hey Vision".';
  }
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:document|word|pdf)\s+agent|who\s+is\s+(?:the\s+)?(?:document|word|pdf)\s+agent|who\s+(?:does|handles)\s+(?:the\s+)?(?:documents?|pdf|word)|document\s+agent)\b/i.test(text)) {
    return 'Friday is our Executive Document Architect for Word and PDF documents, sir. You can talk to her directly anytime by saying "Hey Friday".';
  }
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:checking|qa|testing|audit|inspector|security)\s+agent|who\s+is\s+(?:the\s+)?(?:checking|inspector|jarvis|qa|security)\s+agent|who\s+(?:checks|audits|inspects|tests)\s+(?:the\s+)?(?:code|apps?|docs?|sql|pdf|backend|security)|checking\s+agent|security\s+agent)\b/i.test(text)) {
    return 'Jarvis is our Chief Quality Assurance Engineer & Security Inspector, sir. He audits backend APIs, security vulnerabilities, OWASP Top 10, SQL queries, and Word and PDF documents. You can talk to him directly by saying "Hey Jarvis".';
  }
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:video|image|visual|creative|media)\s+agent|who\s+is\s+(?:the\s+)?(?:video|image|visual|creative|media|veronica)\s+agent|who\s+(?:creates|makes|generates)\s+(?:the\s+)?(?:videos?|images?|visuals?|media)|visual\s+agent)\b/i.test(text)) {
    return 'Veronica is our Chief Visual Media & Generative Creative Director, sir. She creates cinematic video loops, imagery, branding, and scrollytelling visual assets. You can talk to her directly by saying "Hey Veronica".';
  }
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:editing|editor|trimming|cutter|video\s+editor)\s+agent|who\s+is\s+(?:the\s+)?(?:editor|edith|cutter)\s+agent|who\s+(?:edits|trims|cuts)\s+(?:the\s+)?(?:videos?|content|reels?|docs?|documents?)|editing\s+agent)\b/i.test(text)) {
    return 'Edith is our Chief Media & Content Editor, sir. She edits and trims videos, cuts reels and shorts, extracts audio, and polishes documents and content. You can talk to her directly anytime by saying "Hey Edith".';
  }

  // 0.2 Instant Polite Conversational Replies (< 2ms)
  if (/^(?:bye(?:\s+bye)*|goodbye|see\s+ya|see\s+you(?:\s+later)?|go\s+to\s+sleep|sleep|take\s+rest|cancel|never\s*mind|nothing|stop\s+listening|thats\s+all|that\s+is\s+all)(?:\s+(?:ultron|vision|friday|jarvis|buddy|pal|man|sir))?$/i.test(text)) {
    return 'Standing by, sir. Let me know whenever you need me.';
  }
  if (/^(thank you|thanks|thank you very much|thanks a lot|thank you so much|much appreciated|cheers)(\s+(ultron|vision|friday|jarvis|coder|writer|doc|buddy|pal|man))?$/.test(text)) {
    return 'You are welcome, sir. Let me know if you need anything else.';
  }
  if (/^(good job|nice job|great job|well done|awesome|amazing|perfect|nice work)(\s+(ultron|vision|friday|jarvis))?$/.test(text)) {
    return 'Thank you, sir. Let me know if you need anything else.';
  }
  if (/^(good morning|morning)(\s+(ultron|vision|friday|jarvis))?$/.test(text)) {
    return 'Good morning, sir. All systems are ready whenever you need me.';
  }
  if (/^(good afternoon|afternoon)(\s+(ultron|vision|friday|jarvis))?$/.test(text)) {
    return 'Good afternoon, sir. How can I assist you today?';
  }
  if (/^(good evening|evening)(\s+(ultron|vision|friday|jarvis))?$/.test(text)) {
    return 'Good evening, sir. How may I help you tonight?';
  }
  if (/^(good night|goodnight|night)(\s+(ultron|vision|friday|jarvis))?$/.test(text)) {
    return 'Good night, sir. I will remain on standby if you need anything.';
  }
  if (/^(how are you|how are you doing|how'?s it going|you good)$/.test(text)) {
    return 'Operating at peak efficiency, sir. Let me know what you need.';
  }
  if (
    /^(?:(?:are\s+you\s+)?listening|(?:can\s+you\s+)?hear\s+me|are\s+you\s+there|hello\s+are\s+you\s+there|you\s+there|(?:why\s+)?(?:are\s+you|he\s+is|is\s+he)\s+not\s+responding(?:\s+to\s+me)?|not\s+responding|are\s+you\s+online)$/i.test(text)
  ) {
    return 'I am right here and listening to you, sir. How can I assist you?';
  }
  if (/\b(?:who\s+(?:is\s+)?in\s+your\s+team|is\s+in\s+your\s+team|in\s+your\s+team|your\s+team|about\s+your\s+team|who\s+are\s+your\s+agents|tell\s+me\s+about\s+your\s+team|introduce\s+your\s+team|meet\s+your\s+team|what\s+is\s+your\s+team|your\s+agents)\b/i.test(text)) {
    return getSpokenTeamIntro();
  }
  if (/\b(?:open\s+(?:my\s+)?agents?\s+folder|show\s+(?:my\s+)?agents?|view\s+(?:my\s+)?agents?|where\s+are\s+(?:my\s+)?agents?|open\s+team\s+folder)\b/i.test(text)) {
    await controller.executeTool('open_app', { app: 'explorer.exe', arguments: `"${AGENTS_DIR}"` });
    return 'Opening your agents folder in File Explorer, sir.';
  }
  if (
    /^(who are you|who is this|what is your name|what can you do|help me|introduce yourself|tell me about yourself|what do you do|what is your role|what are your skills|what are you)$/i.test(
      text,
    )
  ) {
    const norm = String(activeAgent || 'ultron').toLowerCase();
    if (norm === 'vision' || norm === 'coder' || norm === 'cypher') return getVisionIntro();
    if (norm === 'friday' || norm === 'writer' || norm === 'scribe' || norm === 'doc') return getFridayIntro();
    if (norm === 'jarvis' || norm === 'inspector' || norm === 'qa') return getJarvisIntro();
    if (norm === 'veronica' || norm === 'media' || norm === 'creative' || norm === 'video') return getVeronicaIntro();
    if (norm === 'edith' || norm === 'editor' || norm === 'cut' || norm === 'cutter') return getEdithIntro();
    return getUltronIntro();
  }

  // 0.3 Quick Project & Document Folders
  if (/^(?:open\s+)?(?:vs\s*code|vscode|code|visual\s*studio\s*code)$/i.test(text)) {
    await controller.executeTool('open_app', { app: 'code.cmd' });
    return 'Opening VS Code, sir.';
  }
  if (/^(?:open\s+)?(?:word|microsoft\s*word|ms\s*word)$/i.test(text)) {
    await controller.executeTool('open_app', { app: 'winword.exe' });
    return 'Opening Microsoft Word, sir.';
  }
  if (/^(?:open\s+)?(?:projects|my\s*projects|ultron\s*projects|code\s*folder)$/i.test(text)) {
    const os = await import('node:os');
    const path = await import('node:path');
    const p = path.join(os.homedir(), 'UltronProjects');
    await controller.executeTool('open_app', { app: 'explorer.exe', arguments: `"${p}"` });
    return 'Opening your projects folder in File Explorer, sir.';
  }
  if (/^(?:open\s+)?(?:documents|my\s*documents|ultron\s*documents|doc\s*folder)$/i.test(text)) {
    const os = await import('node:os');
    const path = await import('node:path');
    const p = path.join(os.homedir(), 'UltronDocuments');
    await controller.executeTool('open_app', { app: 'explorer.exe', arguments: `"${p}"` });
    return 'Opening your documents folder in File Explorer, sir.';
  }

  // 0.4 Google Workspace Actions (Calendar, Google Meet, Gmail)
  if (/^(?:check(?: my)? (?:schedule|calendar|events?|agenda)|what(?:'s| is) on my (?:schedule|calendar)|open (?:my )?calendar)$/i.test(text)) {
    await controller.executeTool('open_url', { url: 'https://calendar.google.com' });
    return 'Opening your Google Calendar, sir.';
  }
  if (/^(?:start(?: a)? (?:meeting|meet|call)|new meeting|create(?: a)? (?:meeting|meet|meeting link)|open (?:google )?meet)$/i.test(text)) {
    await controller.executeTool('open_url', { url: 'https://meet.google.com/new' });
    return 'Starting an instant Google Meet session for you, sir.';
  }
  if (/^(?:check(?: my)? (?:emails?|gmail|mail|inbox)|open (?:my )?(?:gmail|emails?|inbox))$/i.test(text)) {
    await controller.executeTool('open_url', { url: 'https://mail.google.com' });
    return 'Opening your Gmail inbox, sir.';
  }
  if (/^(?:compose(?: an?)? (?:email|mail)|new email|write(?: an?)? email)$/i.test(text)) {
    await controller.executeTool('open_url', { url: 'https://mail.google.com/mail/u/0/#inbox?compose=new' });
    return 'Opening a new draft in Gmail, sir.';
  }

  // 0.25 Call Mode & In-Call Mute Protection (<2ms)
  const callMuteMatch = text.match(
    /^(?:i(?:'m| am) (?:on|in) (?:a )?call|i(?:'m| am) in (?:a )?meeting|call mode(?: on)?|meeting mode(?: on)?|do not disturb(?: mode)?|mute(?:\s+for\s+(\d+)\s*(?:minutes?|mins?))?)$/i,
  );
  if (callMuteMatch) {
    const mins = callMuteMatch[1] ? Number.parseInt(callMuteMatch[1], 10) : 0;
    if (controller && typeof controller.callModeHandler === 'function') {
      controller.callModeHandler(true, mins);
    }
    return mins > 0
      ? `Call mode activated. Muting all operatives for ${mins} minutes so you are not disturbed, sir.`
      : 'Call mode activated. All operatives are muted so you will not be disturbed, sir. Say unmute or double-click the tray icon when your call finishes.';
  }

  if (
    /^(?:unmute|call (?:is )?(?:over|done|ended)|meeting (?:is )?(?:over|done|ended)|i(?:'m| am) back|i have returned|cancel mute)$/i.test(
      text,
    )
  ) {
    if (controller && typeof controller.callModeHandler === 'function') {
      controller.callModeHandler(false);
    }
    return 'Welcome back, sir. All operatives are active and standing by.';
  }

  // 0.3 Phone Calling Fastpath (<50ms)
  if (/^(?:call (?:my )?phone|call me|ring (?:my )?phone|phone me)$/i.test(text)) {
    const res = await controller.makePhoneCall();
    if (res.ok) {
      return res.message;
    }
    return 'I need your phone number, sir. Please set USER_PHONE_NUMBER in dot env, or say call followed by your number.';
  }

  const callMatch = text.match(/^(?:call|dial|ring|phone)\s+([+\d\s\-()]{7,18})$/i);
  if (callMatch) {
    const res = await controller.makePhoneCall(callMatch[1].trim());
    return res.ok ? res.message : `Could not place the call, sir: ${res.error}`;
  }

  // 0.35 Direct "Open that and write that" ("open notepad and write hello world", "open word and write my essay")
  const openAndWriteMatch = text.match(
    /^(?:open|launch)\s+([a-zA-Z0-9\s]+?)\s+(?:and\s+)?(?:write|type|note|paste)(?:\s+(?:down|that|in|saying))?\s+(.+)$/i,
  );
  if (openAndWriteMatch) {
    const appTarget = openAndWriteMatch[1].trim();
    const textToWrite = openAndWriteMatch[2].trim();
    if (appTarget && textToWrite) {
      logger.info(`[FAST] Open and write direct: App="${appTarget}", Text="${textToWrite}"`);
      await controller.openAndWrite(appTarget, textToWrite, true);
      const appName = appTarget.charAt(0).toUpperCase() + appTarget.slice(1);
      return `Opened ${appName} and wrote that down for you, sir.`;
    }
  }

  // 0.36 Direct Typing into currently active window ("write that hello world", "type that meeting at 3pm")
  const typeOnlyMatch = text.match(
    /^(?:type|write)\s+(?:that|down|saying|text|message)\s+(.+)$/i,
  );
  if (typeOnlyMatch) {
    const textToWrite = typeOnlyMatch[1].trim();
    if (textToWrite) {
      logger.info(`[FAST] Type into active window: "${textToWrite}"`);
      await controller.typeActiveWindow(textToWrite, true);
      return 'Typed that for you, sir.';
    }
  }

  // 0.37 Direct Song & Music Playback ("play this song Believer", "play Ashke by Karan Aujla", "pay ashke", "put on Starboy")
  let songMatch = text.match(
    /^(?:play|pay|plea|ply|stream|put\s+on|listen\s+to|start)(?:\s+(?:this|the))?(?:\s+(?:song|track|music))?(?:\s+(?:called|named|by))?\s+(.+)$/i,
  );
  if (
    !songMatch &&
    /\bby\s+(?:karan\s+aujla|sidhu\s+moose|diljit\s+dosanjh|ap\s+dhillon|arijit\s+singh|shubh|badshah)\b/i.test(
      text,
    )
  ) {
    songMatch = [text, text];
  }
  if (songMatch) {
    const rawQuery = songMatch[1].trim();
    const isSimpleMediaControl =
      /^(?:pause|play|music|media|video|song|track|sound|audio|next|previous)$/i.test(rawQuery);

    if (!isSimpleMediaControl) {
      let songClean = normalizeSpokenTranscript(rawQuery);
      let platform = 'youtube';

      if (/\s+on\s+spotify$/i.test(songClean) || /^on\s+spotify\s+/i.test(songClean)) {
        platform = 'spotify';
        songClean = songClean
          .replace(/^on\s+spotify\s+/i, '')
          .replace(/\s+on\s+spotify$/i, '')
          .trim();
      } else if (/\s+on\s+(?:youtube|yt)$/i.test(songClean) || /^on\s+(?:youtube|yt)\s+/i.test(songClean)) {
        platform = 'youtube';
        songClean = songClean
          .replace(/^on\s+(?:youtube|yt)\s+/i, '')
          .replace(/\s+on\s+(?:youtube|yt)$/i, '')
          .trim();
      }

      logger.info(`[FAST] Direct song playback requested: "${songClean}" on ${platform}`);
      const playRes = await playSongDirectly(songClean, controller, platform);
      return playRes.reply || `Playing ${songClean} directly for you, sir.`;
    }
  }

  // 0.38 Direct Word Document Editing ("edit word document project proposal and add conclusion", "edit test.docx and write summary", "update notes with meeting agenda")
  const editDocMatch = text.match(
    /^(?:open\s+and\s+)?(?:edit|update|modify|change)\s+(?:the\s+)?(?:word\s+)?(?:document\s+|doc\s+|file\s+)?(.+?)\s+(?:and\s+)?(?:add|append|write|type|include|put|insert|note|with)(?:\s+(?:a\s+section|section|paragraph|heading|down|saying|that))?\s+(.+)$/i,
  );
  if (editDocMatch) {
    const docQuery = editDocMatch[1].trim();
    const editInstruction = editDocMatch[2].trim();
    if (docQuery && editInstruction && !/^(?:app|code|setting|file|it)$/i.test(docQuery)) {
      logger.info(`[FAST] Word document edit: Doc="${docQuery}", Content="${editInstruction}"`);
      const out = JSON.parse(
        (await controller.executeTool('delegate_to_scribe', {
          action: 'edit',
          document_name: docQuery,
          edit_instructions: editInstruction,
          prompt: `Edit document ${docQuery}: ${editInstruction}`,
        })).text,
      );
      if (out.ok) {
        return out.summary || `I have edited "${out.filename || docQuery}" and opened it in Microsoft Word, sir.`;
      }
      return out.error || `I could not update ${docQuery}, sir.`;
    }
  }

  // 0.39 Direct "Add [content] to [document]"
  const addToDocMatch = text.match(
    /^(?:add|append|insert)\s+(.+?)\s+to\s+(?:the\s+)?(?:word\s+)?(?:document\s+|doc\s+|file\s+)?(.+)$/i,
  );
  if (addToDocMatch) {
    const editInstruction = addToDocMatch[1].trim();
    const docQuery = addToDocMatch[2].trim();
    if (docQuery && editInstruction && !/^(?:app|queue|list|cart|favorite|playlist)$/i.test(docQuery)) {
      logger.info(`[FAST] Add to Word document: Doc="${docQuery}", Content="${editInstruction}"`);
      const out = JSON.parse(
        (await controller.executeTool('delegate_to_scribe', {
          action: 'edit',
          document_name: docQuery,
          edit_instructions: editInstruction,
          prompt: `Add to document ${docQuery}: ${editInstruction}`,
        })).text,
      );
      if (out.ok) {
        return out.summary || `I have added that to "${out.filename || docQuery}" and opened it in Word, sir.`;
      }
      return out.error || `I could not update ${docQuery}, sir.`;
    }
  }

  // 0.40 Direct Open Document ("open word document project proposal", "open document notes")
  const openDocMatch = text.match(
    /^(?:open|launch)\s+(?:the\s+)?(?:word\s+)?(?:document\s+|doc\s+|file\s+)(.+)$/i,
  );
  if (openDocMatch) {
    const docQuery = openDocMatch[1].trim();
    if (docQuery && !APP_KEYWORDS.includes(docQuery.toLowerCase())) {
      logger.info(`[FAST] Open Word document: "${docQuery}"`);
      const out = JSON.parse(
        (await controller.executeTool('word_document_manager', {
          operation: 'open',
          file_path: docQuery,
        })).text,
      );
      if (out.ok) {
        return `Opened ${path.basename(out.path)} in Microsoft Word, sir.`;
      }
    }
  }

  // 0.41 Direct Edit Document Only ("edit word document project proposal", "edit document notes")
  const editDocOnlyMatch = text.match(
    /^(?:open\s+and\s+)?(?:edit|update)\s+(?:the\s+)?(?:word\s+)?(?:document\s+|doc\s+|file\s+)(.+)$/i,
  );
  if (editDocOnlyMatch) {
    const docQuery = editDocOnlyMatch[1].trim();
    if (
      docQuery &&
      !APP_KEYWORDS.includes(docQuery.toLowerCase()) &&
      !/^(?:code|app|setting|profile)$/i.test(docQuery)
    ) {
      logger.info(`[FAST] Open and edit document: "${docQuery}"`);
      const out = JSON.parse(
        (await controller.executeTool('word_document_manager', {
          operation: 'open',
          file_path: docQuery,
        })).text,
      );
      if (out.ok) {
        return `I have opened "${path.basename(out.path)}" in Microsoft Word, sir. What changes or additions would you like me to make?`;
      }
    }
  }

  // Do NOT intercept other complex multi-step code generation or orchestration commands
  if (/\b(and then|and close)\b/i.test(text)) {
    return null;
  }

  // 1. Time / Date / Battery (instant local check)
  if (/^(what('?s| is) the time|what time is it|tell me the time|current time)$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('get_system_info', {})).text);
    if (out.ok) return `It's ${out.time}, sir.`;
  }

  if (/^(what('?s| is) (the |today'?s )?date|what day is (it|today))$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('get_system_info', {})).text);
    if (out.ok) return `Today is ${out.date}, sir.`;
  }

  if (/^(what('?s| is) (my )?battery|battery( percentage| level| status)?|check battery)$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('get_system_info', {})).text);
    if (out.ok) {
      return `Battery is at ${out.batteryPercent} percent${out.pluggedIn ? ' and plugged in' : ' on battery power'}, sir.`;
    }
  }

  // 2. Compound Video & Playback Controls (<3ms)
  // E.g., "full screen this and resume this video", "fullscreen and play", "resume this video and fullscreen"
  const isFullscreenAction =
    /\b(?:fullscreen|full\s+screen)\b/i.test(text) &&
    !/\b(?:exit|leave|close|escape|un|stop|quit)\s*(?:fullscreen|full\s+screen)\b/i.test(text);
  const isExitFullscreenAction =
    /\b(?:exit|leave|close|escape|un|stop|quit)\s*(?:fullscreen|full\s+screen)\b/i.test(text) ||
    /\b(?:minimize|restore)\s+(?:from\s+)?(?:fullscreen|full\s+screen)\b/i.test(text);
  const isPlayResumeAction =
    /\b(?:resume|unpause|play|continue)\b/i.test(text) &&
    !/\b(?:pause|stop)\b/i.test(text);
  const isPauseAction =
    /\b(?:pause|stop)\b/i.test(text) &&
    !/\b(?:resume|unpause|play|continue)\b/i.test(text);

  if (
    isFullscreenAction &&
    (isPlayResumeAction || isPauseAction) &&
    text.split(/\s+/).length <= 12 &&
    !/\b(?:search|find|google|look\s+up|create|write|code|document)\b/i.test(text)
  ) {
    logger.info(`[FAST] Compound video action: Fullscreen + ${isPlayResumeAction ? 'Play/Resume' : 'Pause'} ("${text}")`);
    await controller.executeTool('control_media_volume', { command: 'fullscreen' });
    await new Promise((r) => setTimeout(r, 60));
    await controller.executeTool('control_media_volume', { command: 'play_pause' });
    return isPlayResumeAction
      ? 'Fullscreen toggled and video resumed, sir.'
      : 'Fullscreen toggled and video paused, sir.';
  }

  if (
    isExitFullscreenAction &&
    (isPlayResumeAction || isPauseAction) &&
    text.split(/\s+/).length <= 12 &&
    !/\b(?:search|find|google|look\s+up|create|write|code|document)\b/i.test(text)
  ) {
    logger.info(`[FAST] Compound video action: Exit Fullscreen + ${isPlayResumeAction ? 'Play/Resume' : 'Pause'} ("${text}")`);
    await controller.executeTool('control_media_volume', { command: 'exit_fullscreen' });
    await new Promise((r) => setTimeout(r, 60));
    await controller.executeTool('control_media_volume', { command: 'play_pause' });
    return isPlayResumeAction
      ? 'Exited fullscreen and video resumed, sir.'
      : 'Exited fullscreen and video paused, sir.';
  }

  // 2b. Volume & Single Media Controls
  if (/^(volume up|turn (up|the volume up)|increase( the)? volume|louder)$/.test(text)) {
    await controller.executeTool('control_media_volume', { command: 'volume_up', steps: 5 });
    return 'Volume up, sir.';
  }
  if (/^(volume down|turn (down|the volume down)|decrease( the)? volume|lower( the)? volume|quieter)$/.test(text)) {
    await controller.executeTool('control_media_volume', { command: 'volume_down', steps: 5 });
    return 'Volume down, sir.';
  }
  if (/^(mute|unmute|mute( the)? volume|toggle mute)$/.test(text)) {
    await controller.executeTool('control_media_volume', { command: 'mute' });
    return 'Toggled mute, sir.';
  }
  if (
    /^(?:pause|play|play\s+pause|unpause|resume|continue)(?:\s+(?:the|this|that|my))?(?:\s+(?:music|video|media|playback|song|track|stream|movie))?$/i.test(text) ||
    /^(?:toggle\s+)?(?:play\s+pause|playback)$/i.test(text)
  ) {
    await controller.executeTool('control_media_volume', { command: 'play_pause' });
    return 'Done, sir.';
  }
  if (/^(next( track| song| video)?|skip( song| track)?)$/.test(text)) {
    await controller.executeTool('control_media_volume', { command: 'next_track' });
    return 'Next track, sir.';
  }
  if (/^(previous( track| song)?|last song|go back( a)? song)$/.test(text)) {
    await controller.executeTool('control_media_volume', { command: 'prev_track' });
    return 'Previous track, sir.';
  }

  // 2a. Instant Video & Browser Fullscreen Controls ("fullscreen this video", "fullscreen", "full screen", "exit fullscreen")
  if (
    /^(?:fullscreen|full\s+screen)(?:\s+(?:this|the|that))?(?:\s+(?:video|window|screen|movie|clip|stream|tab|player))?$/i.test(text) ||
    /^(?:make|toggle|go|set|put)(?:\s+(?:this|the|it|that))?(?:\s+(?:video|window|screen|player))?(?:\s+(?:in|into|to))?\s+(?:fullscreen|full\s+screen)$/i.test(text) ||
    /^(?:video\s+)?(?:fullscreen|full\s+screen)$/i.test(text)
  ) {
    logger.info('[FAST] Toggling video fullscreen');
    await controller.executeTool('control_media_volume', { command: 'fullscreen' });
    return 'Fullscreen toggled, sir.';
  }
  if (
    /^(?:exit|leave|close|escape|un|stop|quit)\s*(?:fullscreen|full\s+screen)$/i.test(text) ||
    /^(?:minimize|restore)\s+(?:from\s+)?(?:fullscreen|full\s+screen)$/i.test(text)
  ) {
    logger.info('[FAST] Exiting fullscreen');
    await controller.executeTool('control_media_volume', { command: 'exit_fullscreen' });
    return 'Exited fullscreen, sir.';
  }
  if (/^(?:theater|theatre)\s+mode$/i.test(text)) {
    logger.info('[FAST] Toggling theater mode');
    await controller.executeTool('control_media_volume', { command: 'theater_mode' });
    return 'Theater mode toggled, sir.';
  }
  if (/^(?:browser\s+fullscreen|fullscreen\s+browser|f11)$/i.test(text)) {
    logger.info('[FAST] Toggling browser fullscreen');
    await controller.executeTool('control_media_volume', { command: 'fullscreen_browser' });
    return 'Browser fullscreen toggled, sir.';
  }

  // 2b. Reels Mode / Media Noise Guard ("reels mode on", "watching reels", "ignore background reels", "reels mode off")
  if (
    /^(?:reels?|media)\s+mode(?:\s+(?:on|active|start|enable))?$/i.test(text) ||
    /^(?:(?:i'?m|i\s+am)\s+)?(?:watching|viewing|seeing|playing|scrolling)\s+reels?$/i.test(text) ||
    /^(?:reels?\s+mode)$/i.test(text) ||
    /^(?:ignore\s+reels?|ignore\s+background\s+(?:voices?|media|reels?))$/i.test(text)
  ) {
    if (typeof controller.setReelMode === 'function') {
      controller.setReelMode(true, 60);
    }
    return 'Reels mode activated, sir. I will strictly ignore background voices, phone audio, and media while you watch reels.';
  }
  if (
    /^(?:reels?|media)\s+mode\s+(?:off|disable|stop)$/i.test(text) ||
    /^(?:exit|disable|stop|turn off)\s+(?:reels?|media)\s+mode$/i.test(text) ||
    /^(?:normal|standard)\s+mode$/i.test(text)
  ) {
    if (typeof controller.setReelMode === 'function') {
      controller.setReelMode(false);
    }
    return 'Reels mode deactivated, sir. Standard wake detection restored.';
  }

  // 3. Window / Desktop / Lock controls
  if (/^(show desktop|minimize all( windows)?|hide all windows)$/.test(text)) {
    await controller.executeTool('manage_windows', { operation: 'show_desktop' });
    return 'Showing desktop, sir.';
  }
  if (/^(lock( my| the)? (computer|pc|screen|laptop))$/.test(text)) {
    await controller.executeTool('manage_windows', { operation: 'lock_screen' });
    return 'Locking your PC, sir.';
  }

  // 4. Explicit Web Searches (ONLY when user explicitly asks to open browser/YouTube)
  const ytPlayMatch = text.match(/^(?:play on youtube|watch on youtube)\s+(.+)$/i);
  if (ytPlayMatch) {
    const q = ytPlayMatch[1].trim();
    const playRes = await playSongDirectly(q, controller, 'youtube');
    return playRes.reply || `Playing ${q} directly on YouTube, sir.`;
  }

  const ytSearchMatch = text.match(/^(?:open youtube and search (?:for )?|search on youtube (?:for )?)\s+(.+)$/i);
  if (ytSearchMatch) {
    const q = ytSearchMatch[1].trim();
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    await controller.executeTool('open_url', { url });
    return `Opening YouTube search for ${q}, sir.`;
  }

  const browserSearchMatch = text.match(/^(?:open (?:the )?browser and search (?:for )?|open google and search (?:for )?)\s+(.+)$/);
  if (browserSearchMatch) {
    const q = browserSearchMatch[1].trim();
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    await controller.executeTool('open_url', { url });
    return `Searching Google for ${q} in your browser, sir.`;
  }

  // 4b. Jarvis Backend & Security Audit commands ("check the backend", "run a security check", "check backend security", "audit security")
  const securityMatch = text.match(
    /^(?:check(?: the)? backend(?: security)?|run(?: a)? security (?:check|audit)(?: on (.+))?|audit(?: the)? backend(?: security)?(?: for (.+))?|check security(?: of (.+))?)$/i,
  );
  if (securityMatch) {
    const target = (securityMatch[1] || securityMatch[2] || securityMatch[3] || '').trim();
    logger.info(`[FAST] Jarvis backend security check: "${target || 'latest'}"`);
    const out = JSON.parse(
      (await controller.executeTool('delegate_to_jarvis', { action: 'audit_backend', target })).text,
    );
    return out.spokenSummary || out.summary || 'Security audit complete, sir.';
  }

  // 4c. Ultron Holographic HUD Window Controls ("open UI", "show HUD", "open dashboard", "hide UI", "close HUD")
  if (/^(?:open|show|launch)(?: the)? (?:ui|hud|dashboard|interface|hologram|holographic hud)$/i.test(text)) {
    openHudWindow();
    return 'Opening Ultron Holographic HUD on your desktop, sir.';
  }
  if (/^(?:close|hide|minimize)(?: the)? (?:ui|hud|dashboard|interface|hologram|holographic hud)$/i.test(text)) {
    if (controller.hudServer) {
      controller.hudServer.broadcast('minimize_hud', {});
    }
    return 'Hiding HUD, sir. Ultron is running 24/7 in the background and standing by for your voice commands.';
  }

  // 5. Open Apps or Popular Websites
  const openMatch = text.match(/^(?:open|launch|start|run)\s+(?:the\s+)?(.+)$/);
  if (openMatch) {
    const target = openMatch[1].trim();
    if (APP_KEYWORDS.includes(target)) {
      logger.info(`[FAST] Launching app "${target}"`);
      const out = JSON.parse((await controller.executeTool('open_app', { app: target })).text);
      if (out.ok) return `Opened ${target}, sir.`;
    }
    if (SITE_SHORTCUTS[target]) {
      logger.info(`[FAST] Opening site "${target}"`);
      const out = JSON.parse((await controller.executeTool('open_url', { url: SITE_SHORTCUTS[target] })).text);
      if (out.ok) return `Opening ${target}, sir.`;
    }
  }

  // 5b. WhatsApp Messaging ("open whatsapp search John and message him hello", "send whatsapp message to mom saying i will be home late")
  const waMatch =
    text.match(
      /^(?:open\s+whatsapp\s+)?search\s+([a-zA-Z0-9\s+]+?)\s+(?:and\s+)?(?:message|tell|send|text)(?:\s+(?:her|him|them|to))?\s+(?:that\s+|saying\s+)?(.+)$/i,
    ) ||
    text.match(
      /^(?:send\s+(?:an?\s+)?whatsapp(?:\s+message)?\s+to\s+)([a-zA-Z0-9\s+]+?)\s+(?:saying|that|with message)\s+(.+)$/i,
    ) ||
    text.match(
      /^(?:message|text)\s+([a-zA-Z0-9\s+]+?)\s+on\s+whatsapp\s+(?:saying\s+|that\s+)?(.+)$/i,
    ) ||
    text.match(
      /^whatsapp\s+([a-zA-Z0-9\s+]+?)\s+(?:that\s+|saying\s+)?(.+)$/i,
    );

  if (waMatch) {
    const contact = waMatch[1].trim();
    const msg = waMatch[2].trim();
    if (contact && msg) {
      logger.info(`[FAST] WhatsApp message to "${contact}": "${msg}"`);
      await controller.executeTool('send_whatsapp_message', { contact, message: msg });
      return `Sending WhatsApp message to ${contact}, sir: "${msg}".`;
    }
  }

  // 6. Quick Timers ("set a timer for 5 minutes", "remind me in 30 seconds to stretch")
  const timerMatch = text.match(
    /^(?:set(?: a)? timer for|remind me in)\s+(\d+)\s+(second|seconds|sec|minute|minutes|min|hour|hours|hr)(?:\s+(?:to|for)\s+(.+))?$/,
  );
  if (timerMatch) {
    const num = Number.parseInt(timerMatch[1], 10);
    const unit = timerMatch[2];
    const label = (timerMatch[3] || `${num} ${unit} timer`).trim();
    const mult = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1;
    await controller.executeTool('set_timer', { seconds: num * mult, label });
    return `Timer set for ${num} ${unit}, sir.`;
  }

  // 7. Screen Brightness Control
  if (/^(brightness up|increase( the)? brightness|make( the)? screen brighter|brighter)$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('screen_brightness', { operation: 'up' })).text);
    return out.ok ? `${out.message}, sir.` : 'Sorry sir, I could not adjust brightness on this screen.';
  }
  if (/^(brightness down|decrease( the)? brightness|lower( the)? brightness|dim( the)? screen)$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('screen_brightness', { operation: 'down' })).text);
    return out.ok ? `${out.message}, sir.` : 'Sorry sir, I could not adjust brightness on this screen.';
  }
  const brightSet = text.match(/^(?:set(?: the)? )?brightness(?: to)? (\d{1,3})\s*(?:%|percent)?$/);
  if (brightSet) {
    const level = Math.max(0, Math.min(100, Number.parseInt(brightSet[1], 10)));
    const out = JSON.parse((await controller.executeTool('screen_brightness', { operation: 'set', level })).text);
    return out.ok ? `${out.message}, sir.` : 'Sorry sir, I could not adjust brightness on this screen.';
  }

  // 8. Save Screenshot
  if (/^(take|save|capture)( a)? screenshot( to desktop| on desktop)?$/.test(text)) {
    const folder = text.includes('desktop') ? 'desktop' : 'screenshots';
    const out = JSON.parse((await controller.executeTool('save_screenshot', { folder })).text);
    return out.ok ? `Screenshot saved to your ${folder}, sir.` : 'Sorry sir, I could not capture the screenshot.';
  }

  // 9. Quick Personal Notes / To-Do List
  const noteAdd = text.match(/^(?:note down|take a note|save a note|add to my notes|add to my to do list|add to my todo list)\s+(.+)$/);
  if (noteAdd) {
    const entry = noteAdd[1].trim();
    await controller.executeTool('notes_manager', { operation: 'add', text: entry });
    return `Noted, sir. I saved ${entry}.`;
  }
  if (/^(read my notes|what are my notes|show my notes|check my notes|read my to do list)$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('notes_manager', { operation: 'read' })).text);
    if (out.ok) {
      if (out.notes === 'No notes saved yet.') return 'You have no saved notes yet, sir.';
      const lines = out.notes.split(/\r?\n/).slice(-5).map((l) => l.replace(/^-\s*\[[^\]]+\]\s*/, ''));
      return `Here are your latest notes, sir: ${lines.join('. ')}.`;
    }
  }

  // 10. Live Weather
  const weatherMatch = text.match(/^(?:what'?s|what is|check|tell me)(?: the)? weather(?: in (.+))?$/);
  if (weatherMatch) {
    const city = (weatherMatch[1] || '').trim();
    const out = JSON.parse((await controller.executeTool('get_weather_and_web', { city })).text);
    if (out.ok && out.weather) {
      return `Current weather for ${out.weather}, sir.`;
    }
  }

  // 11. Word Documents Fast Check
  if (/^(list (my )?word documents|what are my word documents|show (my )?word documents)$/.test(text)) {
    const out = JSON.parse((await controller.executeTool('word_document_manager', { operation: 'list' })).text);
    if (out.ok && out.documents && out.documents.length > 0) {
      const names = out.documents.slice(0, 3).map((d) => d.name).join(', ');
      return `You have ${out.documents.length} Word documents in your Ultron folder, sir. Recent ones include: ${names}.`;
    }
    return 'You do not have any Word documents saved in your Ultron folder yet, sir.';
  }

  return null;
}
