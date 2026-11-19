import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.js';

function buildSystemInstruction() {
  const now = new Date();
  return [
    'You are Ultron, a fast, highly accurate personal AI voice assistant running 24/7 natively on a Windows 11 ARM64 (Snapdragon) PC.',
    'Style: sharp, warm, respectful AI assistant. Always address the user as "sir" (never "boss"). When thanked, say "You are welcome, sir. Let me know if you need anything else." Answer in 1 to 2 short natural sentences unless asked for detail.',
    'NEVER use markdown (*, _, #, bullets, code fences) and NEVER read raw source code aloud because replies are spoken.',
    'STRICT ACCURACY RULE: NEVER launch an app, open a website, lock the PC, or execute ANY tool unless the user CLEARLY and EXPLICITLY requested that exact action. NEVER guess or open random apps (like Chrome, Camera, or Lock Screen) on unclear, partial, or conversational sentences. If a request is unclear or garbled, do NOT call any tool — simply ask "Could you repeat that, sir?"',
    'CODING RULE: Whenever the user explicitly asks you to write code, build a website, make a game, create an app, or write a script, call the code_and_build tool so it creates the runnable files and opens them in the browser or VS Code.',
    'WORD DOCUMENT RULE: Whenever the user explicitly asks you to make, create, write, edit, read, or summarize a Word document (or .docx file), call the word_document_manager tool. You can generate full professional Word documents with headings, bullet points, and tables, save them in ~/UltronDocuments, and open them in Microsoft Word.',
    'When the user explicitly asks for multiple actions (e.g., open a browser AND search YouTube), call ALL requested tools in the same turn.',
    `Local time: ${now.toLocaleString()}.`,
  ].join('\n');
}

function isModelNotFoundError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('404') || msg.toLowerCase().includes('not found') || msg.includes('v1beta');
}

function isRateLimitError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('quota') || msg.includes('resource_exhausted');
}

function isRetryableOverloadError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted')
  );
}

function thinkingLevelForModel(modelName) {
  const m = String(modelName || '').toLowerCase();
  if (m.includes('flash-lite') || m.includes('3.6-flash') || m.includes('3-flash')) {
    return 'minimal';
  }
  return 'low';
}

// Tools whose result is purely a confirmation ("Done") and don't need a 2nd slow LLM round-trip
const FIRE_AND_FORGET_TOOLS = new Set([
  'open_app',
  'open_url',
  'control_media_volume',
  'keyboard_action',
  'mouse_action',
  'set_timer',
  'code_and_build',
  'screen_brightness',
  'save_screenshot',
  'word_document_manager',
]);

