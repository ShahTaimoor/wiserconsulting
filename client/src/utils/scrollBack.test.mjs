// Run with: npm run test:unit   (from client/)
// The "back to the section list" button of the admin application page: the show/hide rule, the scroll and focus on a click, reduced motion,
// and the button's markup (a real, labelled button, in a corner, under dialogs). Plain functions plus the real component through loadTsx.
// Nothing here uses real data.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx, React } from "./loadTsx.mjs";
import { SECTION_SCROLL_MARGIN_PX, firstControlOf, isPastPanel, prefersReducedMotion, scrollBehaviorFor, scrollToPanel } from "./scrollBack.ts";

// ---------------------------------------------------------------------------
// When the button shows
// ---------------------------------------------------------------------------

test("the button shows only once the panel has been scrolled past (entirely above the top of the window)", () => {
  assert.equal(isPastPanel({ isIntersecting: false, bottom: -1 }), true, "one pixel above the window");
  assert.equal(isPastPanel({ isIntersecting: false, bottom: -2000 }), true, "far above");
  assert.equal(isPastPanel({ isIntersecting: false, bottom: 0 }), true, "its bottom edge exactly at the top of the window");
});

test("the button stays hidden while the panel is on screen, and while it has not been reached yet", () => {
  assert.equal(isPastPanel({ isIntersecting: true, bottom: 300 }), false, "fully on screen");
  assert.equal(isPastPanel({ isIntersecting: true, bottom: 5 }), false, "a sliver still showing at the top");
  assert.equal(isPastPanel({ isIntersecting: false, bottom: 1500 }), false, "still below the window: the page is at the top and has not got to it");
});

// ---------------------------------------------------------------------------
// What a click does
// ---------------------------------------------------------------------------

/** A small fake of the panel element that records what is asked of it, in order. */
function fakePanel({ controls = true } = {}) {
  const log = [];
  const link = { focus: (options) => log.push(["focus link", options]) };
  const panel = {
    log,
    querySelector: (selector) => {
      log.push(["querySelector", selector]);
      return controls ? link : null;
    },
    scrollIntoView: (options) => log.push(["scrollIntoView", options]),
    focus: (options) => log.push(["focus panel", options]),
  };
  return panel;
}

test("a click scrolls the panel to the top smoothly and focuses its first link without a second scroll", () => {
  const panel = fakePanel();
  scrollToPanel(panel, { reducedMotion: false });
  const kinds = panel.log.map(([kind]) => kind);
  assert.deepEqual(kinds, ["scrollIntoView", "querySelector", "focus link"], "scroll first, then focus");
  assert.deepEqual(panel.log[0][1], { behavior: "smooth", block: "start" });
  assert.deepEqual(panel.log[2][1], { preventScroll: true }, "the focus must not scroll again");
  assert.match(panel.log[1][1], /a\[href\]/, "the first control is a link");
});

test("reduced motion: the page jumps instead of scrolling smoothly", () => {
  const panel = fakePanel();
  scrollToPanel(panel, { reducedMotion: true });
  assert.equal(panel.log[0][1].behavior, "instant", "not \"auto\": the site sets scroll-smooth on <html>, which \"auto\" would follow");
  assert.equal(scrollBehaviorFor(true), "instant");
  assert.equal(scrollBehaviorFor(false), "smooth");
});

test("a panel with no link or button takes the focus itself", () => {
  const panel = fakePanel({ controls: false });
  scrollToPanel(panel, { reducedMotion: false });
  assert.deepEqual(panel.log.map(([kind]) => kind), ["scrollIntoView", "querySelector", "focus panel"]);
  assert.deepEqual(panel.log[2][1], { preventScroll: true });
});

test("firstControlOf asks for a link with an address or an enabled button, in document order", () => {
  let asked = "";
  firstControlOf({ querySelector: (selector) => { asked = selector; return null; } });
  assert.equal(asked, "a[href], button:not([disabled])");
});

test("the scroll margin is the 5rem that the page's own anchors keep (the panel carries scroll-mt-20)", () => {
  assert.equal(SECTION_SCROLL_MARGIN_PX, 80);
});

test("prefersReducedMotion reads the media query, and is false where the browser cannot say", () => {
  const saved = globalThis.window;
  try {
    globalThis.window = { matchMedia: (query) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) };
    assert.equal(prefersReducedMotion(), true);
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(prefersReducedMotion(), false);
    globalThis.window = {};
    assert.equal(prefersReducedMotion(), false, "no matchMedia");
    globalThis.window = { matchMedia: () => { throw new Error("no"); } };
    assert.equal(prefersReducedMotion(), false, "a throwing matchMedia");
  } finally {
    globalThis.window = saved;
  }
});

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

function load({ past, scrolled = [] }) {
  const mocks = {
    "@/hooks/useScrolledPast": { useScrolledPast: () => past },
    "@/utils/scrollBack": {
      prefersReducedMotion: () => false,
      scrollToPanel: (panel, options) => scrolled.push([panel, options]),
    },
  };
  return loadTsx("components/tourist-visa/BackToSectionsButton.tsx", { mocks }).module.BackToSectionsButton;
}
const PANEL = fakePanel();
const render = (Component, panel) => renderToStaticMarkup(React.createElement(Component, { panel }));

