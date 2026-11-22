/**
 * ULTRON Multi-Agent HUD Frontend Controller
 * Connects to the local SSE event stream, updates all 6 agent cards,
 * controls the Arc Reactor state, and renders the audio visualizer.
 */

const AGENT_DATA = {
  ultron: { name: 'Commander Ultron', avatar: '⚡', role: 'Supreme Mission Control & PC Automation' },
  vision: { name: 'Vision', avatar: '💻', role: 'Chief Software Engineer & Backend Architect' },
  friday: { name: 'Friday', avatar: '📄', role: 'Executive Document Architect (Word & PDF)' },
  jarvis: { name: 'Jarvis', avatar: '🔍', role: 'Chief QA Engineer & Security Inspector' },
  veronica: { name: 'Veronica', avatar: '🎬', role: 'Chief Visual Media & Video Director' },
  sentinel: { name: 'Sentinel', avatar: '🛡️', role: 'System Operator & Hardware Guardian' },
};

let currentActiveAgent = 'ultron';
let isSpeaking = false;
let isListening = false;
let isMuted = false;
let audioLevel = 0.05;

// DOM Elements
const activeAvatarEl = document.getElementById('active-agent-avatar');
const activeNameEl = document.getElementById('active-agent-name');
const activeTitleEl = document.getElementById('active-agent-title');
const agentStatePill = document.getElementById('agent-state-pill');
const reactorWrapper = document.getElementById('reactor-core-btn');
const reactorCaption = document.getElementById('reactor-caption');
const transcriptStream = document.getElementById('transcript-stream');
const cmdInput = document.getElementById('cmd-input');
const sendBtn = document.getElementById('send-btn');
const muteBtn = document.getElementById('mute-toggle-btn');
const muteLabel = document.getElementById('mute-label');
const assembleBtn = document.getElementById('assemble-btn');
const closeHudBtn = document.getElementById('close-hud-btn');
const minimizeModal = document.getElementById('minimize-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const ramVal = document.getElementById('ram-val');
const batVal = document.getElementById('bat-val');

// 1. Server-Sent Events (SSE) Client
function connectEventSource() {
  const es = new EventSource('/api/events');

  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleServerEvent(msg.type, msg.data);
    } catch (err) {
      console.warn('SSE Parse error:', err);
    }
  };

  es.onerror = () => {
    // EventSource will automatically retry connecting
    setReactorState('disconnected');
  };
}

function handleServerEvent(type, data) {
  switch (type) {
    case 'init':
    case 'status':
      updateSystemState(data);
      break;

    case 'telemetry':
      updateTelemetry(data);
      break;

    case 'transcript':
      appendTranscript(data.role, data.text, data.agent);
      break;

    case 'agent_speaking':
      setSpeaking(data.agent, true, data.text);
      break;

    case 'speech_end':
      setSpeaking(data.agent, false);
      break;

    case 'wake':
      setWake(data.agent, data.keyword);
      break;

    case 'audio_level':
      audioLevel = Math.max(0.05, Math.min(1.0, data.level || 0.1));
      break;

    case 'tasks':
      updateTasks(data);
      break;

    case 'minimize_hud':
      showMinimizeModal();
      break;
  }
}

function updateSystemState(data) {
  if (data.activeAgent) {
    setActiveAgent(data.activeAgent);
  }
  isMuted = Boolean(data.muted);
  updateMuteUI();

  if (data.busy) {
    setReactorState('busy');
  } else {
    setReactorState('standby');
  }

  if (Array.isArray(data.activeTasks)) {
    updateTasks(data.activeTasks);
  }
}

function updateTelemetry(info) {
  if (!info) return;
  if (info.memoryLoad !== undefined) {
    ramVal.textContent = `${info.memoryLoad}%`;
  }
  if (info.batteryPercent !== undefined) {
    const plug = info.batteryCharging ? ' ⚡' : '';
    batVal.textContent = `${info.batteryPercent}%${plug}`;
  }
}

