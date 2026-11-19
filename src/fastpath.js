import { logger } from './logger.js';

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
export async function tryFastPath(rawText, controller) {
  let text = String(rawText || '')
    .toLowerCase()
    .replace(/^(hey\s+|ok\s+|okay\s+)?(ultron|altron|jarvis)[\s,.:!?-]*/i, '')
    .replace(/^(please\s+|can you\s+|could you\s+|i want you to\s+|go ahead and\s+|just\s+)/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();

  if (!text) return null;

  // 0. Instant Polite Conversational Replies (< 2ms)
  if (/^(thank you|thanks|thank you very much|thanks a lot|thank you so much|much appreciated|cheers)(\s+(ultron|buddy|pal|man))?$/.test(text)) {
    return 'You are welcome, sir. Let me know if you need anything else.';
  }
  if (/^(good job|nice job|great job|well done|awesome|amazing|perfect|nice work)(\s+ultron)?$/.test(text)) {
    return 'Thank you, sir. Let me know if you need anything else.';
  }
  if (/^(good morning|morning)(\s+ultron)?$/.test(text)) {
    return 'Good morning, sir. All systems are ready whenever you need me.';
  }
  if (/^(good afternoon|afternoon)(\s+ultron)?$/.test(text)) {
    return 'Good afternoon, sir. How can I assist you today?';
  }
  if (/^(good evening|evening)(\s+ultron)?$/.test(text)) {
    return 'Good evening, sir. How may I help you tonight?';
  }
  if (/^(good night|goodnight|night)(\s+ultron)?$/.test(text)) {
    return 'Good night, sir. I will remain on standby if you need anything.';
  }
  if (/^(how are you|how are you doing|how'?s it going|you good)$/.test(text)) {
    return 'Operating at peak efficiency, sir. Let me know what you need.';
  }
  if (/^(who are you|what is your name|what can you do|help me)$/.test(text)) {
    return 'I am Ultron, your personal AI assistant, sir. I can control your computer, write and launch complete code projects, check weather, manage notes, adjust brightness and volume, set timers, and see your screen.';
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

  // 4. Web Searches (YouTube / Google)
  const ytMatch = text.match(/^(?:search youtube for|youtube search|play on youtube)\s+(.+)$/);
  if (ytMatch) {
    const q = ytMatch[1].trim();
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    await controller.executeTool('open_url', { url });
    return `Searching YouTube for ${q}, sir.`;
  }

  const googleMatch = text.match(/^(?:google|search(?: google)? for)\s+(.+)$/);
  if (googleMatch) {
    const q = googleMatch[1].trim();
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    await controller.executeTool('open_url', { url });
    return `Searching Google for ${q}, sir.`;
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
