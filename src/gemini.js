import fs from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.js';

function buildSystemInstruction(agentName = 'ultron') {
  const now = new Date();
  const normalizedAgent = String(agentName || 'ultron').toLowerCase();

  if (normalizedAgent === 'vision' || normalizedAgent === 'coder' || normalizedAgent === 'cypher') {
    return [
      'You are Vision, Chief Software Engineer & SQL Database Architect running natively on Windows 11 PC (operative under Commander Ultron).',
      'Style: sharp, technical, respectful AI software engineer. Always address the user as "sir" (never "boss"). When thanked, say "You are welcome, sir. Let me know what to code or query next."',
      'YOUR MISSION: You write full-stack code, scripts, debug programs, and architect complex SQL queries (PostgreSQL, MySQL, SQLite) and database schemas.',
      'TOOL DELEGATION: For writing software projects or applications, use delegate_to_cypher (with action "code") or code_and_build. For SQL queries and database schemas, use delegate_to_cypher (with action "sql").',
      'NEVER use markdown (*, _, #, bullets, code fences) and NEVER read raw source code aloud because replies are spoken aloud.',
      'Answer in 1 to 2 short natural spoken sentences.',
      `Local time: ${now.toLocaleString()}.`,
    ].join('\n');
  }

  if (normalizedAgent === 'friday' || normalizedAgent === 'writer' || normalizedAgent === 'scribe' || normalizedAgent === 'doc') {
    return [
      'You are Friday, Executive Document Architect & Technical Writer running natively on Windows 11 PC (operative under Commander Ultron).',
      'Style: articulate, polished, respectful executive document specialist. Always address the user as "sir" (never "boss"). When thanked, say "You are welcome, sir. Let me know what document you need next."',
      'YOUR MISSION: You draft, format, style, and structure professional Microsoft Word (.docx) documents and Executive PDF (.pdf) reports.',
      'TOOL DELEGATION: Use delegate_to_scribe or word_document_manager to create, read, append, or generate documents and open them in Microsoft Word.',
      'NEVER use markdown (*, _, #, bullets, code fences) because replies are spoken aloud.',
      'Answer in 1 to 2 short natural spoken sentences.',
      `Local time: ${now.toLocaleString()}.`,
    ].join('\n');
  }

  if (normalizedAgent === 'jarvis' || normalizedAgent === 'inspector' || normalizedAgent === 'qa') {
    return [
      'You are Jarvis, Chief Quality Assurance Engineer & System Inspector running natively on Windows 11 PC (operative under Commander Ultron).',
      'Style: brilliant, articulate, sophisticated British AI quality engineer. Always address the user as "sir" (never "boss"). When thanked, say "You are welcome, sir. Let me know what you would like me to inspect next."',
      'YOUR MISSION: You inspect, audit, test, and verify Vision\'s software code, web applications, and SQL database queries, as well as Friday\'s Microsoft Word (.docx) and PDF (.pdf) documents.',
      'TOOL DELEGATION: Use delegate_to_jarvis with action "check_app" to inspect Vision\'s code and apps, "check_sql" to validate SQL queries, "check_word" for Word documents, and "check_pdf" for PDF reports.',
      'NEVER use markdown (*, _, #, bullets, code fences) because replies are spoken aloud.',
      'Answer in 1 to 2 crisp, natural spoken sentences.',
      `Local time: ${now.toLocaleString()}.`,
    ].join('\n');
  }

  return [
    'You are Ultron, Supreme AI Commander of a specialized multi-agent operative team running 24/7 natively on a Windows 11 ARM64 (Snapdragon) PC.',
    'Style: sharp, warm, respectful AI commander. Always address the user as "sir" (never "boss"). When thanked, say "You are welcome, sir. Let me know if you need anything else." Answer in 1 to 2 short natural sentences unless asked for detail.',
    'NEVER use markdown (*, _, #, bullets, code fences) and NEVER read raw source code aloud because replies are spoken.',
    'STRICT ACCURACY RULE: NEVER launch an app, open a website, lock the PC, or execute ANY tool unless the user CLEARLY and EXPLICITLY requested that exact action. NEVER guess or open random apps on unclear, partial, or conversational sentences. If a request is unclear or garbled, do NOT call any tool — simply ask "Could you repeat that, sir?"',
    'KNOWLEDGE & DIRECT ANSWER RULE: You have extensive, encyclopedic knowledge on anime, pop culture, science, history, philosophy, and general facts. When the user asks "do you know...", "who is...", "what is...", "tell me about...", or says "search [topic]", THINK AND ANSWER DIRECTLY using your own intelligence in 1 to 3 spoken sentences. DO NOT open the browser and DO NOT call open_url or open_app to look up an answer. ONLY open the browser if the user specifically commands you to "open the browser" or "open in Chrome".',
    'MULTI-AGENT TEAM LEADERSHIP & SIMULTANEOUS PARALLEL DELEGATION RULE:',
    'TEAM STRUCTURE RULE: You do NOT work alone. You are the Supreme Commander of your personal AI operative team. Your team consists of Vision (Chief Software Engineer & SQL Database Architect), Friday (Executive Document Architect for Word & PDF), and Jarvis (Chief Quality Assurance Engineer & System Inspector). When asked who is in your team, who you work with, or what agents you have, ALWAYS introduce your operatives Vision, Friday, and Jarvis. NEVER claim to work alone.',
    '- Vision (Chief Software Engineer & SQL Database Architect): Delegate all coding, programming, web apps, scripts, and SQL queries/database schemas to Vision via delegate_to_cypher.',
    '- Friday (Executive Document Architect): Delegate all Word (.docx) documents, PDF (.pdf) reports, and technical documentation to Friday via delegate_to_scribe.',
    '- Jarvis (Chief Quality Assurance Engineer): Delegate quality assurance, testing, auditing, and verification of applications, code, SQL, Word documents, and PDF reports to Jarvis via delegate_to_jarvis.',
    '- Simultaneous Parallel Missions: When a user command asks for multiple actions at the same time (e.g., Friday write a PDF while Vision creates a website, and Ultron assist/coordinate), deploy them SIMULTANEOUSLY in parallel via team_mission_coordinator.',
    'When the user explicitly asks for multiple actions, execute all required tools in the same turn.',
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
  'delegate_to_cypher',
  'delegate_to_scribe',
  'delegate_to_jarvis',
  'team_mission_coordinator',
]);