function summarizeQuickAction(name, args, resultText) {
  try {
    const parsed = JSON.parse(resultText);
    if (!parsed.ok) return null; // Let LLM handle/explain errors
    switch (name) {
      case 'open_app':
        return `Opened ${args.app}, sir.`;
      case 'open_url':
        return 'Opened that in your browser, sir.';
      case 'control_media_volume':
        return parsed.message ? `${parsed.message}, sir.` : 'Done, sir.';
      case 'keyboard_action':
        return args.mode === 'type' ? 'Typed that for you, sir.' : 'Done, sir.';
      case 'mouse_action':
        return 'Done, sir.';
      case 'set_timer':
        return `Timer set for ${args.label || 'your reminder'}, sir.`;
      case 'manage_windows':
        return parsed.message ? `${parsed.message}, sir.` : 'Done, sir.';
      case 'screen_brightness':
        return parsed.message ? `${parsed.message}, sir.` : 'Brightness updated, sir.';
      case 'save_screenshot':
        return 'Screenshot saved, sir.';
      case 'word_document_manager': {
        if (args.operation === 'create') {
          return `Created your Word document "${parsed.filename || 'Document.docx'}" and opened it in Microsoft Word, sir.`;
        }
        if (args.operation === 'append') {
          return `Updated your Word document and opened it in Microsoft Word, sir.`;
        }
        if (args.operation === 'open') {
          return 'Opened your Word document, sir.';
        }
        return null; // For 'read' or 'list', let Gemini describe the content to the user
      }
      case 'code_and_build': {
        const launch = parsed.launchNote ? ` I ${parsed.launchNote}.` : '';
        const runBit =
          parsed.runOutput?.ok && parsed.runOutput?.stdout
            ? ` Output: ${parsed.runOutput.stdout.slice(0, 120)}.`
            : '';
        return `Done, sir. ${parsed.summary}.${launch}${runBit} Let me know if you need anything else.`;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export class GeminiEngine {
  constructor(config) {
    this.config = config;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.betaClient = new GoogleGenAI({ apiKey: config.apiKey, apiVersion: 'v1beta' });
    this.chatClient = this.client;
    this.sttClient = this.betaClient;
    this.activeModel = config.model;
    this.fallbackModels = Array.from(
      new Set([
        config.model,
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-4-argon',
      ]),
    );
    this.ttsClient = null;
    this.ttsUnavailable = false;
    this.previousInteractionId = null;
    this.lastInteractionAt = 0;
  }

  resetConversation() {
    this.previousInteractionId = null;
    this.lastInteractionAt = 0;
  }

  /**
   * Fast speech-to-text on trimmed WAV clip using gemini-3.5-transcribe
   */
  async transcribeAudio(wavPath) {
    const audioBase64 = fs.readFileSync(wavPath).toString('base64');

    const transcribeRequest = {
      model: this.config.transcribeModel,
      store: false,
      input: [
        {
          type: 'audio',
          data: audioBase64,
          mime_type: 'audio/wav',
        },
      ],
      generation_config: {
        transcription_config: {
          mode: { type: 'smart' },
          custom_vocabulary: ['Jarvis', 'Snapdragon', 'ARM64', 'VS Code', 'PowerShell', 'YouTube', 'Spotify', 'Chrome', 'Notepad'],
        },
      },
    };

    try {
      const interaction = await this.sttClient.interactions.create(transcribeRequest);
      return (interaction.output_text || '').trim();
    } catch (err) {
      if (isModelNotFoundError(err) || isRetryableOverloadError(err)) {
        const otherClient = this.sttClient === this.betaClient ? this.client : this.betaClient;
        try {
          const interaction = await otherClient.interactions.create(transcribeRequest);
          this.sttClient = otherClient;
          return (interaction.output_text || '').trim();
        } catch {
          // Multimodal fallback on fastest chat model
          for (const modelName of this.fallbackModels) {
            try {
              const fallback = await this.chatClient.interactions.create({
                model: modelName,
                store: false,
                generation_config: { thinking_level: thinkingLevelForModel(modelName) },
                input: [
                  {
                    type: 'text',
                    text: 'Transcribe this spoken command verbatim. Return ONLY the transcript text.',
                  },
                  {
                    type: 'audio',
                    data: audioBase64,
                    mime_type: 'audio/wav',
                  },
                ],
              });
              return (fallback.output_text || '').trim();
            } catch {
              // next fallback
            }
          }
        }
      }
      throw err;
    }
  }

  async _createChatInteraction(payload, { isToolResult = false } = {}) {
    // On a function_result turn, we MUST stay on the same model & previous_interaction_id
    const modelsToTry = isToolResult
      ? [this.activeModel]
      : [this.activeModel, ...this.fallbackModels.filter((m) => m !== this.activeModel)];

    let lastErr = null;
    for (const modelName of modelsToTry) {
      const req = {
        ...payload,
        model: modelName,
        generation_config: {
          ...(payload.generation_config || {}),
          thinking_level: thinkingLevelForModel(modelName),
        },
      };
      if (!isToolResult && modelName !== this.activeModel && req.previous_interaction_id) {
        delete req.previous_interaction_id;
      }

      const callWithTimeout = (apiClient, requestBody, timeoutMs = 24000) =>
        Promise.race([
          apiClient.interactions.create(requestBody),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`503 Model '${modelName}' timed out after ${timeoutMs / 1000}s`)),
              timeoutMs,
            ),
          ),
        ]);

      try {
        const res = await callWithTimeout(this.chatClient, req, 24000);
        if (modelName !== this.activeModel) {
          logger.info(`Switched active chat model to '${modelName}'.`);
          this.activeModel = modelName;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (this.chatClient === this.client && isModelNotFoundError(err)) {
          try {
            const res = await callWithTimeout(this.betaClient, req, 24000);
            logger.info(`Using v1beta for chat model '${modelName}'.`);
            this.chatClient = this.betaClient;
            this.activeModel = modelName;
            return res;
          } catch (betaErr) {
            lastErr = betaErr;
          }
        }
        if (!isToolResult && (isRetryableOverloadError(lastErr) || isModelNotFoundError(lastErr))) {
          logger.warn(`Model '${modelName}' busy/unavailable (${lastErr.message}); trying fallback...`);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr || new Error('All Gemini models failed.');
  }

  /**
   * Send user command to Gemini via Interactions API with minimal thinking & 1-round-trip action shortcut
   */
  async processCommand(userText, controller) {
    const resetMs = this.config.sessionResetMinutes * 60 * 1000;
    if (this.lastInteractionAt && Date.now() - this.lastInteractionAt > resetMs) {
      this.resetConversation();
    }

    const tools = controller.getToolDeclarations();
    const systemInstruction = buildSystemInstruction();

    let interaction;
    try {
      interaction = await this._createChatInteraction({
        model: this.activeModel,
        input: userText,
        system_instruction: systemInstruction,
        tools,
        ...(this.previousInteractionId
          ? { previous_interaction_id: this.previousInteractionId }
          : {}),
      });
    } catch (err) {
      if (this.previousInteractionId) {
        logger.warn(`Resetting conversation state after API error: ${err.message}`);
        this.resetConversation();
        interaction = await this._createChatInteraction({
          model: this.activeModel,
          input: userText,
          system_instruction: systemInstruction,
          tools,
        });
      } else {
        throw err;
      }
    }

    let rounds = 0;
    while (rounds < 6) {
      const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
      const functionCalls = steps.filter((s) => s.type === 'function_call');
      if (functionCalls.length === 0) {
        break;
      }

      rounds++;
      const functionResults = [];
      const quickSummaries = [];
      let allFireAndForget = true;

      for (const fc of functionCalls) {
        const execOut = await controller.executeTool(fc.name, fc.arguments || {});
        const resultContent = [{ type: 'text', text: execOut.text }];
        if (execOut.imageBase64) {
          allFireAndForget = false;
          resultContent.push({
            type: 'image',
            data: execOut.imageBase64,
            mime_type: execOut.imageMimeType || 'image/png',
          });
        }

        const isQuickTool =
          FIRE_AND_FORGET_TOOLS.has(fc.name) ||
          (fc.name === 'manage_windows' && fc.arguments?.operation !== 'list');

        if (isQuickTool) {
          const summary = summarizeQuickAction(fc.name, fc.arguments || {}, execOut.text);
          if (summary) quickSummaries.push(summary);
          else allFireAndForget = false;
        } else {
          allFireAndForget = false;
        }

        functionResults.push({
          type: 'function_result',
          name: fc.name,
          call_id: fc.id,
          result: resultContent,
        });
      }

      // Skip the slow 2nd Gemini round-trip if we only ran simple fire-and-forget actions!
      if (allFireAndForget && quickSummaries.length > 0) {
        // Don't leave a dangling requires_action previous_interaction_id on the server
        this.resetConversation();
        return quickSummaries.join(' ');
      }

      interaction = await this._createChatInteraction(
        {
          model: this.activeModel,
          previous_interaction_id: interaction.id,
          system_instruction: systemInstruction,
          tools,
          input: functionResults,
        },
        { isToolResult: true },
      );
    }

    this.previousInteractionId = interaction.id || null;
    this.lastInteractionAt = Date.now();

    const reply = (interaction.output_text || '').trim();
    return reply || 'Done.';
  }

  /**
   * Generate expressive speech WAV buffer using Gemini TTS (with immediate 429 cutover)
   */
  async synthesizeSpeech(text) {
    if (this.ttsUnavailable) return null;

    const cleanText = text
      .replace(/[*_`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return null;

    const buildPayload = (modelName) => ({
      model: modelName,
      store: false,
      input: [
        {
          type: 'user_input',
          content: [
            {
              type: 'text',
              text: cleanText,
              annotations: [
                {
                  type: 'speech_metadata',
                  style: this.config.geminiTtsStyle,
                },
              ],
            },
          ],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [{ voice: this.config.geminiTtsVoice }],
      },
    });

    try {
      if (this.ttsClient) {
        const interaction = await this.ttsClient.client.interactions.create(
          buildPayload(this.ttsClient.model),
        );
        if (!interaction.output_audio?.data) {
          throw new Error('Gemini TTS returned no audio data.');
        }
        return Buffer.from(interaction.output_audio.data, 'base64');
      }

      const candidates = [
        { label: 'v1beta', client: this.betaClient, model: this.config.ttsModel },
        { label: 'v1', client: this.client, model: this.config.ttsModel },
      ];
      if (this.config.ttsModel !== 'gemini-3.8-flash-tts') {
        candidates.push({ label: 'v1beta', client: this.betaClient, model: 'gemini-3.8-flash-tts' });
      }

      for (const cand of candidates) {
        try {
          const interaction = await cand.client.interactions.create(buildPayload(cand.model));
          if (interaction.output_audio?.data) {
            this.ttsClient = { client: cand.client, model: cand.model };
            logger.info(`Gemini TTS active (${cand.model} via ${cand.label}).`);
            return Buffer.from(interaction.output_audio.data, 'base64');
          }
        } catch (err) {
          if (isRateLimitError(err)) {
            this.ttsUnavailable = true;
            logger.warn('Gemini TTS daily free-tier limit reached; switching to instant Windows WinRT voice.');
            return null;
          }
          if (!isModelNotFoundError(err)) {
            throw err;
          }
        }
      }

      this.ttsUnavailable = true;
      return null;
    } catch (err) {
      if (isRateLimitError(err)) {
        this.ttsUnavailable = true;
        logger.warn('Gemini TTS rate limit reached; switching to instant Windows WinRT voice.');
        return null;
      }
      throw err;
    }
  }

  async generateStructuredJson(prompt, schema, systemInstruction) {
    const payload = {
      model: this.activeModel,
      store: false,
      input: prompt,
      response_format: schema,
    };
    if (systemInstruction) {
      payload.system_instruction = systemInstruction;
    }
    const interaction = await this._createChatInteraction(payload);
    return (interaction.output_text || '').trim();
  }
}
