import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname);

console.log('Testing Direct Song & Music Playback System...');

// Import modules
const { resolveDirectYouTubeVideo, playSongDirectly } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'music.js').replace(/\\/g, '/')}`
);
const { tryFastPath } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'fastpath.js').replace(/\\/g, '/')}`
);

// Test 1: Mock controller to capture opened URLs
const capturedTools = [];
const mockController = {
  executeTool: async (tool, args) => {
    capturedTools.push({ tool, args });
    return { text: JSON.stringify({ ok: true, message: 'Executed' }) };
  },
};

// Test 2: playSongDirectly executes open_url with direct watch URL, never search_query
capturedTools.length = 0;
const res = await playSongDirectly('Ashke by Karan Aujla', mockController, 'youtube');
assert.strictEqual(res.ok, true, 'playSongDirectly should return ok: true');
assert.strictEqual(capturedTools.length, 1, 'Should call executeTool once');
assert.strictEqual(capturedTools[0].tool, 'open_url', 'Should call open_url');

const openedUrl = capturedTools[0].args.url;
console.log('Opened URL for "Ashke by Karan Aujla":', openedUrl);
assert.ok(
  !openedUrl.includes('results?search_query='),
  'Must NOT open search results page (results?search_query=)',
);
assert.ok(
  decodeURIComponent(openedUrl).includes('youtube.com/watch'),
  'Must open a direct watch URL or direct watch redirect',
);
console.log('✔ playSongDirectly opens direct watch URL instead of search results');

// Test 3: Fastpath song triggers
const testPhrases = [
  'play Ashke by Karan Aujla',
  'pay ashke',
  'play Believer',
  'stream Starboy',
  'put on Shape of You',
  'play on youtube Starboy',
];

for (const phrase of testPhrases) {
  capturedTools.length = 0;
  const reply = await tryFastPath(phrase, mockController);
  assert.ok(reply, `tryFastPath should handle "${phrase}"`);
  assert.strictEqual(capturedTools.length, 1, `Should execute tool for "${phrase}"`);
  assert.strictEqual(capturedTools[0].tool, 'open_url', 'Tool must be open_url');
  const url = capturedTools[0].args.url;
  assert.ok(
    !url.includes('results?search_query='),
    `"${phrase}" must NOT open results?search_query=; got: ${url}`,
  );
  assert.ok(
    decodeURIComponent(url).includes('youtube.com/watch'),
    `"${phrase}" must open direct watch URL; got: ${url}`,
  );
  console.log(`✔ Fastpath handled "${phrase}" -> Direct URL: ${url}`);
}

// Test 4: Spotify platform routing
capturedTools.length = 0;
const spotifyReply = await tryFastPath('play Starboy on spotify', mockController);
assert.ok(spotifyReply && spotifyReply.includes('Spotify'), 'Should confirm Spotify playback');
assert.strictEqual(capturedTools[0].tool, 'open_url', 'Tool must be open_url');
assert.ok(capturedTools[0].args.url.includes('spotify.com'), 'Must open Spotify URL');
console.log('✔ Fastpath handled "play Starboy on spotify" ->', capturedTools[0].args.url);

// Test 5: Verify tools.js play_music integration
const { ComputerController } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'tools.js').replace(/\\/g, '/')}`
);

const ctrl = new ComputerController({});
ctrl._callNative = async (act, args) => ({ action: act, ...args });

const playToolResult = await ctrl.executeTool('play_music', { song: 'Shape of You' });
const playToolJson = JSON.parse(playToolResult.text);
assert.strictEqual(playToolJson.ok, true, 'play_music tool should return ok: true');
assert.ok(
  !playToolJson.url.includes('results?search_query='),
  'play_music tool must NOT return search results URL',
);
console.log('✔ ComputerController play_music tool verified ->', playToolJson.url);

console.log('\n=============================================');
console.log('ALL DIRECT SONG PLAYBACK TESTS PASSED 100%!');
console.log('=============================================');
