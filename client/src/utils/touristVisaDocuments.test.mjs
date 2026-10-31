// Run with: npm run test:unit   (from client/)
// The limits used here are the backend's own (its constants file), so a change there is noticed here.

import test from "node:test";
import assert from "node:assert/strict";
import backend from "../../../backend/config/touristVisaDocuments.js";
import {
  DOCUMENT_ERROR_CODES,
  acceptAttribute,
  allowedTypesText,
  documentErrorMessage,
  formatBytes,
  formatUploadedAt,
  preCheckFile,
  typeLabel,
} from "./touristVisaDocuments.ts";

const limits = backend.publicLimits();
const MB = 1024 * 1024;
const file = (name, size, type) => ({ name, size, type });
const doc = (slot, size = 1000) => ({ slot, size });

test("the limits the tests use are the agreed ones: 4 MB a file, 3 passport and 10 funds files, 40 MB in all", () => {
  assert.equal(limits.maxFileBytes, 4 * MB);
  assert.equal(limits.maxTotalBytes, 40 * MB);
  assert.deepEqual(limits.slots, { passport: { max: 3 }, funds: { max: 10 } });
  assert.deepEqual(limits.allowedTypes, ["application/pdf", "image/jpeg", "image/png"]);
});

test("formatBytes: bytes, kilobytes and megabytes, without long decimals", () => {
  assert.equal(formatBytes(0), "0 bytes");
  assert.equal(formatBytes(1), "1 byte");
  assert.equal(formatBytes(1023), "1023 bytes");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(204800), "200 KB");
  assert.equal(formatBytes(MB), "1 MB");
  assert.equal(formatBytes(4 * MB), "4 MB");
  assert.equal(formatBytes(5 * MB), "5 MB");
  assert.equal(formatBytes(40 * MB), "40 MB");
  assert.equal(formatBytes(1.25 * MB), "1.3 MB");
  for (const bad of [NaN, -1, Infinity]) assert.equal(formatBytes(bad), "", String(bad));
});

test("typeLabel and allowedTypesText name the accepted types", () => {
  assert.equal(typeLabel("application/pdf"), "PDF");
  assert.equal(typeLabel("image/jpeg"), "JPG");
  assert.equal(typeLabel("image/png"), "PNG");
  assert.equal(typeLabel("text/plain"), "File");
  assert.equal(allowedTypesText(limits), "PDF, JPG or PNG");
  assert.equal(allowedTypesText(null), "PDF, JPG or PNG");
  assert.equal(allowedTypesText({ allowedTypes: ["application/pdf"] }), "PDF");
});

test("acceptAttribute lists the types and their extensions", () => {
  const accept = acceptAttribute(limits).split(",");
  for (const item of ["application/pdf", "image/jpeg", "image/png", ".pdf", ".jpg", ".jpeg", ".png"]) assert.ok(accept.includes(item), item);
  assert.equal(accept.includes(".gif"), false);
  assert.deepEqual(acceptAttribute({ allowedTypes: ["application/pdf"] }).split(","), ["application/pdf", ".pdf"]);
});

// ---------------------------------------------------------------------------
// The check made before sending
// ---------------------------------------------------------------------------

test("preCheckFile: a PDF, JPG and PNG that fit are fine", () => {
  assert.equal(preCheckFile(file("passport.pdf", 1000, "application/pdf"), "passport", limits, []), null);
  assert.equal(preCheckFile(file("photo.jpg", 1000, "image/jpeg"), "passport", limits, []), null);
  assert.equal(preCheckFile(file("scan.PNG", 1000, "image/png"), "funds", limits, []), null);
  assert.equal(preCheckFile(file("exact.pdf", limits.maxFileBytes, "application/pdf"), "funds", limits, []), null, "a file of exactly the limit is allowed");
});

test("preCheckFile: when the browser reports no type, the extension decides", () => {
  assert.equal(preCheckFile(file("a.pdf", 10, ""), "passport", limits, []), null);
  assert.equal(preCheckFile(file("a.jpeg", 10, "application/octet-stream"), "passport", limits, []), null);
  assert.equal(preCheckFile(file("a.JPG", 10, ""), "passport", limits, []), null);
  assert.equal(preCheckFile(file("a.txt", 10, ""), "passport", limits, []), "WRONG_TYPE");
  assert.equal(preCheckFile(file("noextension", 10, ""), "passport", limits, []), "WRONG_TYPE");
});

test("preCheckFile: a type the server does not take is refused, whatever the name says", () => {
  for (const [name, type] of [["a.pdf", "text/plain"], ["a.gif", "image/gif"], ["a.svg", "image/svg+xml"], ["a.zip", "application/zip"], ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["a.html", "text/html"]]) {
    assert.equal(preCheckFile(file(name, 10, type), "passport", limits, []), "WRONG_TYPE", `${name} (${type})`);
  }
});

test("preCheckFile: empty and oversize files", () => {
  assert.equal(preCheckFile(file("a.pdf", 0, "application/pdf"), "passport", limits, []), "FILE_EMPTY");
  assert.equal(preCheckFile(file("a.pdf", limits.maxFileBytes + 1, "application/pdf"), "passport", limits, []), "FILE_TOO_LARGE");
  // The same order as the server: empty, then too large, then the wrong type.
  assert.equal(preCheckFile(file("a.txt", 0, "text/plain"), "passport", limits, []), "FILE_EMPTY");
  assert.equal(preCheckFile(file("a.txt", limits.maxFileBytes + 1, "text/plain"), "passport", limits, []), "FILE_TOO_LARGE");
});

