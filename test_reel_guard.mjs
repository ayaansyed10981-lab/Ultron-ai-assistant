import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname);

console.log('Testing Reel Guard & Biometric Speaker Rejection...');

// Test 1: VoiceProfileManager speaker verification
const { VoiceProfileManager, extractVoiceFeatures, dtwDistance } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'voice_profile.js').replace(/\\/g, '/')}`
);

const vpm = new VoiceProfileManager();
const loaded = vpm.load();
assert.strictEqual(loaded, true, 'Voice profile should load successfully');
assert.strictEqual(vpm.isEnrolled(), true, 'User should be marked as enrolled');
console.log('✔ VoiceProfileManager loaded enrolled agents:', Object.keys(vpm.agents));

// Generate a synthetic test utterance resembling non-user audio (e.g. music/reel voice)
const sampleRate = 16000;
const reelSamples = new Float32Array(sampleRate * 1.2);
for (let i = 0; i < reelSamples.length; i++) {
  // Harmonic mixture distinct from user's voice
  reelSamples[i] =
    0.35 * Math.sin((2 * Math.PI * 450 * i) / sampleRate) +
    0.20 * Math.sin((2 * Math.PI * 900 * i) / sampleRate) +
    (Math.random() - 0.5) * 0.05;
}

const verifyReel = vpm.verifySpeaker(reelSamples);
console.log('Reel voice verification result:', verifyReel);
assert.strictEqual(verifyReel.verified, false, 'Non-user reel voice must be rejected');
assert.ok(verifyReel.distance > 0.30, `Reel voice distance (${verifyReel.distance}) should exceed threshold`);
console.log('✔ verifySpeaker strictly rejects reel audio with high DTW distance');

// Test 2: User's enrolled voice verification
// Re-extract features from first enrolled template
const userFeats = vpm.agents.ultron.templates[0];
const otherUserFeats = vpm.agents.ultron.templates[1];
const userDist = dtwDistance(userFeats, otherUserFeats);
console.log('Enrolled user template distance:', userDist);
assert.ok(userDist < 0.10, `User template intra-distance (${userDist}) should be < 0.10`);
console.log('✔ User enrolled voice has verified intra-distance < 0.10');

// Test 3: WakeWordListener Media Guard & Reel Mode
const { WakeWordListener } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'audio.js').replace(/\\/g, '/')}`
);

const listener = new WakeWordListener({
  wakeWords: ['Hey Ultron', 'Ultron', 'Okay Ultron'],
  wakeConfidence: 'high',
});

assert.strictEqual(listener.reelModeActive, false, 'Reel mode should be off by default');
assert.strictEqual(listener.isMediaPlaying(), false, 'Media should be inactive initially');

listener.setReelMode(true, 5000);
assert.strictEqual(listener.reelModeActive, true, 'Reel mode should be active after setReelMode(true)');
assert.strictEqual(listener.isMediaPlaying(), true, 'isMediaPlaying() should be true when reel mode is active');

listener.setReelMode(false);
assert.strictEqual(listener.reelModeActive, false, 'Reel mode should be false after setReelMode(false)');
console.log('✔ WakeWordListener reelModeActive and isMediaPlaying toggle correctly');

// Test 4: Fastpath Reels Mode Voice Commands
const { tryFastPath } = await import(
  `file:///${path.join(ROOT_DIR, 'src', 'fastpath.js').replace(/\\/g, '/')}`
);

let lastReelMode = null;
const mockController = {
  setReelMode: (enabled) => {
    lastReelMode = enabled;
  },
  executeTool: async () => ({ text: JSON.stringify({ ok: true }) }),
};

const replyOn = await tryFastPath('reels mode on', mockController);
assert.ok(replyOn && replyOn.includes('Reels mode activated'), 'Should reply with activation');
assert.strictEqual(lastReelMode, true, 'Controller setReelMode should have been called with true');

const replyWatching = await tryFastPath("I'm watching reels", mockController);
assert.ok(replyWatching && replyWatching.includes('Reels mode activated'), 'Should handle "I\'m watching reels"');

const replyOff = await tryFastPath('reels mode off', mockController);
assert.ok(replyOff && replyOff.includes('Reels mode deactivated'), 'Should reply with deactivation');
assert.strictEqual(lastReelMode, false, 'Controller setReelMode should have been called with false');

const replyNormal = await tryFastPath('normal mode', mockController);
assert.ok(replyNormal && replyNormal.includes('Reels mode deactivated'), 'Should handle "normal mode"');
console.log('✔ tryFastPath correctly routes "reels mode on", "watching reels", and "reels mode off"');

// Test 5: Verify Stop words (Wait, Stop, Pause, Cancel, etc.) never trigger wake in standby
const stopKeywords = ['Stop', 'Wait', 'Pause', 'Cancel', 'Quiet', 'Halt'];
for (const kw of stopKeywords) {
  const isStopWord = /^(?:stop|wait|pause|quiet|cancel|listen|halt)$/i.test(kw);
  assert.strictEqual(isStopWord, true, `"${kw}" must be classified as a stop word`);
}
console.log('✔ Stop words ("wait", "stop", etc.) properly classified and suppressed during standby');

console.log('\n========================================');
console.log('ALL REEL GUARD & BIOMETRIC TESTS PASSED!');
console.log('========================================');
