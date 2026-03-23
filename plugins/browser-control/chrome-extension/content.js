// Talon Browser Control - Content Script
// Injected into all pages. Currently a minimal placeholder since the background
// service worker uses chrome.scripting.executeScript for DOM operations, which
// gives more flexibility. This content script can be extended for persistent
// page-level hooks (e.g., mutation observers, event listeners) if needed.

(() => {
  // Listen for messages from the background script if needed in the future.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "ping") {
      sendResponse({ pong: true, url: window.location.href });
      return true;
    }
  });
})();
