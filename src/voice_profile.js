import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './config.js';
import { logger } from './logger.js';

export const VOICE_PROFILE_DIR = path.join(ROOT_DIR, 'voice-profile');
export const VOICE_PROFILE_PATH = path.join(VOICE_PROFILE_DIR, 'profile.json');

const SAMPLE_RATE = 16000;
const FFT_SIZE = 512;
const FRAME_SIZE = 400; // 25ms
const HOP_SIZE = 200; // 12.5ms
const NUM_BANDS = 16;

// Precompute Hann window
const HANN = new Float32Array(FRAME_SIZE);
for (let i = 0; i < FRAME_SIZE; i++) {
  HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1)));
}

// Precompute 16 triangular Mel filterbanks covering 120 Hz .. 7200 Hz
function hzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700);
}
function melToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

const MEL_FILTERS = (() => {
  const lowMel = hzToMel(120);
  const highMel = hzToMel(7200);
  const bins = [];
  for (let i = 0; i <= NUM_BANDS + 1; i++) {
    const mel = lowMel + ((highMel - lowMel) * i) / (NUM_BANDS + 1);
    const hz = melToHz(mel);
    bins.push(Math.floor(((FFT_SIZE + 1) * hz) / SAMPLE_RATE));
  }
  const filters = [];
  for (let m = 1; m <= NUM_BANDS; m++) {
    const left = bins[m - 1];
    const center = bins[m];
    const right = bins[m + 1];
    const weights = [];
    for (let k = left; k <= right; k++) {
      let w = 0;
      if (k >= left && k <= center && center > left) {
        w = (k - left) / (center - left);
      } else if (k > center && k <= right && right > center) {
        w = (right - k) / (right - center);
      }
      if (w > 0 && k < FFT_SIZE / 2) {
        weights.push([k, w]);
      }
    }
    filters.push(weights);
  }
  return filters;
})();

// In-place radix-2 Cooley-Tukey FFT
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

/**
 * Trim silence from Float32Array [-1, 1] and extract unit-normalized 16-band Log-Mel frames (CMN)
 */
export function extractVoiceFeatures(samples) {
  if (!samples || samples.length < FRAME_SIZE * 3) return null;

  // Compute frame energies to trim leading/trailing silence tightly
  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const energies = new Float32Array(frameCount);
  let maxEnergy = 0;
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP_SIZE;
    let sum = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const v = samples[start + i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / FRAME_SIZE);
    energies[f] = rms;
    if (rms > maxEnergy) maxEnergy = rms;
  }

  if (maxEnergy < 0.005) return null;
  const trimThresh = maxEnergy * 0.14;
  let first = 0;
  while (first < frameCount - 1 && energies[first] < trimThresh) first++;
  let last = frameCount - 1;
  while (last > first && energies[last] < trimThresh) last--;

  first = Math.max(0, first - 2);
  last = Math.min(frameCount - 1, last + 2);
  const activeFrames = last - first + 1;
  if (activeFrames < 12 || activeFrames > 220) return null;

  // Downsample to at most 45 frames for ultra-fast (<2ms) DTW matching
  const step = Math.max(1, Math.floor(activeFrames / 45));
  const rawFeats = [];
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(FFT_SIZE / 2);

  for (let f = first; f <= last; f += step) {
    re.fill(0);
    im.fill(0);
    const start = f * HOP_SIZE;
    // Pre-emphasis filter (0.97) boosts consonant clarity
    let prev = samples[start];
    for (let i = 0; i < FRAME_SIZE; i++) {
      const cur = samples[start + i];
      re[i] = (cur - 0.97 * prev) * HANN[i];
      prev = cur;
    }
    fft(re, im);
    for (let k = 0; k < FFT_SIZE / 2; k++) {
      mag[k] = re[k] * re[k] + im[k] * im[k];
    }

    const vec = new Array(NUM_BANDS);
    for (let b = 0; b < NUM_BANDS; b++) {
      let bandEnergy = 1e-10;
      const weights = MEL_FILTERS[b];
      for (let j = 0; j < weights.length; j++) {
        bandEnergy += mag[weights[j][0]] * weights[j][1];
      }
      vec[b] = Math.log(bandEnergy);
    }
    rawFeats.push(vec);
  }

  if (rawFeats.length < 8) return null;

  // Cepstral Mean & Variance Normalization (volume & mic-distance invariant)
  const mean = new Array(NUM_BANDS).fill(0);
  for (const vec of rawFeats) {
    for (let b = 0; b < NUM_BANDS; b++) mean[b] += vec[b];
  }
  for (let b = 0; b < NUM_BANDS; b++) mean[b] /= rawFeats.length;

  const normFeats = rawFeats.map((vec) => {
    let normSq = 0;
    const centered = new Array(NUM_BANDS);
    for (let b = 0; b < NUM_BANDS; b++) {
      const v = vec[b] - mean[b];
      centered[b] = v;
      normSq += v * v;
    }
    const invNorm = normSq > 1e-8 ? 1 / Math.sqrt(normSq) : 1;
    for (let b = 0; b < NUM_BANDS; b++) {
      centered[b] = Math.round(centered[b] * invNorm * 1000) / 1000;
    }
    return centered;
  });

  return normFeats;
}

