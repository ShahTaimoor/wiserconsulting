// Run with: npm run test:unit   (from client/)

import test from "node:test";
import assert from "node:assert/strict";
import { decideLeave, isLeavingClick, UNSAVED_CHANGES_DIALOG } from "./navigationGuard.ts";

const HERE = "http://localhost:3000/tourist-visa/2A";
const click = (over = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over });
const anchor = (href, over = {}) => ({ href, target: "", hasDownload: false, ...over });
const leaves = (a, c = click()) => isLeavingClick(c, a, HERE);

test("a link to another page of the site leaves the page", () => {
  assert.equal(leaves(anchor("http://localhost:3000/tourist-visa")), true);
  assert.equal(leaves(anchor("http://localhost:3000/tourist-visa/2B")), true);
  assert.equal(leaves(anchor("http://localhost:3000/#about")), true);
  assert.equal(leaves(anchor("/tourist-visa")), true, "relative links resolve against the current page");
});

test("a link to another site leaves the page", () => {
  assert.equal(leaves(anchor("https://example.com/")), true);
});

test("the same page, or only a #fragment on it, does not leave", () => {
  assert.equal(leaves(anchor("http://localhost:3000/tourist-visa/2A")), false);
  assert.equal(leaves(anchor("http://localhost:3000/tourist-visa/2A#field-q2_1")), false);
  assert.equal(leaves(anchor("#top")), false);
});

test("a different query string on the same path does leave", () => {
  assert.equal(leaves(anchor("http://localhost:3000/tourist-visa/2A?x=1")), true);
});

test("new tab, download, modifier keys, non-primary buttons and prevented clicks do not leave", () => {
  assert.equal(leaves(anchor("http://localhost:3000/", { target: "_blank" })), false);
  assert.equal(leaves(anchor("http://localhost:3000/", { target: "_self" })), true);
  assert.equal(leaves(anchor("http://localhost:3000/", { hasDownload: true })), false);
  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) {
    assert.equal(leaves(anchor("http://localhost:3000/"), click({ [key]: true })), false, key);
  }
  assert.equal(leaves(anchor("http://localhost:3000/"), click({ button: 1 })), false);
  assert.equal(leaves(anchor("http://localhost:3000/"), click({ button: 2 })), false);
  assert.equal(leaves(anchor("http://localhost:3000/"), click({ defaultPrevented: true })), false);
});

test("mailto:, tel: and javascript: links do not leave the page", () => {
  assert.equal(leaves(anchor("mailto:help@example.com")), false);
  assert.equal(leaves(anchor("tel:+4400000000")), false);
  assert.equal(leaves(anchor("javascript:void(0)")), false);
});

test("an unparseable address does not block the user", () => {
  assert.equal(isLeavingClick(click(), anchor("http://[bad"), HERE), false);
  assert.equal(isLeavingClick(click(), anchor("/x"), "not a url"), false);
});

test("decideLeave: a click that leaves asks, once", () => {
  assert.equal(decideLeave({ allowed: false, dialogOpen: false, leaving: true }), "ask");
});

test("decideLeave: while the dialog is open, another leaving click is swallowed, not asked again", () => {
  assert.equal(decideLeave({ allowed: false, dialogOpen: true, leaving: true }), "block");
});

test("decideLeave: clicks that do not leave the page are never held back", () => {
  assert.equal(decideLeave({ allowed: false, dialogOpen: false, leaving: false }), "allow");
  assert.equal(decideLeave({ allowed: false, dialogOpen: true, leaving: false }), "allow");
});

test("decideLeave: once the user has agreed to leave (or has saved), nothing is asked", () => {
  assert.equal(decideLeave({ allowed: true, dialogOpen: false, leaving: true }), "allow");
  assert.equal(decideLeave({ allowed: true, dialogOpen: true, leaving: true }), "allow");
});

test("the dialog wording gives two different, clearly labelled choices", () => {
  assert.equal(UNSAVED_CHANGES_DIALOG.stayLabel, "Stay on this page");
  assert.equal(UNSAVED_CHANGES_DIALOG.leaveLabel, "Leave without saving");
  assert.notEqual(UNSAVED_CHANGES_DIALOG.stayLabel, UNSAVED_CHANGES_DIALOG.leaveLabel);
  assert.ok(UNSAVED_CHANGES_DIALOG.title.length > 0 && UNSAVED_CHANGES_DIALOG.description.length > 0);
});
