import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';
import {
  getSpokenTeamIntro,
  getVisionIntro,
  getFridayIntro,
  getJarvisIntro,
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
];

const SITE_SHORTCUTS = {
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  gmail: 'https://mail.google.com',
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

  // If the user simply said the wake name (e.g. "Hey Vision", "Hey Friday", "Hey Jarvis", "Hey Ultron"), reply instantly (<2ms)
  if (!text) {
    const norm = String(activeAgent || 'ultron').toLowerCase();
    if (norm === 'vision' || norm === 'coder' || norm === 'cypher') {
      return 'Yes, sir? Vision here. What are we building or querying?';
    }
    if (norm === 'friday' || norm === 'writer' || norm === 'scribe') {
      return 'Yes, sir? Friday here. Which document or report shall I create?';
    }
    if (norm === 'jarvis' || norm === 'inspector' || norm === 'qa') {
      return 'Yes, sir? Jarvis here. What code, query, or document shall I inspect?';
    }
    return 'Ultron online, sir. How can I assist you?';
  }

  // 0. Avengers Assemble Multi-Agent Roll Call
  if (/\b(?:avengers?\s+assemble|team\s+assemble|assemble\s+the\s+team|assemble|roll\s*call)\b/i.test(text)) {
    return { isRollCall: true };
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
  if (/^(?:switch\s+to|talk\s+to|speak\s+to|connect\s+me\s+to|call)\s+(?:ultron|altron)$/i.test(text) || text === 'ultron') {
    return { switchAgent: 'ultron', text: 'Ultron standing by, sir.' };
  }

  // 0.1 Specialist Agent Name Inquiries
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?coding\s+agent|who\s+is\s+(?:the\s+)?coding\s+agent|who\s+(?:does|handles)\s+(?:the\s+)?coding|coding\s+agent)\b/i.test(text)) {
    return 'Vision is our Chief Software Engineer and SQL Database Architect, sir. You can talk to him directly anytime by saying "Hey Vision".';
  }
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:document|word|pdf)\s+agent|who\s+is\s+(?:the\s+)?(?:document|word|pdf)\s+agent|who\s+(?:does|handles)\s+(?:the\s+)?(?:documents?|pdf|word)|document\s+agent)\b/i.test(text)) {
    return 'Friday is our Executive Document Architect for Word and PDF documents, sir. You can talk to her directly anytime by saying "Hey Friday".';
  }
  if (/\b(?:(?:who|what)\s+(?:is\s+)?(?:the\s+)?name\s+of\s+(?:the\s+)?(?:checking|qa|testing|audit|inspector)\s+agent|who\s+is\s+(?:the\s+)?(?:checking|inspector|jarvis|qa)\s+agent|who\s+(?:checks|audits|inspects|tests)\s+(?:the\s+)?(?:code|apps?|docs?|sql|pdf)|checking\s+agent)\b/i.test(text)) {
    return 'Jarvis is our Chief Quality Assurance Engineer & System Inspector, sir. He audits Vision\'s applications and SQL queries, as well as Friday\'s Word and PDF documents. You can talk to him directly by saying "Hey Jarvis".';
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

  // Do NOT intercept multi-step commands ("open notepad and type...") — let Gemini chain those
  if (/\b(and then|and type|and write|and search|and play|and close)\b/i.test(text)) {
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

  // 2. Volume & Media Controls
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
  if (/^(pause|play|play pause|pause( the)? (music|video|media)|resume( the)? (music|video|media))$/.test(text)) {
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
  const ytMatch = text.match(/^(?:open youtube and search (?:for )?|play on youtube)\s+(.+)$/);
  if (ytMatch) {
    const q = ytMatch[1].trim();
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    await controller.executeTool('open_url', { url });
    return `Opening YouTube for ${q}, sir.`;
  }

  const browserSearchMatch = text.match(/^(?:open (?:the )?browser and search (?:for )?|open google and search (?:for )?)\s+(.+)$/);
  if (browserSearchMatch) {
    const q = browserSearchMatch[1].trim();
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    await controller.executeTool('open_url', { url });
    return `Searching Google for ${q} in your browser, sir.`;
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