test("preCheckFile: the file cap of a slot, and the total", () => {
  const pdf = file("a.pdf", 1000, "application/pdf");
  const three = [doc("passport"), doc("passport"), doc("passport")];
  assert.equal(preCheckFile(pdf, "passport", limits, three.slice(0, 2)), null);
  assert.equal(preCheckFile(pdf, "passport", limits, three), "TOO_MANY_FILES");
  assert.equal(preCheckFile(pdf, "funds", limits, three), null, "a full passport slot does not block funds");
  const ten = Array.from({ length: 10 }, () => doc("funds"));
  assert.equal(preCheckFile(pdf, "funds", limits, ten), "TOO_MANY_FILES");
  assert.equal(preCheckFile(pdf, "funds", limits, ten.slice(0, 9)), null);

  const nearlyFull = [doc("funds", limits.maxTotalBytes - 1000)];
  assert.equal(preCheckFile(pdf, "passport", limits, nearlyFull), null, "exactly the total is allowed");
  assert.equal(preCheckFile(file("b.pdf", 1001, "application/pdf"), "passport", limits, nearlyFull), "TOTAL_TOO_LARGE");
  assert.equal(preCheckFile(pdf, "visa", limits, []), "INVALID_SLOT");
});

// ---------------------------------------------------------------------------
// What the applicant is told
// ---------------------------------------------------------------------------

test("every error code the server can send has a message here, and none is missing from the list", () => {
  const serverCodes = Object.keys(backend.DOCUMENT_ERRORS).sort();
  assert.deepEqual([...DOCUMENT_ERROR_CODES].sort(), serverCodes);
  const generic = documentErrorMessage("SOMETHING_ELSE", { status: 400 });
  for (const code of serverCodes) {
    const message = documentErrorMessage(code, { limits, slot: "passport" });
    assert.ok(message.length > 10, code);
    assert.notEqual(message, generic, `${code} has its own message`);
    assert.equal(/https?:|enc:v1|tourist-visa\//.test(message), false, `${code}: no link or storage detail`);
  }
});

test("messages that the server also words say the same thing, with the numbers filled in", () => {
  assert.equal(documentErrorMessage("FILE_REQUIRED"), backend.DOCUMENT_ERRORS.FILE_REQUIRED[1]);
  assert.equal(documentErrorMessage("WRONG_TYPE", { limits }), backend.DOCUMENT_ERRORS.WRONG_TYPE[1]);
  assert.match(documentErrorMessage("FILE_TOO_LARGE", { limits }), /too large.*up to 4 MB/);
  assert.match(documentErrorMessage("FILE_TOO_LARGE"), /too large/);
  assert.match(documentErrorMessage("TOO_MANY_FILES", { limits, slot: "passport" }), /most files allowed here \(3\)/);
  assert.match(documentErrorMessage("TOO_MANY_FILES", { limits, slot: "funds" }), /most files allowed here \(10\)/);
  assert.match(documentErrorMessage("TOO_MANY_FILES"), /most files allowed here/);
  assert.match(documentErrorMessage("TOTAL_TOO_LARGE", { limits }), /together.*up to 40 MB/);
  assert.match(documentErrorMessage("DOCUMENTS_LOCKED"), /submitted/);
  assert.match(documentErrorMessage("FILE_EMPTY"), /empty/);
  assert.match(documentErrorMessage("STORAGE_UNAVAILABLE"), /our side/);
  assert.match(documentErrorMessage("TOO_MANY_UPLOADS"), /wait/);
});

test("the browser check and the server answer read the same: both go through one message function", () => {
  for (const [size, type, name, code] of [[0, "application/pdf", "a.pdf", "FILE_EMPTY"], [limits.maxFileBytes + 1, "application/pdf", "a.pdf", "FILE_TOO_LARGE"], [10, "text/plain", "a.pdf", "WRONG_TYPE"]]) {
    const refused = preCheckFile(file(name, size, type), "passport", limits, []);
    assert.equal(refused, code);
    assert.equal(documentErrorMessage(refused, { limits, slot: "passport" }), documentErrorMessage(code, { limits, slot: "passport" }));
  }
});

test("without a known code the message follows the status: offline, too many requests, a server fault, anything else", () => {
  assert.match(documentErrorMessage(undefined, { status: 0 }), /couldn't reach the server/);
  assert.match(documentErrorMessage(undefined, { status: 429 }), /Too many requests/);
  assert.match(documentErrorMessage(undefined, { status: 500 }), /our side/);
  assert.match(documentErrorMessage(undefined, { status: 502 }), /our side/);
  assert.equal(documentErrorMessage(undefined, { status: 400 }), "Something went wrong. Please try again.");
  assert.equal(documentErrorMessage("MADE_UP"), "Something went wrong. Please try again.");
});

test("formatUploadedAt gives a readable date and time, and nothing for a bad one", () => {
  const text = formatUploadedAt("2026-11-01T12:00:00.000Z", "en-US");
  assert.match(text, /Nov/);
  assert.match(text, /2026/);
  assert.equal(formatUploadedAt("not a date"), "");
  assert.equal(formatUploadedAt(""), "");
});
