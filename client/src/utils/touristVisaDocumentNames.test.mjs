// Run with: npm run test:unit   (from client/)
// The applicant's documents page says "Will be saved as: ..." using the client's copy of the shared naming rule. These tests prove that the page
// (which has the file as the server describes it to its owner: name, type, time) works out EXACTLY the name the backend gives to staff for the
// same application (which has the stored record). Made-up names only.

import test from "node:test";
import assert from "node:assert/strict";
import { documentFileNames, SLOT_FILE_LABELS } from "../shared/tourist-visa/documentNames.js";
import { fullName } from "../shared/tourist-visa/view.js";
import { config, getFileQuestions } from "../shared/tourist-visa/engine.js";
import backendNames from "../../../backend/utils/touristVisaDocumentNames.js";

const { friendlyDocumentNames } = backendNames;

// The same four files, as the page has them (what the applicant's list returns) and as the server has them (the stored record).
const asPage = [
  { id: "a", slot: "passport", name: "dsfew6567reww.pdf", size: 1000, type: "application/pdf", uploadedAt: "2027-01-05T10:00:00.000Z" },
  { id: "b", slot: "funds", name: "statement march.JPG", size: 2000, type: "image/jpeg", uploadedAt: "2027-01-05T10:05:00.000Z" },
  { id: "c", slot: "funds", name: "statement april.png", size: 2000, type: "image/png", uploadedAt: "2027-01-05T10:01:00.000Z" },
  { id: "d", slot: "hotels", name: "booking.pdf", size: 3000, type: "application/pdf", uploadedAt: "2027-01-05T10:02:00.000Z" },
];
const asStored = [
  { id: "a", slot: "passport", originalName: "dsfew6567reww.pdf", bytes: 1000, mime: "application/pdf", format: "pdf", uploadedAt: new Date("2027-01-05T10:00:00.000Z") },
  { id: "b", slot: "funds", originalName: "statement march.JPG", bytes: 2000, mime: "image/jpeg", format: "jpg", uploadedAt: new Date("2027-01-05T10:05:00.000Z") },
  { id: "c", slot: "funds", originalName: "statement april.png", bytes: 2000, mime: "image/png", format: "png", uploadedAt: new Date("2027-01-05T10:01:00.000Z") },
  { id: "d", slot: "hotels", originalName: "booking.pdf", bytes: 3000, mime: "application/pdf", format: "pdf", uploadedAt: new Date("2027-01-05T10:02:00.000Z") },
];

test("the page and the server make the same name for the same files, whatever the applicant's name looks like", () => {
  const people = [
    ["Roohullah", "Shah"],
    ["Mary Anne", "van der Berg"],
    ["José", "Núñez-Pérez"],
    ["Roohullah", ""],
    ["Ali", undefined],
    ["أحمد", "محمد"],
    ["  Spaced   Out ", " Name  "],
    ["A".repeat(100), "B".repeat(100)],
  ];
  for (const [given, family] of people) {
    for (const reference of [null, undefined, "TV-K7M3QD9R"]) {
      const page = documentFileNames({ documents: asPage, name: fullName(given, family), reference: reference ?? undefined });
      const server = friendlyDocumentNames({ answers: { q2_1: given, q2_2: family }, reference, documents: asStored });
      assert.deepEqual(page, server, JSON.stringify([given, family, reference]));
    }
  }
});

test("what the page shows: friendly names, the two funds files numbered in upload order (April before March), the extension from the file's type", () => {
  assert.deepEqual(documentFileNames({ documents: asPage, name: fullName("Roohullah", "Shah") }), {
    a: "Roohullah-Shah-Passport.pdf",
    b: "Roohullah-Shah-Bank-Statement-2.jpg",
    c: "Roohullah-Shah-Bank-Statement-1.png",
    d: "Roohullah-Shah-Hotel-Booking.pdf",
  });
});

test("the page works for a draft: no reference yet and no name typed yet still gives a name for every file", () => {
  const names = documentFileNames({ documents: asPage, name: fullName(undefined, undefined), reference: undefined });
  assert.deepEqual(Object.values(names).sort(), ["Bank-Statement-1.png", "Bank-Statement-2.jpg", "Hotel-Booking.pdf", "Passport.pdf"]);
});

test("the client's copy has a label for every slot of the form it ships with", () => {
  for (const question of getFileQuestions(config)) assert.ok(SLOT_FILE_LABELS[question.slot], `slot "${question.slot}" has no label`);
});