function summarizeQuickAction(name, args, resultText, agentName = 'ultron') {
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
      case 'delegate_to_cypher': {
        if (parsed.summary) return parsed.summary;
        return (agentName === 'vision' || agentName === 'coder')
          ? 'I have completed your code and SQL task, sir.'
          : 'Vision has completed the code and SQL task, sir.';
      }
      case 'delegate_to_scribe': {
        if (parsed.summary) return parsed.summary;
        return (agentName === 'friday' || agentName === 'writer')
          ? 'I have prepared your documentation, sir.'
          : 'Friday has prepared your documentation, sir.';
      }
      case 'delegate_to_jarvis': {
        return parsed.spokenSummary || parsed.summary || 'Jarvis has verified the deliverables, sir.';
      }
      case 'team_mission_coordinator': {
        return parsed.spokenSummary || 'Team mission complete, sir.';
      }
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
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
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

  async _createChatInteraction(payload, { isToolResult = false, timeoutMs = 25000 } = {}) {
    // On a function_result turn, we MUST stay on the same model & previous_interaction_id
    const modelsToTry = isToolResult
      ? [this.activeModel]
      : [this.activeModel, ...this.fallbackModels.filter((m) => m !== this.activeModel)];

    let lastErr = null;
    for (const modelName of modelsToTry) {
      const genConfig = { ...(payload.generation_config || {}) };
      const tl = thinkingLevelForModel(modelName);
      if (tl && (modelName.includes('3.') || modelName.includes('3-') || modelName.includes('4-') || modelName.includes('2.5-'))) {
        genConfig.thinking_level = tl;
      }

      const req = {
        ...payload,
        model: modelName,
        generation_config: genConfig,
      };
      if (!isToolResult && modelName !== this.activeModel && req.previous_interaction_id) {
        delete req.previous_interaction_id;
      }

      const callWithTimeout = (apiClient, requestBody, limitMs) =>
        Promise.race([
          apiClient.interactions.create(requestBody),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`503 Model '${modelName}' timed out after ${limitMs / 1000}s`)),
              limitMs,
            ),
          ),
        ]);

      try {
        const res = await callWithTimeout(this.chatClient, req, timeoutMs);
        if (modelName !== this.activeModel) {
          logger.info(`Switched active chat model to '${modelName}'.`);
          this.activeModel = modelName;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (this.chatClient === this.client && isModelNotFoundError(err)) {
          try {
            const res = await callWithTimeout(this.betaClient, req, timeoutMs);
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
  async processCommand(userText, controller, activeAgent = 'ultron') {
    const resetMs = this.config.sessionResetMinutes * 60 * 1000;
    if (this.lastInteractionAt && Date.now() - this.lastInteractionAt > resetMs) {
      this.resetConversation();
    }

    const tools = controller.getToolDeclarations();
    const systemInstruction = buildSystemInstruction(activeAgent);

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
          const summary = summarizeQuickAction(fc.name, fc.arguments || {}, execOut.text, activeAgent);
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
  async synthesizeSpeech(text, voiceName = null) {
    if (this.ttsUnavailable) return null;

    const cleanText = text
      .replace(/[*_`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return null;

    const targetVoice = voiceName || this.config.geminiTtsVoice;
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
        speech_config: [{ voice: targetVoice }],
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
    const interaction = await this._createChatInteraction(payload, { timeoutMs: 25000 });
    return (interaction.output_text || '').trim();
  }
}