function setActiveAgent(agentKey) {
  const norm = String(agentKey || 'ultron').toLowerCase();
  currentActiveAgent = norm;
  const info = AGENT_DATA[norm] || AGENT_DATA.ultron;

  activeAvatarEl.textContent = info.avatar;
  activeNameEl.textContent = info.name.toUpperCase();
  activeTitleEl.textContent = info.role;

  // Highlight selected agent card
  document.querySelectorAll('.agent-card').forEach((card) => {
    const isTarget = card.getAttribute('data-agent') === norm;
    card.classList.toggle('active', isTarget);
  });
}

function setSpeaking(agent, speaking, text = '') {
  isSpeaking = speaking;
  if (speaking) {
    setActiveAgent(agent);
    agentStatePill.textContent = 'SPEAKING';
    agentStatePill.className = 'operative-state-pill speaking';
    reactorWrapper.className = 'arc-reactor-wrapper speaking';
    reactorCaption.textContent = `${agent.toUpperCase()} TRANSMITTING SPEECH...`;
    if (text) appendTranscript('agent', text, agent);
  } else {
    agentStatePill.textContent = 'STANDBY';
    agentStatePill.className = 'operative-state-pill';
    reactorWrapper.className = 'arc-reactor-wrapper';
    reactorCaption.textContent = 'CLICK CORE OR SAY "HEY ULTRON"';
  }
}

function setWake(agent, text) {
  setActiveAgent(agent);
  isListening = true;
  agentStatePill.textContent = 'LISTENING';
  agentStatePill.className = 'operative-state-pill listening';
  reactorWrapper.className = 'arc-reactor-wrapper listening';
  reactorCaption.textContent = `LISTENING FOR COMMAND (${agent.toUpperCase()})...`;

  setTimeout(() => {
    if (isListening && !isSpeaking) {
      isListening = false;
      agentStatePill.textContent = 'STANDBY';
      agentStatePill.className = 'operative-state-pill';
      reactorWrapper.className = 'arc-reactor-wrapper';
      reactorCaption.textContent = 'CLICK CORE OR SAY "HEY ULTRON"';
    }
  }, 6000);
}

function setReactorState(state) {
  if (state === 'busy') {
    agentStatePill.textContent = 'WORKING';
    agentStatePill.className = 'operative-state-pill listening';
    reactorCaption.textContent = 'OPERATIVE EXECUTING TASK...';
  } else if (state === 'standby' && !isSpeaking && !isListening) {
    agentStatePill.textContent = 'STANDBY';
    agentStatePill.className = 'operative-state-pill';
    reactorWrapper.className = 'arc-reactor-wrapper';
    reactorCaption.textContent = 'CLICK CORE OR SAY "HEY ULTRON"';
  }
}

function updateMuteUI() {
  if (isMuted) {
    muteBtn.style.borderColor = 'var(--neon-gold)';
    muteBtn.style.color = 'var(--neon-gold)';
    muteLabel.textContent = 'MUTED (PAUSED)';
  } else {
    muteBtn.style.borderColor = '';
    muteBtn.style.color = '';
    muteLabel.textContent = 'UNMUTED';
  }
}

function updateTasks(tasks) {
  const taskArray = Array.isArray(tasks) ? tasks : [];
  ['vision', 'friday', 'jarvis', 'veronica'].forEach((ag) => {
    const card = document.getElementById(`card-${ag}`);
    const taskBox = document.getElementById(`task-box-${ag}`);
    const taskLbl = document.getElementById(`task-lbl-${ag}`);
    const statusTxt = document.getElementById(`status-txt-${ag}`);

    const activeTask = taskArray.find((t) => t.agent.toLowerCase() === ag);
    if (activeTask) {
      taskBox?.classList.remove('hidden');
      if (taskLbl) taskLbl.textContent = `${activeTask.summary} (${activeTask.elapsedSec || 0}s)`;
      if (statusTxt) statusTxt.textContent = 'Working in background...';
      card?.querySelector('.dot')?.classList.add('working');
    } else {
      taskBox?.classList.add('hidden');
      if (statusTxt) statusTxt.textContent = `Standby (Say "Hey ${ag.charAt(0).toUpperCase() + ag.slice(1)}")`;
      card?.querySelector('.dot')?.classList.remove('working');
    }
  });
}

