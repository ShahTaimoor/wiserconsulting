// Run with: npm run test:unit   (from client/)
// What the applicant sees while a picked file is being made smaller, and the line that stays by it afterwards: the real components, rendered to HTML.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx, React } from "./loadTsx.mjs";

const { module } = loadTsx("components/tourist-visa/FilePreparation.tsx");

test("the loader is a polite status region with the sentence, the file name and a Cancel button", () => {
  const html = renderToStaticMarkup(React.createElement(module.PreparingFile, { name: "IMG_2041.JPG", onCancel() {} }));
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Preparing your file\.\.\./);
  assert.match(html, /IMG_2041\.JPG/);
  assert.match(html, /<button[^>]*type="button"[^>]*>Cancel<\/button>/);
  assert.match(html, /animate-spin/, "a spinner");
  assert.match(html, /aria-hidden="true"/, "the spinner is hidden from a screen reader, the sentence is read");
});

test("the file name is shown as text (never as markup)", () => {
  const html = renderToStaticMarkup(React.createElement(module.PreparingFile, { name: "<img src=x onerror=alert(1)>.jpg", onCancel() {} }));
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;img src=x/);
});

test("the Cancel button calls what it is given", () => {
  let called = 0;
  const tree = module.PreparingFile({ name: "a.jpg", onCancel: () => { called += 1; } });
  // the button is the last child of the status region
  const button = React.Children.toArray(tree.props.children).find((child) => child.props && child.props.children === "Cancel");
  button.props.onClick();
  assert.equal(called, 1);
});

test("the line that stays by an uploaded file: \"Reduced from 5.2 MB to 1.4 MB\" and \"Already small, kept as it is\"", () => {
  for (const note of ["Reduced from 5.2 MB to 1.4 MB", "Already small, kept as it is"]) {
    const html = renderToStaticMarkup(React.createElement(module.CompressionNote, { note }));
    assert.match(html, /data-testid="compression-note"/);
    assert.ok(html.includes(`>${note}<`), note);
  }
});
