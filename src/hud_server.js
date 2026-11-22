import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR } from './config.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Open the Ultron Holographic HUD in standalone desktop app window mode
 */
export function openHudWindow(port = 3800) {
  const url = `http://localhost:${port}`;
  logger.info(`[HUD] Opening Holographic HUD window at: ${url}`);

  const psCommand = `
    $edgeApp = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" -ErrorAction SilentlyContinue).'(Default)'
    if ($edgeApp -and (Test-Path $edgeApp)) {
        Start-Process $edgeApp -ArgumentList "--app=${url}"
    } else {
        Start-Process "${url}"
    }
  `;

  execFile(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
    { windowsHide: true },
    (err) => {
      if (err) {
        logger.warn(`Failed to launch Edge app window: ${err.message}. Trying default browser...`);
        execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, () => {});
      }
    },
  );
}

/**
 * High-performance, zero-dependency local HTTP & SSE server for the Ultron Multi-Agent HUD
 */
export class HudServer {
  constructor(config, daemon) {
    this.config = config;
    this.daemon = daemon;
    this.port = config.hudPort || 3800;
    this.server = null;
    this.sseClients = new Set();
    this.telemetryInterval = null;
  }

  start() {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`HUD Port ${this.port} is already in use. Retrying on ${this.port + 1}...`);
        this.port += 1;
        this.server.listen(this.port, '127.0.0.1');
      } else {
        logger.error(`HUD Server error: ${err.message}`);
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      logger.info(`[HUD] Ultron Holographic HUD active at: http://localhost:${this.port}`);
    });

    // Push periodic telemetry (CPU, RAM, Battery) every 5 seconds to connected HUDs
    this.telemetryInterval = setInterval(async () => {
      if (this.sseClients.size > 0 && this.daemon.controller) {
        try {
          const sysInfo = await this.daemon.controller.getSystemInfo();
          this.broadcast('telemetry', sysInfo);
        } catch {
          // ignore
        }
      }
    }, 4000);
  }

  stop() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {}
    }
    this.sseClients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Broadcast real-time events to all connected HUD browser windows
   */
  broadcast(type, data = {}) {
    if (this.sseClients.size === 0) return;
    const payload = `event: message\ndata: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  handleRequest(req, res) {
    // Enable CORS for local development/embedding
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Server-Sent Events (SSE) Stream
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('\n');

      this.sseClients.add(res);

      // Send immediate initial status payload
      const initialStatus = this.getStatusPayload();
      res.write(`event: message\ndata: ${JSON.stringify({ type: 'init', data: initialStatus })}\n\n`);

      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    // 2. API Endpoints
    if (pathname.startsWith('/api/')) {
      this.handleApi(pathname, req, res);
      return;
    }

    // 3. Static Files (public/*)
    this.handleStatic(pathname, res);
  }

  getStatusPayload() {
    const activeTasks = [];
    if (this.daemon.activeAgentTasks) {
      for (const t of this.daemon.activeAgentTasks.values()) {
        activeTasks.push({
          id: t.id,
          agent: t.agent,
          summary: t.summary,
          elapsedSec: Math.round((Date.now() - t.startTime) / 1000),
        });
      }
    }

    return {
      activeAgent: this.daemon.activeAgent || 'ultron',
      busy: this.daemon.busy || false,
      muted: this.daemon.muted || false,
      inCallMode: this.daemon.inCallMode || false,
      activeTasks,
      port: this.port,
    };
  }

  async handleApi(pathname, req, res) {
    if (req.method === 'GET' && pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatusPayload()));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        let json = {};
        try {
          if (body) json = JSON.parse(body);
        } catch {
          // ignore
        }

        switch (pathname) {
          case '/api/command': {
            const text = String(json.text || '').trim();
            const agent = String(json.agent || this.daemon.activeAgent || 'ultron').toLowerCase();
            if (!text) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'Text command is required' }));
              return;
            }
            logger.info(`[HUD_COMMAND] Executing command from UI: "${text}" [Agent: ${agent}]`);
            // Run asynchronously in daemon
            this.daemon.executeUserCommand(text, agent).catch((err) => {
              logger.error(`HUD Command error: ${err.message}`);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, status: 'dispatched', text }));
            return;
          }

          case '/api/listen': {
            const agent = String(json.agent || this.daemon.activeAgent || 'ultron').toLowerCase();
            logger.info(`[HUD] Triggering voice listen for ${agent}...`);
            this.daemon.triggerVoiceInteraction('Web HUD Trigger', '', agent);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, agent }));
            return;
          }

          case '/api/gesture': {
            const gesture = String(json.gesture || '').toLowerCase();
            logger.info(`[HUD_GESTURE] Hand gesture recognized: "${gesture.toUpperCase()}"`);
            const result = await this.handleHandGesture(gesture);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, gesture, ...result }));
            return;
          }

          case '/api/mute': {
            this.daemon.toggleMute();
            this.broadcast('status', this.getStatusPayload());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, muted: this.daemon.muted }));
            return;
          }

          case '/api/switch_agent': {
            const target = String(json.agent || 'ultron').toLowerCase();
            this.daemon.switchAgent(target);
            this.broadcast('status', this.getStatusPayload());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, activeAgent: this.daemon.activeAgent }));
            return;
          }

          case '/api/assemble': {
            logger.info('[HUD] Avengers assemble triggered from HUD UI!');
            this.daemon.triggerRollCall().catch((err) => {
              logger.error(`Assemble roll call error: ${err.message}`);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, action: 'assemble' }));
            return;
          }

          case '/api/hide': {
            // Closes/minimizes the HUD window so the user works normally while voice continues
            logger.info('[HUD] Minimizing HUD window to background tray...');
            this.broadcast('minimize_hud', {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, message: 'HUD minimized. Voice active in background.' }));
            return;
          }

          default:
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Unknown API endpoint: ${pathname}` }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Action dispatcher for recognized camera hand gestures
   */
  async handleHandGesture(gesture) {
    switch (gesture) {
      case 'palm': {
        // Open Palm (Halt / Mute / Stop speaking)
        if (this.daemon.audioOut) {
          await this.daemon.audioOut.stopSpeech();
        }
        if (!this.daemon.muted) {
          this.daemon.toggleMute();
        }
        this.broadcast('gesture_action', { gesture: 'palm', action: 'Muted audio & stopped speech' });
        return { action: 'muted_speech' };
      }

      case 'fist': {
        // Fist (Close / Minimize HUD window to background)
        this.broadcast('minimize_hud', { reason: 'fist_gesture' });
        return { action: 'minimized_hud' };
      }

      case 'point': {
        // Pointing Up (Trigger Ultron Voice Listening)
        if (this.daemon.muted) {
          this.daemon.toggleMute();
        }
        this.daemon.triggerVoiceInteraction('Hand Gesture Point', '', 'ultron');
        return { action: 'triggered_voice_listen' };
      }

      case 'peace': {
        // Peace Sign (V for Vision / Code & Backend mode)
        this.daemon.switchAgent('vision');
        this.broadcast('status', this.getStatusPayload());
        if (this.daemon.audioOut) {
          await this.daemon.audioOut.wakeReplyForAgent('vision');
        }
        return { action: 'switched_to_vision' };
      }

      case 'thumbs_up': {
        // Thumbs Up (Confirm / Avengers Assemble Roll Call)
        this.daemon.triggerRollCall().catch(() => {});
        return { action: 'triggered_assemble' };
      }

      case 'swipe_left': {
        // Swipe Left (Media Previous Track)
        if (this.daemon.controller) {
          await this.daemon.controller.executeTool('control_media_volume', { command: 'prev_track' });
        }
        return { action: 'previous_track' };
      }

      case 'swipe_right': {
        // Swipe Right (Media Next Track)
        if (this.daemon.controller) {
          await this.daemon.controller.executeTool('control_media_volume', { command: 'next_track' });
        }
        return { action: 'next_track' };
      }

      default:
        return { action: 'unknown_gesture' };
    }
  }

  handleStatic(reqPath, res) {
    let rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const cleanPath = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, cleanPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // Fallback to index.html for SPA routing
      const indexHtml = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(indexHtml));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  }
}
