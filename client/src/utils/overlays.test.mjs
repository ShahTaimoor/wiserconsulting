// Run with: npm run test:unit   (from client/). Node strips the TypeScript types itself.
//
// One floating layer at a time: the chat panel, the avatar menu and the phone menu sheet tell each other when they open. The pure rule, the
// event on a target, and a small model of the three layers (the way the Navbar and the chat widget use it). Made-up data only.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { OVERLAY_IDS, OVERLAY_EVENT, isOverlayId, shouldCloseFor, announceOverlayOpen, subscribeOverlays } from "./overlays.ts";
import { panelIsModal, NAVBAR_BOTTOM_PX, panelTopPx } from "./chatWidget.ts";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("RULE: a layer closes when ANOTHER known layer opens, never for itself, never for odd input", () => {
  assert.deepEqual([...OVERLAY_IDS], ["chat", "avatar-menu", "nav-sheet"]);
  for (const self of OVERLAY_IDS) {
    for (const other of OVERLAY_IDS) assert.equal(shouldCloseFor(self, other), self !== other, `${self} / ${other}`);
    for (const odd of [undefined, null, "", "dialog", "CHAT", 0, 1, {}, [], ["chat"], true]) assert.equal(shouldCloseFor(self, odd), false, `${self} / ${String(odd)}`);
  }
  assert.equal(isOverlayId("chat"), true);
  assert.equal(isOverlayId("toast"), false);
});

test("EVENT: announcing reaches the other layers' listeners but not the announcer's own, and stops after unsubscribing", () => {
  const target = new EventTarget();
  const calls = [];
  const stop = ["chat", "avatar-menu", "nav-sheet"].map((id) => subscribeOverlays(id, () => calls.push(id), target));
  announceOverlayOpen("chat", target);
  assert.deepEqual(calls, ["avatar-menu", "nav-sheet"], "everything but the chat");
  calls.length = 0;
  announceOverlayOpen("avatar-menu", target);
  assert.deepEqual(calls, ["chat", "nav-sheet"]);
  calls.length = 0;
  stop[0]();
  announceOverlayOpen("nav-sheet", target);
  assert.deepEqual(calls, ["avatar-menu"], "the chat has unsubscribed");
  calls.length = 0;
  target.dispatchEvent(new Event(OVERLAY_EVENT)); // no detail at all
  target.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: { id: "something-else" } }));
  target.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: null }));
  assert.deepEqual(calls, [], "events without a known layer are ignored");
  assert.doesNotThrow(() => announceOverlayOpen("chat", null));
  assert.equal(typeof subscribeOverlays("chat", () => {}, null), "function");
});

/** A model of the three layers as the Navbar and the chat widget wire them: opening announces; closing for another layer never asks for the focus back. */
function layers() {
  const target = new EventTarget();
  const state = { open: new Set(), focusReturned: [] };
  const make = (id) => ({
    open() {
      announceOverlayOpen(id, target);
      state.open.add(id);
    },
    closeByPerson() {
      if (state.open.delete(id)) state.focusReturned.push(id);
    },
  });
  const all = Object.fromEntries(["chat", "avatar-menu", "nav-sheet"].map((id) => [id, make(id)]));
  for (const id of Object.keys(all)) subscribeOverlays(id, () => state.open.delete(id), target); // closed by another layer: no focus return
  return { ...all, state };
}

test("MODEL: only one layer is open at a time, in every order", () => {
  const ids = ["chat", "avatar-menu", "nav-sheet"];
  for (const first of ids) {
    for (const second of ids) {
      if (first === second) continue;
      const l = layers();
      l[first].open();
      l[second].open();
      assert.deepEqual([...l.state.open], [second], `${first} then ${second}`);
      assert.deepEqual(l.state.focusReturned, [], "the layer closed by the other one did not take the focus back");
    }
  }
  const l = layers();
  l.chat.open();
  l.chat.closeByPerson();
  assert.deepEqual(l.state.focusReturned, ["chat"], "closed by the person (Escape or X): the focus goes back to what opened it");
  assert.deepEqual([...l.state.open], []);
});

test("MODAL PANEL: always on a phone; on a larger screen only in a window short enough for the card to reach over the navbar (under 808 px)", () => {
  assert.equal(NAVBAR_BOTTOM_PX, 80, "12 px gap + 68 px bar");
  assert.equal(panelIsModal({ phone: true, viewportHeight: 2000 }), true);
  assert.equal(panelIsModal({ phone: true, viewportHeight: 0 }), true);
  assert.equal(panelIsModal({ phone: false, viewportHeight: 600 }), true, "1440 x 600: the card covers the right end of the bar");
  assert.equal(panelIsModal({ phone: false, viewportHeight: 700 }), true);
  assert.equal(panelIsModal({ phone: false, viewportHeight: 807 }), true);
  assert.equal(panelIsModal({ phone: false, viewportHeight: 808 }), false, "808 px: the card's top is exactly at the bar's bottom edge");
  assert.equal(panelIsModal({ phone: false, viewportHeight: 900 }), false);
  assert.equal(panelIsModal({ phone: false, viewportHeight: 1440 }), false);
  for (const odd of [0, undefined, null, NaN, "600", {}, -5]) assert.equal(panelIsModal({ phone: false, viewportHeight: odd }), false, `size not known yet: ${String(odd)}`);
  // The boundary follows from the card's own geometry.
  for (let height = 200; height <= 1600; height += 3) assert.equal(panelIsModal({ phone: false, viewportHeight: height }), panelTopPx(height) < NAVBAR_BOTTOM_PX, String(height));
});

test("WIRING: the Navbar and the chat widget announce when they open and close when another layer opens", () => {
  const navbar = read("components/Navbar.tsx");
  const chat = read("components/chat/ChatWidget.tsx");
  assert.match(chat, /announceOverlayOpen\("chat"\)/);
  assert.match(chat, /subscribeOverlays\("chat"/);
  assert.match(navbar, /announceOverlayOpen\("nav-sheet"\)/);
  assert.match(navbar, /announceOverlayOpen\("avatar-menu"\)/);
  assert.match(navbar, /subscribeOverlays\("avatar-menu"/);
  assert.match(navbar, /subscribeOverlays\("nav-sheet"/);
  // Closing for another layer must not return the focus: both Navbar layers and the chat have a "skip" path.
  assert.match(navbar, /skipMenuFocus/);
  assert.match(navbar, /skipSheetFocus/);
  assert.match(chat, /restoreFocus\.current = false;\s*setOpen\(false\)/);
  assert.match(chat, /aria-modal=\{modal \? true : undefined\}/);
  assert.match(chat, /event\.key === "Tab" && modal/);
});
