import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname);

console.log('Testing Fullscreen Feature & Answering Speed Optimization...');

// Import modules
const { tryFastPath } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'fastpath.js').replace(/\\/g, '/')}`
);
const { loadConfig } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'config.js').replace(/\\/g, '/')}`
);

// Test 1: Config settings for low latency
const cfg = loadConfig();
console.log('Active model:', cfg.model);
console.log('Record silence timeout:', cfg.recordSilenceMs, 'ms');
assert.strictEqual(cfg.model, 'gemini-2.5-flash', 'Model must be set to fast gemini-2.5-flash');
assert.ok(cfg.recordSilenceMs <= 800, `Silence timeout (${cfg.recordSilenceMs}ms) must be <= 800ms`);
console.log('✔ Configuration latency verified: fast model and 700ms silence timeout');

// Test 2: Fastpath Fullscreen Commands
const capturedTools = [];
const mockController = {
  executeTool: async (tool, args) => {
    capturedTools.push({ tool, args });
    return { text: JSON.stringify({ ok: true, message: 'Executed' }) };
  },
};

const fullscreenPhrases = [
  'fullscreen this video',
  'full screen this video',
  'fullscreen video',
  'fullscreen',
  'full screen',
  'make this video fullscreen',
  'toggle fullscreen',
  'make it fullscreen',
];

for (const phrase of fullscreenPhrases) {
  capturedTools.length = 0;
  const t0 = performance.now();
  const reply = await tryFastPath(phrase, mockController);
  const elapsed = performance.now() - t0;

  assert.ok(reply && reply.includes('Fullscreen toggled'), `Should toggle fullscreen for "${phrase}"`);
  assert.strictEqual(capturedTools.length, 1, `Should execute 1 tool for "${phrase}"`);
  assert.strictEqual(capturedTools[0].tool, 'control_media_volume', 'Must be control_media_volume');
  assert.strictEqual(capturedTools[0].args.command, 'fullscreen', 'Command must be fullscreen');
  assert.ok(elapsed < 50, `Execution for "${phrase}" must be instant (< 50ms); took ${elapsed.toFixed(2)}ms`);
  console.log(`✔ "${phrase}" -> Instant fastpath response in ${elapsed.toFixed(2)}ms: "${reply}"`);
}

// Test 3: Exit Fullscreen and Theater Mode
capturedTools.length = 0;
const exitReply = await tryFastPath('exit fullscreen', mockController);
assert.ok(exitReply && exitReply.includes('Exited fullscreen'), 'Should handle exit fullscreen');
assert.strictEqual(capturedTools[0].args.command, 'exit_fullscreen');
console.log('✔ "exit fullscreen" handled -> command: exit_fullscreen');

capturedTools.length = 0;
const theaterReply = await tryFastPath('theater mode', mockController);
assert.ok(theaterReply && theaterReply.includes('Theater mode toggled'), 'Should handle theater mode');
assert.strictEqual(capturedTools[0].args.command, 'theater_mode');
console.log('✔ "theater mode" handled -> command: theater_mode');

console.log('\n=============================================');
console.log('ALL FULLSCREEN & SPEED OPTIMIZATION TESTS PASSED!');
console.log('=============================================');
