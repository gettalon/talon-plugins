// Talon Side Panel — Standalone chat UI
// Communicates with background.js via chrome.runtime messaging + port

const messagesEl = document.getElementById('messages');
const emptyState = document.getElementById('emptyState');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const streamingIndicator = document.getElementById('streamingIndicator');
const attachCtxBtn = document.getElementById('attachCtxBtn');
const contextBar = document.getElementById('contextBar');
const contextText = document.getElementById('contextText');
const closeContext = document.getElementById('closeContext');

let isStreaming = false;
let currentStreamEl = null;
let currentStreamText = '';
let pageContext = null;
let port = null;

// ── Port connection for streaming ──

function connectPort() {
  port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener(handleStreamMessage);
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectPort, 1000);
  });
}

function handleStreamMessage(msg) {
  switch (msg.type) {
    case 'stream_delta':
      if (!currentStreamEl) {
        currentStreamEl = addMessage('assistant', '');
        currentStreamText = '';
      }
      currentStreamText += msg.text;
      currentStreamEl.innerHTML = renderMarkdown(currentStreamText) + '<span class="cursor"></span>';
      scrollToBottom();
      break;

    case 'stream_end':
      if (currentStreamEl) {
        currentStreamEl.innerHTML = renderMarkdown(currentStreamText);
      }
      currentStreamEl = null;
      currentStreamText = '';
      setStreaming(false);
      break;

    case 'tool_use':
      addToolCall(msg.toolName, msg.arguments, msg.callId);
      break;

    case 'tool_result':
      updateToolResult(msg.callId, msg.output, msg.isError);
      break;

    case 'permission_request':
      addPermissionRequest(msg.requestId, msg.toolName, msg.arguments);
      break;

    case 'error':
      addSystemMessage('Error: ' + (msg.message || 'Unknown error'));
      setStreaming(false);
      break;
  }
}

// ── Status polling ──

function checkStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (resp) => {
    if (chrome.runtime.lastError) return;
    const isConnected = resp?.connected;
    statusBadge.className = 'status-badge ' + (isConnected ? 'connected' : 'disconnected');
    statusText.textContent = isConnected ? 'Connected' : 'Offline';
    sendBtn.disabled = !isConnected || isStreaming || !input.value.trim();
  });
}

setInterval(checkStatus, 3000);
checkStatus();

// ── Load chat history ──

function loadHistory() {
  chrome.runtime.sendMessage({ type: 'chat_history' }, (history) => {
    if (chrome.runtime.lastError || !history || !history.length) return;
    emptyState.style.display = 'none';
    for (const msg of history) {
      addMessage(msg.role, msg.text);
    }
    scrollToBottom();
  });
}

// ── Send message ──

function sendMessage() {
  const text = input.value.trim();
  if (!text || isStreaming) return;

  emptyState.style.display = 'none';
  addMessage('user', text);
  input.value = '';
  autoResize();
  setStreaming(true);

  const payload = { type: 'chat_send', text };
  if (pageContext) {
    payload.context = pageContext;
    clearContext();
  }

  chrome.runtime.sendMessage(payload, (resp) => {
    if (chrome.runtime.lastError || resp?.error) {
      addSystemMessage('Failed to send: ' + (resp?.error || chrome.runtime.lastError.message));
      setStreaming(false);
    }
  });
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
input.addEventListener('input', () => {
  autoResize();
  checkStatus();
});

// ── New chat ──

newChatBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'chat_new' }, () => {
    messagesEl.innerHTML = '';
    messagesEl.appendChild(emptyState);
    emptyState.style.display = '';
    currentStreamEl = null;
    currentStreamText = '';
    setStreaming(false);
  });
});

// ── Page context ──

attachCtxBtn.addEventListener('click', async () => {
  if (pageContext) {
    clearContext();
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: window.location.href,
        title: document.title,
        selection: window.getSelection()?.toString()?.substring(0, 2000) || '',
        text: document.body?.innerText?.substring(0, 3000) || '',
      }),
    });
    if (results?.[0]?.result) {
      const ctx = results[0].result;
      pageContext = ctx;
      contextText.textContent = ctx.title || ctx.url;
      contextBar.classList.add('visible');
      attachCtxBtn.classList.add('active');
    }
  } catch (err) {
    addSystemMessage('Cannot access page: ' + err.message);
  }
});

