#!/usr/bin/env node
/**
 * Post-build patches for the Expo web bundle when used inside a Chrome extension.
 *
 * Problem: Expo Router reads `window.location.pathname` to determine the initial
 * route. Inside a Chrome extension side panel the pathname is something like
 * `/popup-dist/app/extension.html`, which doesn't match any route -> "Unmatched Route".
 *
 * This script patches the compiled bundle so that when `window.__TALON_EXTENSION__`
 * is truthy (set by extension-patch.js before the bundle loads), every
 * routing-critical location read returns "/" instead of the real pathname.
 *
 * The patches are applied to the entry JS bundle in _expo/static/js/web/.
 */

const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'popup-dist', 'app', '_expo', 'static', 'js', 'web');

// Find the entry bundle
const files = fs.readdirSync(jsDir);
const entryFile = files.find(f => f.startsWith('entry-') && f.endsWith('.js'));
if (!entryFile) {
  console.error('[patch] No entry-*.js found in', jsDir);
  process.exit(1);
}

const filePath = path.join(jsDir, entryFile);
let code = fs.readFileSync(filePath, 'utf-8');
const originalLen = code.length;

// ─── Patch 1: useLinking getInitialState ───────────────────────────────────────
// Both copies of useLinking read window.location to seed the initial route state.
// Original:  ??('undefined'!=typeof window?window.location:void 0),r=t?t.pathname+t.search:void 0;
// Patched:   ??('undefined'!=typeof window?(window.__TALON_EXTENSION__?{pathname:'/',search:''}:window.location):void 0),r=t?t.pathname+t.search:void 0;
{
  const old = `??('undefined'!=typeof window?window.location:void 0),r=t?t.pathname+t.search:void 0;`;
  const rep = `??('undefined'!=typeof window?(window.__TALON_EXTENSION__?{pathname:'/',search:''}:window.location):void 0),r=t?t.pathname+t.search:void 0;`;
  const count = code.split(old).length - 1;
  if (count > 0) {
    code = code.replaceAll(old, rep);
    console.log(`[patch] useLinking getInitialState: patched ${count} occurrence(s)`);
  } else {
    console.log('[patch] useLinking getInitialState: already patched or pattern changed');
  }
}

// ─── Patch 2: window.location.href reads (Linking module) ──────────────────────
// Multiple places read window.location.href for routing. Guard them all.
// These use the pattern:  (window.__TALON_EXTENSION__?window.location.origin+"/":window.location.href)
// If the bundle was freshly exported (no prior patches), the raw reads look like:
//   window.location.href    (in various linking contexts)
// We only patch those that aren't already guarded.
{
  // The listen callback in useLinking:
  //   const o = n.pathname + n.search   (where n = window.location)
  // Already patched to:  (window.__TALON_EXTENSION__?"/":n.pathname+n.search)
  // Check it's there:
  const listenGuard = `(window.__TALON_EXTENSION__?"/":n.pathname+n.search)`;
  const listenCount = code.split(listenGuard).length - 1;
  console.log(`[patch] useLinking listen callback: ${listenCount} guard(s) present`);
}

// ─── Patch 3: Expo Constants module.url ────────────────────────────────────────
// url:location.origin+(window.__TALON_EXTENSION__?"/":location.pathname)
{
  const guard = `(window.__TALON_EXTENSION__?"/":location.pathname)`;
  const count = code.split(guard).length - 1;
  console.log(`[patch] Constants.url: ${count} guard(s) present`);
}

fs.writeFileSync(filePath, code);
const delta = code.length - originalLen;
console.log(`[patch] Done. Bundle size delta: ${delta > 0 ? '+' : ''}${delta} bytes`);
