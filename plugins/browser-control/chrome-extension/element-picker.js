// Talon Element Picker - Content Script
// Injected into the active tab to let the user pick a page element.
// Highlights hovered elements and sends info back on click.

(function () {
  // Guard against double-injection
  if (window.__talonElementPickerActive) return;
  window.__talonElementPickerActive = true;

  // ── Overlay setup ──
  const overlay = document.createElement('div');
  overlay.id = '__talon-element-picker-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    outline: '2px solid #5296f0',
    background: 'rgba(82, 150, 240, 0.1)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    transition: 'top 0.05s, left 0.05s, width 0.05s, height 0.05s',
    boxSizing: 'border-box',
  });
  document.documentElement.appendChild(overlay);

  let currentTarget = null;

  // ── Helpers ──

  function getUniqueSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let current = el;
    while (current && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(Boolean);
        if (classes.length) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }
      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function getElementInfo(el) {
    const rect = el.getBoundingClientRect();
    const textContent = (el.textContent || '').trim().substring(0, 500);
    const outerHTML = el.outerHTML.substring(0, 1000);
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: Array.from(el.classList),
      textContent,
      selector: getUniqueSelector(el),
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      outerHTML,
    };
  }

  function positionOverlay(el) {
    const rect = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
    });
  }

  // ── Cleanup ──

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    window.__talonElementPickerActive = false;
  }

  // ── Event handlers ──

  function onMouseMove(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === overlay) return;
    if (target === currentTarget) return;
    currentTarget = target;
    positionOverlay(target);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = currentTarget || document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === overlay) {
      cleanup();
      return;
    }

    const info = getElementInfo(target);
    chrome.runtime.sendMessage({ type: 'element_picked', element: info });
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'element_picker_cancelled' });
      cleanup();
    }
  }

  // ── Start listening ──
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();