function cosineDistance(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, 1 - dot);
}

/**
 * Banded Dynamic Time Warping distance between two normalized feature sequences (0 = identical, 2 = opposite)
 */
export function dtwDistance(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  const ratio = n / Math.max(1, m);
  if (ratio < 0.55 || ratio > 1.85) return 999;

  const band = Math.max(8, Math.abs(n - m) + Math.floor(Math.max(n, m) * 0.35));
  let prev = new Float64Array(m + 1).fill(Infinity);
  let curr = new Float64Array(m + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr.fill(Infinity);
    const jStart = Math.max(1, i - band);
    const jEnd = Math.min(m, i + band);
    const vecA = seqA[i - 1];
    for (let j = jStart; j <= jEnd; j++) {
      const cost = cosineDistance(vecA, seqB[j - 1]);
      const bestPrev = Math.min(prev[j], curr[j - 1], prev[j - 1]);
      curr[j] = cost + bestPrev;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[m] / (n + m);
}

export function normalizePhrase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class VoiceProfileManager {
  constructor() {
    this.profile = null;
  }

  load() {
    try {
      if (!fs.existsSync(VOICE_PROFILE_PATH)) {
        this.profile = null;
        return false;
      }
      const raw = JSON.parse(fs.readFileSync(VOICE_PROFILE_PATH, 'utf8'));
      if (raw && Array.isArray(raw.templates) && raw.templates.length > 0) {
        this.profile = raw;
        logger.info(
          `Loaded personal voice profile (${raw.templates.length} voice samples, ${raw.learnedPhrases?.length || 0} personalized phrases, threshold ${raw.threshold?.toFixed(3)}).`,
        );
        return true;
      }
    } catch (err) {
      logger.warn(`Failed to load voice profile: ${err.message}`);
    }
    this.profile = null;
    return false;
  }

  save(profileData) {
    fs.mkdirSync(VOICE_PROFILE_DIR, { recursive: true });
    fs.writeFileSync(VOICE_PROFILE_PATH, JSON.stringify(profileData, null, 2), 'utf8');
    this.profile = profileData;
  }

  /**
   * Check whether a spoken burst matches the user's enrolled voice OR personalized Whisper spellings
   */
  matchUtterance(samples, transcript = '') {
    if (!this.profile) return { matched: false };

    const normText = normalizePhrase(transcript);

    // 1. Check exact personalized Whisper spellings learned during enrollment (e.g., "here tron", "hey anton")
    if (normText && Array.isArray(this.profile.learnedPhrases)) {
      for (const phrase of this.profile.learnedPhrases) {
        if (!phrase || phrase.length < 4) continue;
        if (normText === phrase || normText.startsWith(`${phrase} `) || normText.includes(` ${phrase}`)) {
          const idx = normText.indexOf(phrase);
          const trailing = normText.slice(idx + phrase.length).trim();
          return {
            matched: true,
            reason: `learned-phrase:"${phrase}"`,
            inlineCommand: trailing.length >= 4 ? trailing : '',
          };
        }
      }
    }

    // 2. Check acoustic Voice Fingerprint (DTW against the user's own enrolled "Hey Ultron" recordings)
    // Strict duration (0.45s - 1.9s) and word-count (<= 3 words) guard prevents false triggers on laughs or sentences!
    const wordCount = normText ? normText.split(' ').length : 0;
    const isShortWakeLength =
      samples &&
      samples.length >= SAMPLE_RATE * 0.45 &&
      samples.length <= SAMPLE_RATE * 1.9 &&
      wordCount <= 3 &&
      !/^(haha|ha|yeah|yes|no|ok|okay|bye|hi|hello|wow|wait|sorry)$/.test(normText);

    if (isShortWakeLength && Array.isArray(this.profile.templates)) {
      const feats = extractVoiceFeatures(samples);
      if (feats) {
        let bestDist = Infinity;
        for (const tmpl of this.profile.templates) {
          const d = dtwDistance(feats, tmpl);
          if (d < bestDist) bestDist = d;
        }
        // Strict cap at 0.135 so unrelated speech (dist ~0.18-0.28) NEVER false-triggers!
        const thresh = Math.min(0.135, this.profile.threshold || 0.13);
        if (bestDist <= thresh) {
          return {
            matched: true,
            reason: `voice-fingerprint(dist=${bestDist.toFixed(3)}<=${thresh.toFixed(3)})`,
            distance: bestDist,
            inlineCommand: '',
          };
        }
        return { matched: false, distance: bestDist };
      }
    }

    return { matched: false };
  }
}