function appendTranscript(role, text, agent = 'Ultron') {
  if (!text) return;
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${role}`;

  const author = document.createElement('div');
  author.className = 'msg-author';
  author.textContent = role === 'user' ? 'YOU' : (agent || 'ULTRON').toUpperCase();

  const content = document.createElement('div');
  content.className = 'msg-content';
  content.textContent = text;

  bubble.appendChild(author);
  bubble.appendChild(content);

  transcriptStream.appendChild(bubble);
  transcriptStream.scrollTop = transcriptStream.scrollHeight;
}

// 2. Interactive Handlers
reactorWrapper.addEventListener('click', () => {
  setWake(currentActiveAgent, 'Manual Trigger');
  fetch('/api/listen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: currentActiveAgent }),
  }).catch(() => {});
});

sendBtn.addEventListener('click', sendCommand);
cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCommand();
});

function sendCommand() {
  const val = cmdInput.value.trim();
  if (!val) return;
  appendTranscript('user', val);
  cmdInput.value = '';

  fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: val, agent: currentActiveAgent }),
  }).catch((err) => {
    appendTranscript('system', `Error sending command: ${err.message}`);
  });
}

// Quick Chips
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const cmd = chip.getAttribute('data-cmd');
    if (cmd) {
      cmdInput.value = cmd;
      sendCommand();
    }
  });
});

// Agent Cards Click to Talk
document.querySelectorAll('.agent-card').forEach((card) => {
  const talkBtn = card.querySelector('.talk-btn');
  const agentKey = card.getAttribute('data-agent');

  card.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') {
      setActiveAgent(agentKey);
      fetch('/api/switch_agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentKey }),
      });
    }
  });

  talkBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveAgent(agentKey);
    setWake(agentKey, 'Talk Button');
    fetch('/api/listen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentKey }),
    });
  });
});

// Controls
muteBtn.addEventListener('click', () => {
  fetch('/api/mute', { method: 'POST' });
});

assembleBtn.addEventListener('click', () => {
  fetch('/api/assemble', { method: 'POST' });
});

closeHudBtn.addEventListener('click', () => {
  showMinimizeModal();
});

modalCloseBtn.addEventListener('click', () => {
  minimizeModal.classList.add('hidden');
  // Attempt to close standalone window via window.close()
  window.close();
});

function showMinimizeModal() {
  minimizeModal.classList.remove('hidden');
}

// 3. Audio Waveform Visualizer
const waveCanvas = document.getElementById('waveform-canvas');
const waveCtx = waveCanvas.getContext('2d');
let wavePhase = 0;

function drawWaveform() {
  requestAnimationFrame(drawWaveform);
  waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);

  const w = waveCanvas.width;
  const h = waveCanvas.height;
  const centerY = h / 2;

  const amp = isSpeaking ? 22 : isListening ? 15 : 4;
  const speed = isSpeaking ? 0.12 : isListening ? 0.08 : 0.03;
  wavePhase += speed;

  waveCtx.lineWidth = 2;
  waveCtx.strokeStyle = isSpeaking
    ? '#00ff88'
    : isListening
    ? '#ffaa00'
    : 'rgba(0, 240, 255, 0.5)';
  waveCtx.shadowBlur = isSpeaking || isListening ? 10 : 4;
  waveCtx.shadowColor = waveCtx.strokeStyle;

  waveCtx.beginPath();
  for (let x = 0; x < w; x++) {
    const normX = (x / w) * Math.PI * 4;
    const envelope = Math.sin((x / w) * Math.PI); // taper edges
    const y = centerY + Math.sin(normX + wavePhase) * amp * envelope;
    if (x === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();
}

// Start
connectEventSource();
drawWaveform();
