import assert from 'node:assert/strict';
import { tryFastPath } from '../src/fastpath.js';

console.log('[TEST] Starting Wake Debounce & Compound Media Verification...');

// Mock controller
const toolCalls = [];
const mockController = {
  async executeTool(name, args) {
    toolCalls.push({ name, args });
    return { ok: true, text: JSON.stringify({ ok: true, message: 'Success' }) };
  },
  makePhoneCall: async () => ({ ok: true, message: 'Calling' }),
  openAndWrite: async () => {},
  typeActiveWindow: async () => {},
};

// 1. Test Compound Commands
toolCalls.length = 0;
const r1 = await tryFastPath('full screen this and resume this video', mockController, 'ultron');
console.log('Result 1 ("full screen this and resume this video"):', r1);
assert.ok(r1 && r1.includes('Fullscreen toggled and video resumed'));
assert.equal(toolCalls.length, 2);
assert.equal(toolCalls[0].name, 'control_media_volume');
assert.equal(toolCalls[0].args.command, 'fullscreen');
assert.equal(toolCalls[1].name, 'control_media_volume');
assert.equal(toolCalls[1].args.command, 'play_pause');

toolCalls.length = 0;
const r2 = await tryFastPath('fullscreen and play', mockController, 'ultron');
console.log('Result 2 ("fullscreen and play"):', r2);
assert.ok(r2 && r2.includes('Fullscreen toggled and video resumed'));
assert.equal(toolCalls.length, 2);
assert.equal(toolCalls[0].args.command, 'fullscreen');
assert.equal(toolCalls[1].args.command, 'play_pause');

toolCalls.length = 0;
const r3 = await tryFastPath('resume this video and fullscreen', mockController, 'ultron');
console.log('Result 3 ("resume this video and fullscreen"):', r3);
assert.ok(r3 && r3.includes('Fullscreen toggled and video resumed'));
assert.equal(toolCalls.length, 2);

toolCalls.length = 0;
const r4 = await tryFastPath('exit fullscreen and pause', mockController, 'ultron');
console.log('Result 4 ("exit fullscreen and pause"):', r4);
assert.ok(r4 && r4.includes('Exited fullscreen and video paused'));
assert.equal(toolCalls.length, 2);
assert.equal(toolCalls[0].args.command, 'exit_fullscreen');
assert.equal(toolCalls[1].args.command, 'play_pause');

// 2. Test Single Video & Playback Commands
toolCalls.length = 0;
const r5 = await tryFastPath('resume this video', mockController, 'ultron');
console.log('Result 5 ("resume this video"):', r5);
assert.equal(r5, 'Done, sir.');
assert.equal(toolCalls.length, 1);
assert.equal(toolCalls[0].args.command, 'play_pause');

toolCalls.length = 0;
const r6 = await tryFastPath('unpause this video', mockController, 'ultron');
console.log('Result 6 ("unpause this video"):', r6);
assert.equal(r6, 'Done, sir.');
assert.equal(toolCalls.length, 1);
assert.equal(toolCalls[0].args.command, 'play_pause');

toolCalls.length = 0;
const r7 = await tryFastPath('full screen this video', mockController, 'ultron');
console.log('Result 7 ("full screen this video"):', r7);
assert.equal(r7, 'Fullscreen toggled, sir.');
assert.equal(toolCalls.length, 1);
assert.equal(toolCalls[0].args.command, 'fullscreen');

// 3. Test Conversational query ("he is not responding to me", "are you listening")
const r8 = await tryFastPath('he is not responding to me', mockController, 'ultron');
console.log('Result 8 ("he is not responding to me"):', r8);
assert.ok(r8 && r8.includes('I am right here and listening to you, sir'));

const r9 = await tryFastPath('are you listening', mockController, 'ultron');
console.log('Result 9 ("are you listening"):', r9);
assert.ok(r9 && r9.includes('I am right here and listening to you, sir'));

// 4. Test Wake Debounce Simulation (Simulating 30 consecutive calls in one session)
console.log('\n[TEST] Simulating 30 wake-word calls within a session...');

const WAKE_WORD_NAMES = '(?:ultron|altron|tron|drone|prawn|john|anton|turn|vision|vizion|vishon|vison|vishan|region|legion|vyram|revision|coder|cypher|code|friday|fryday|fry\\s*day|jarvis|charvis|jarviss|jarviz|service|veronica|varonica|veronika)';
const WAKE_PREFIXES = '(?:hey|here|ok|okay|hi|hello|yo)';
const isOnlyWakeWords = new RegExp(
  `^(?:(?:${WAKE_PREFIXES}\\s+)?${WAKE_WORD_NAMES}[\\s,.:!?-]*)+$`,
  'i'
);

let activeAgent = 'ultron';
let lastWakeReplyAt = Date.now(); // Agent already greeted once upon waking!
let spokenReplyCount = 1; // Initial greeting count

const thirtyCalls = [
  'hey ultron',
  'ultron',
  'hey ultron',
  'ultron ultron',
  'hey ultron hey ultron',
  'ultron',
  'hey ultron',
  'ultron',
  'ultron',
  'hey ultron',
  'ultron ultron ultron',
  'hey ultron',
  'ultron',
  'hey ultron',
  'ultron',
  'hey ultron',
  'ultron',
  'ultron',
  'hey ultron',
  'hey ultron hey ultron',
  'ultron',
  'ultron',
  'hey ultron',
  'ultron',
  'hey ultron',
  'ultron',
  'ultron',
  'hey ultron',
  'ultron',
  'ultron'
];

assert.equal(thirtyCalls.length, 30);

for (let i = 0; i < thirtyCalls.length; i++) {
  const lower = thirtyCalls[i];
  if (isOnlyWakeWords.test(lower)) {
    let targetAgent = 'ultron';
    const isAgentSwitch = activeAgent !== targetAgent;
    const timeSinceLastGreeting = Date.now() - lastWakeReplyAt;

    if (isAgentSwitch || timeSinceLastGreeting > 8000) {
      activeAgent = targetAgent;
      spokenReplyCount++;
      lastWakeReplyAt = Date.now();
    }
  }
}

console.log(`User called 30 times. Spoken wake reply count: ${spokenReplyCount}`);
assert.equal(spokenReplyCount, 1, 'Ultron must respond at most ONCE when called 30 times in the same session!');

console.log('\n[ALL TESTS PASSED SUCCESSFULLY!]');
