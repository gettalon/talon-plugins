// Talon Browser Control - Chat Popup

let port = null;
let messages = [];
let isStreaming = false;
let pageContext = null;
let pendingPermissions = {};

// ── Connect to background ──
function connectToBackground() {
  port = chrome.runtime.connect({ name: "popup" });
  port.onMessage.addListener(handleBackgroundMessage);
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectToBackground, 1000);
  });
  // Get initial status
  chrome.runtime.sendMessage({ type: "get_status" }, updateStatus);
  // Load chat history
  chrome.runtime.sendMessage({ type: "chat_history" }, (history) => {
    if (history && history.length > 0) {
      messages = history;
      renderMessages();
    }
  });
}

function handleBackgroundMessage(msg) {
  switch (msg.type) {
    case "stream_delta":
      appendStreamDelta(msg.text);
      break;
    case "stream_end":
      finalizeStream();
      break;
    case "tool_use":
      addToolMessage(msg.toolName, msg.arguments);
      break;
    case "tool_result":
      updateToolResult(msg.callId, msg.output, msg.isError);
      break;
    case "permission_request":
      showPermission(msg.requestId, msg.toolName, msg.arguments);
      break;
    case "status":
      updateStatus(msg);
      break;
    case "error":
      addSystemMessage("Error: " + msg.message);
      isStreaming = false;
      updateSendButton();
      break;
  }
}

// ── UI Rendering ──
function renderMessages() {
  const container = document.getElementById("messages");
  if (messages.length === 0) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">&#129413;</div><div class="empty-text">Ask anything. I can see and interact with your current browser tab.</div></div>';
    return;
  }
  container.innerHTML = messages.map(renderMessage).join("");
  container.scrollTop = container.scrollHeight;
}

function renderMessage(msg) {
  switch (msg.role) {
    case "user":
      return '<div class="msg user">' + escapeHtml(msg.text) + '</div>';
    case "assistant":
      return '<div class="msg assistant">' + escapeHtml(msg.text) + '</div>';
    case "tool": {
      const resultHtml = msg.result ? '<div class="tool-result">' + escapeHtml(msg.result) + '</div>' : '';
      return '<div class="msg tool"><span class="tool-name">&#9679; ' + escapeHtml(msg.toolName) + '</span>' + resultHtml + '</div>';
    }
    case "system":
      return '<div class="msg system">' + escapeHtml(msg.text) + '</div>';
    default:
      return '';
  }
}

function appendStreamDelta(text) {
  const container = document.getElementById("messages");
  let lastMsg = container.querySelector(".msg.assistant.streaming");
  if (!lastMsg) {
    lastMsg = document.createElement("div");
    lastMsg.className = "msg assistant streaming";
    container.appendChild(lastMsg);
    isStreaming = true;
    updateSendButton();
  }
  lastMsg.textContent += text;
  container.scrollTop = container.scrollHeight;
}

function finalizeStream() {
  const container = document.getElementById("messages");
  const streaming = container.querySelector(".msg.assistant.streaming");
  if (streaming) {
    streaming.classList.remove("streaming");
    messages.push({ role: "assistant", text: streaming.textContent });
  }
  isStreaming = false;
  updateSendButton();
}

function addToolMessage(toolName, args) {
  messages.push({ role: "tool", toolName, arguments: args });
  renderMessages();
}

function updateToolResult(callId, output, isError) {
  // Find the last tool message and add result
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "tool") {
      messages[i].result = output;
      break;
    }
  }
  renderMessages();
}

function addSystemMessage(text) {
  messages.push({ role: "system", text });
  renderMessages();
}

function showPermission(requestId, toolName, args) {
  const container = document.getElementById("messages");
  const detail = toolName === "Bash" ? (JSON.parse(args || "{}").command || args) : args;
  const html = '<div class="permission" id="perm-' + requestId + '">'
    + '<div class="permission-title">&#128274; ' + escapeHtml(toolName) + '</div>'
    + '<div class="permission-detail">' + escapeHtml(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)) + '</div>'
    + '<div class="permission-btns">'
    + '<button class="btn-allow" onclick="answerPermission(\'' + requestId + '\', true)">Allow</button>'
    + '<button class="btn-deny" onclick="answerPermission(\'' + requestId + '\', false)">Deny</button>'
    + '</div></div>';
  container.insertAdjacentHTML("beforeend", html);
  container.scrollTop = container.scrollHeight;
}

window.answerPermission = function(requestId, allowed) {
  chrome.runtime.sendMessage({ type: "permission_response", requestId, allowed });
  const el = document.getElementById("perm-" + requestId);
  if (el) {
    el.innerHTML = '<div class="permission-title">' + (allowed ? "Allowed" : "Denied") + '</div>';
  }
};

// ── Send Message ──
function sendMessage() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text || isStreaming) return;

  // Add user message
  messages.push({ role: "user", text });
  renderMessages();
  input.value = "";
  autoResizeInput();

  // Send to background with optional page context
  chrome.runtime.sendMessage({
    type: "chat_send",
    text,
    context: pageContext,
  });

  // Clear context after sending
  if (pageContext) {
    pageContext = null;
    document.getElementById("contextBar").classList.remove("visible");
    document.getElementById("attachCtxBtn").classList.remove("active");
  }
}

// ── Page Context ──
async function attachPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Get selected text from the page
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || "",
    });

    pageContext = {
      url: tab.url,
      title: tab.title,
      selectedText: result?.result || "",
    };

    const contextText = document.getElementById("contextText");
    const parts = [tab.title || tab.url];
    if (pageContext.selectedText) {
      parts.push('"' + pageContext.selectedText.slice(0, 50) + (pageContext.selectedText.length > 50 ? '...' : '') + '"');
    }
    contextText.textContent = parts.join(" \u2014 ");
    document.getElementById("contextBar").classList.add("visible");
    document.getElementById("attachCtxBtn").classList.add("active");
  } catch (e) {
    console.error("Failed to get page context:", e);
  }
}

// ── Status ──
function updateStatus(status) {
  if (!status) return;
  const dot = document.getElementById("statusDot");
  dot.className = "status-dot " + (status.connected ? "connected" : "disconnected");
}

function updateSendButton() {
  document.getElementById("sendBtn").disabled = isStreaming;
}

// ── Input auto-resize ──
function autoResizeInput() {
  const input = document.getElementById("input");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 80) + "px";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ── Event listeners ──
document.getElementById("sendBtn").addEventListener("click", sendMessage);
document.getElementById("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
document.getElementById("input").addEventListener("input", autoResizeInput);
document.getElementById("attachCtxBtn").addEventListener("click", attachPageContext);
document.getElementById("closeContext").addEventListener("click", () => {
  pageContext = null;
  document.getElementById("contextBar").classList.remove("visible");
  document.getElementById("attachCtxBtn").classList.remove("active");
});
document.getElementById("newChatBtn").addEventListener("click", () => {
  messages = [];
  renderMessages();
  chrome.runtime.sendMessage({ type: "chat_new" });
});

// ── Init ──
connectToBackground();
