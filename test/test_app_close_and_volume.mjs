import assert from 'node:assert/strict';
import { tryFastPath } from '../src/fastpath.js';
import { ComputerController } from '../src/tools.js';

console.log('[TEST] Starting App Closing & Volume Control Verification...');

// 1. FastPath Unit Tests with Mock Controller
const toolCalls = [];
const mockController = {
  async executeTool(name, args) {
    toolCalls.push({ name, args });
    if (name === 'control_media_volume' && args.command === 'get_volume') {
      return { ok: true, text: JSON.stringify({ ok: true, volume: 45, message: 'Current volume is 45 percent' }) };
    }
    if (name === 'control_media_volume' && args.command === 'set_volume') {
      return { ok: true, text: JSON.stringify({ ok: true, volume: args.percent, message: `Set volume to ${args.percent} percent` }) };
    }
    if (name === 'close_app') {
      return { ok: true, text: JSON.stringify({ ok: true, message: `Closed ${args.app}` }) };
    }
    return { ok: true, text: JSON.stringify({ ok: true, message: 'Done' }) };
  },
};

// --- Test 1.1: App Closing Variations ---
const appCloseTestCases = [
  { phrase: 'close chrome', expectedApp: 'chrome' },
  { phrase: 'close google chrome', expectedApp: 'google chrome' },
  { phrase: 'close notepad', expectedApp: 'notepad' },
  { phrase: 'close word', expectedApp: 'word' },
  { phrase: 'close spotify', expectedApp: 'spotify' },
  { phrase: 'close vscode', expectedApp: 'vscode' },
  { phrase: 'close vs code', expectedApp: 'vs code' },
  { phrase: 'close calculator', expectedApp: 'calculator' },
  { phrase: 'close edge', expectedApp: 'edge' },
  { phrase: 'close browser', expectedApp: 'browser' },
  { phrase: 'close task manager', expectedApp: 'task manager' },
  { phrase: 'close this app', expectedApp: 'this' },
  { phrase: 'close current app', expectedApp: 'this' },
  { phrase: 'close this window', expectedApp: 'this' },
  { phrase: 'close current window', expectedApp: 'this' },
  { phrase: 'close active window', expectedApp: 'this' },
  { phrase: 'close window', expectedApp: 'this' },
  { phrase: 'close this', expectedApp: 'this' },
  { phrase: 'close tab', expectedApp: 'tab' },
  { phrase: 'close this tab', expectedApp: 'tab' },
  { phrase: 'close active tab', expectedApp: 'tab' },
];

for (const tc of appCloseTestCases) {
  toolCalls.length = 0;
  const reply = await tryFastPath(tc.phrase, mockController, 'ultron');
  assert.ok(reply, `Failed to match phrase: "${tc.phrase}"`);
  assert.equal(toolCalls.length, 1, `Expected 1 tool call for "${tc.phrase}"`);
  assert.equal(toolCalls[0].name, 'close_app', `Expected close_app tool call for "${tc.phrase}"`);
  assert.equal(toolCalls[0].args.app, tc.expectedApp, `Expected app: "${tc.expectedApp}", got "${toolCalls[0].args.app}"`);
  console.log(`  ✓ "${tc.phrase}" -> close_app(app: "${tc.expectedApp}") -> "${reply}"`);
}

// --- Test 1.2: Volume Control Variations ---
const volumeTestCases = [
  { phrase: 'set volume to 50%', expectedCmd: 'set_volume', expectedPercent: 50 },
  { phrase: 'volume 80', expectedCmd: 'set_volume', expectedPercent: 80 },
  { phrase: 'turn volume to 60', expectedCmd: 'set_volume', expectedPercent: 60 },
  { phrase: 'volume 100', expectedCmd: 'set_volume', expectedPercent: 100 },
  { phrase: 'max volume', expectedCmd: 'set_volume', expectedPercent: 100 },
  { phrase: 'maximum volume', expectedCmd: 'set_volume', expectedPercent: 100 },
  { phrase: 'half volume', expectedCmd: 'set_volume', expectedPercent: 50 },
  { phrase: 'low volume', expectedCmd: 'set_volume', expectedPercent: 20 },
  { phrase: 'volume up by 15', expectedCmd: 'volume_up', expectedDelta: 15 },
  { phrase: 'increase volume by 20', expectedCmd: 'volume_up', expectedDelta: 20 },
  { phrase: 'volume down by 10', expectedCmd: 'volume_down', expectedDelta: 10 },
  { phrase: 'decrease volume by 25', expectedCmd: 'volume_down', expectedDelta: 25 },
  { phrase: 'volume up', expectedCmd: 'volume_up' },
  { phrase: 'turn up the volume', expectedCmd: 'volume_up' },
  { phrase: 'louder', expectedCmd: 'volume_up' },
  { phrase: 'volume down', expectedCmd: 'volume_down' },
  { phrase: 'turn down the volume', expectedCmd: 'volume_down' },
  { phrase: 'quieter', expectedCmd: 'volume_down' },
  { phrase: 'mute', expectedCmd: 'mute' },
  { phrase: 'unmute', expectedCmd: 'unmute' },
  { phrase: 'what is the volume', expectedCmd: 'get_volume' },
  { phrase: 'check the volume', expectedCmd: 'get_volume' },
  { phrase: 'control the volume', expectedCmd: 'get_volume' },
];

for (const tc of volumeTestCases) {
  toolCalls.length = 0;
  const reply = await tryFastPath(tc.phrase, mockController, 'ultron');
  assert.ok(reply, `Failed to match phrase: "${tc.phrase}"`);
  assert.equal(toolCalls.length, 1, `Expected 1 tool call for "${tc.phrase}"`);
  assert.equal(toolCalls[0].name, 'control_media_volume', `Expected control_media_volume for "${tc.phrase}"`);
  assert.equal(toolCalls[0].args.command, tc.expectedCmd, `Expected command: "${tc.expectedCmd}" for "${tc.phrase}"`);
  if (tc.expectedPercent !== undefined) {
    assert.equal(toolCalls[0].args.percent, tc.expectedPercent, `Expected percent: ${tc.expectedPercent} for "${tc.phrase}"`);
  }
  if (tc.expectedDelta !== undefined) {
    assert.equal(toolCalls[0].args.delta, tc.expectedDelta, `Expected delta: ${tc.expectedDelta} for "${tc.phrase}"`);
  }
  console.log(`  ✓ "${tc.phrase}" -> control_media_volume(${JSON.stringify(toolCalls[0].args)}) -> "${reply}"`);
}

// 2. Real Native PowerShell & CoreAudio Verification
console.log('\n[TEST] Testing Real Native ComputerController & CoreAudio...');
const realController = new ComputerController({ allowShell: false }, () => {});
await realController.start();

try {
  // Test 2.1: Master Volume query
  const volRes = await realController.getVolume();
  console.log('  ✓ Native CoreAudio GetMasterVolume returned:', volRes);
  assert.ok(volRes && typeof volRes.volume === 'number');
  assert.ok(volRes.volume >= 0 && volRes.volume <= 100);

  // Test 2.2: Tool execution close_app on nonexistent test target
  const closeResText = (await realController.executeTool('close_app', { app: 'nonexistent_test_proc_xyz_99' })).text;
  const closeParsed = JSON.parse(closeResText);
  console.log('  ✓ Native close_app execution returned:', closeParsed);
  assert.ok(closeParsed && closeParsed.ok);
  assert.ok(closeParsed.message.includes('No running window or app found'));

} finally {
  realController.stop();
}

console.log('\n✅ ALL APP CLOSING & VOLUME CONTROL TESTS PASSED PERFECTLY!\n');