closeContext.addEventListener('click', clearContext);

function clearContext() {
  pageContext = null;
  contextBar.classList.remove('visible');
  attachCtxBtn.classList.remove('active');
}

// ── DOM helpers ──

function addMessage(role, text) {
  const group = document.createElement('div');
  group.className = 'msg-group ' + role;

  const label = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = role === 'user' ? 'You' : 'Talon';
  group.appendChild(label);

  const bubble = document.createElement('div');
  bubble.className = 'msg';
  bubble.innerHTML = renderMarkdown(text);
  group.appendChild(bubble);

  messagesEl.appendChild(group);
  scrollToBottom();
  return bubble;
}

function addSystemMessage(text) {
  const group = document.createElement('div');
  group.className = 'msg-group system';
  const bubble = document.createElement('div');
  bubble.className = 'msg';
  bubble.textContent = text;
  group.appendChild(bubble);
  messagesEl.appendChild(group);
  scrollToBottom();
}

function addToolCall(toolName, args, callId) {
  const el = document.createElement('div');
  el.className = 'tool-call';
  el.dataset.callId = callId || '';

  const header = document.createElement('div');
  header.className = 'tool-call-header';
  header.innerHTML = `<span class="tool-icon">&#9881;</span><span>${escapeHtml(toolName)}</span>`;
  header.addEventListener('click', () => el.classList.toggle('expanded'));

  const body = document.createElement('div');
  body.className = 'tool-call-body';
  try {
    body.textContent = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
  } catch { body.textContent = String(args); }

  el.appendChild(header);
  el.appendChild(body);
  messagesEl.appendChild(el);
  scrollToBottom();
}

function updateToolResult(callId, output, isError) {
  if (!callId) return;
  const el = messagesEl.querySelector(`.tool-call[data-call-id="${CSS.escape(callId)}"]`);
  if (!el) return;
  const header = el.querySelector('.tool-call-header');
  const badge = document.createElement('span');
  badge.className = 'tool-result-badge ' + (isError ? 'error' : 'success');
  badge.textContent = isError ? 'error' : 'done';
  header.appendChild(badge);
}

function addPermissionRequest(requestId, toolName, args) {
  const card = document.createElement('div');
  card.className = 'permission-card';

  const title = document.createElement('div');
  title.className = 'permission-title';
  title.innerHTML = `&#128274; Permission Required`;

  const detail = document.createElement('div');
  detail.className = 'permission-detail';
  let detailText = toolName || 'Unknown tool';
  try {
    if (args) detailText += '\n' + (typeof args === 'string' ? args : JSON.stringify(args, null, 2));
  } catch {}
  detail.textContent = detailText;

  const btns = document.createElement('div');
  btns.className = 'permission-btns';

  const allowBtn = document.createElement('button');
  allowBtn.className = 'btn-allow';
  allowBtn.textContent = 'Allow';
  allowBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'permission_response', requestId, allowed: true });
    card.remove();
  });

  const denyBtn = document.createElement('button');
  denyBtn.className = 'btn-deny';
  denyBtn.textContent = 'Deny';
  denyBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'permission_response', requestId, allowed: false });
    card.remove();
  });

  btns.appendChild(allowBtn);
  btns.appendChild(denyBtn);
  card.appendChild(title);
  card.appendChild(detail);
  card.appendChild(btns);
  messagesEl.appendChild(card);
  scrollToBottom();
}

function setStreaming(val) {
  isStreaming = val;
  streamingIndicator.classList.toggle('visible', val);
  sendBtn.disabled = val || !input.value.trim();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Simple markdown renderer ──

function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Line breaks (but not inside pre blocks)
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> in pre blocks
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (match) => {
    return match.replace(/<br>/g, '\n');
  });

  return html;
}

// ── Init ──

connectPort();
loadHistory();