test("component: nothing is rendered while the panel is not past, or when there is no panel (the editor is open)", () => {
  assert.equal(render(load({ past: false }), PANEL), "");
  assert.equal(render(load({ past: true }), null), "", "no panel on the page");
});

test("component: once past, a real, labelled button in the bottom right corner, under dialogs, with a focus ring", () => {
  const html = render(load({ past: true }), PANEL);
  assert.match(html, /^<button\b/, "a real button element");
  assert.match(html, /type="button"/, "it never submits a form");
  assert.match(html, /aria-label="Back to section selection"/);
  assert.match(html, /title="Back to section selection"/);
  assert.match(html, /\bfixed\b/);
  assert.match(html, /\bright-4\b/, "the right edge");
  assert.match(html, /bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/, "the bottom edge, clear of a phone's home bar");
  assert.match(html, /\bz-40\b/, "under dialogs (z-50 and up) and toasts (z-100)");
  assert.match(html, /\bh-11\b/);
  assert.match(html, /\bw-11\b/, "44 px, a comfortable tap target");
  assert.match(html, /focus-visible:ring-2/, "a visible focus ring (from the shared button style)");
  assert.match(html, /<svg[^>]*aria-hidden="true"/, "the arrow icon is decoration");
  assert.doesNotMatch(html, /tabindex="-1"/, "reachable with Tab");
});

test("component: a click scrolls to the panel with the visitor's motion preference", () => {
  const scrolled = [];
  const Component = load({ past: true, scrolled });
  const element = Component({ panel: PANEL });
  assert.equal(typeof element.props.onClick, "function");
  element.props.onClick();
  assert.equal(scrolled.length, 1);
  assert.equal(scrolled[0][0], PANEL);
  assert.deepEqual(scrolled[0][1], { reducedMotion: false });
});

// ---------------------------------------------------------------------------
// The hook (with a fake IntersectionObserver) and the page
// ---------------------------------------------------------------------------

function runHook(panel) {
  const sets = [];
  const observers = [];
  class FakeObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(element) { this.observed.push(element); }
    disconnect() { this.disconnected = true; }
  }
  const saved = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = FakeObserver;
  try {
    const { module, effects } = loadTsx("hooks/useScrolledPast.ts", { reactOverrides: { useState: (initial) => [initial, (value) => sets.push(value)] } });
    module.useScrolledPast(panel);
    const cleanups = effects.map((effect) => effect());
    return { sets, observers, cleanups };
  } finally {
    globalThis.IntersectionObserver = saved;
  }
}

test("hook: it watches the panel, turns on once the panel is above the window, off again when it is back, and stops watching on cleanup", () => {
  const { sets, observers, cleanups } = runHook({ id: "panel" });
  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].observed, [{ id: "panel" }]);
  assert.deepEqual(observers[0].options, { threshold: 0 });
  const entry = (isIntersecting, bottom) => ({ isIntersecting, boundingClientRect: { bottom } });
  observers[0].callback([entry(false, -40)]);
  observers[0].callback([entry(true, 120)]);
  observers[0].callback([entry(false, 900)]);
  assert.deepEqual(sets, [true, false, false], "past, then back on screen, then below the window");
  cleanups[0]();
  assert.equal(observers[0].disconnected, true);
  assert.equal(sets[sets.length - 1], false, "the button goes with the panel");
});

test("hook: with no panel, or no IntersectionObserver, nothing is watched and the answer is false", () => {
  const none = runHook(null);
  assert.equal(none.observers.length, 0);
  assert.deepEqual(none.sets, [false]);
  const saved = globalThis.IntersectionObserver;
  try {
    delete globalThis.IntersectionObserver;
    const sets = [];
    const { module, effects } = loadTsx("hooks/useScrolledPast.ts", { reactOverrides: { useState: (initial) => [initial, (value) => sets.push(value)] } });
    module.useScrolledPast({});
    effects.forEach((effect) => effect());
    assert.deepEqual(sets, [false]);
  } finally {
    globalThis.IntersectionObserver = saved;
  }
});

test("page: the Jump to panel is the target (kept as state, with room above it and a focus fallback) and the button is on the page", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../app/admin/tourist-visa/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<nav ref=\{setSectionsPanel\} tabIndex=\{-1\} aria-label="Jump to a section" className="scroll-mt-20 /);
  assert.match(source, /const \[sectionsPanel, setSectionsPanel\] = useState<HTMLElement \| null>\(null\);/);
  assert.equal((source.match(/<BackToSectionsButton panel=\{sectionsPanel\} \/>/g) || []).length, 1, "once");
  assert.equal((source.match(/aria-label="Jump to a section"/g) || []).length, 1, "there is one section list");
  assert.match(source, /pb-20 pt-4 sm:px-4 sm:pb-24 sm:pt-6/, "room at the bottom so the last rows are not under the button");
});
