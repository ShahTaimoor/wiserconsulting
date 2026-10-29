// Run with: npm run test:unit   (from client/). Node strips the TypeScript types itself.

import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, postLoginDestination, loginUrlWithNext } from "./safeRedirect.ts";

const accepted = (value) => assert.equal(safeNextPath(value), value, `should accept ${JSON.stringify(value)}`);
const rejected = (value) => assert.equal(safeNextPath(value), null, `should reject ${JSON.stringify(value)}`);

test("accepts plain same-site paths, unchanged", () => {
  for (const value of [
    "/",
    "/tourist-visa",
    "/tourist-visa/2A",
    "/tourist-visa/2A?tab=1&x=a%20b",
    "/tourist-visa#top",
    "/admin/users",
    "/a/b-c_d.e~f",
    "/path?next=%2Ftourist-visa", // an encoded slash inside a query value is just data
    "/caf%C3%A9", // an encoded non-ASCII letter
    "/@name", // "@" in a path is not a host
    "/tourist-visa/",
  ]) {
    accepted(value);
  }
});

test("rejects values that are not a non-empty string", () => {
  for (const value of [null, undefined, "", 123, true, {}, ["/a"], () => "/a"]) rejected(value);
});

test("rejects anything that does not start with a slash", () => {
  for (const value of ["tourist-visa", "./tourist-visa", "../tourist-visa", "?x=1", "#top", " /tourist-visa", "tourist-visa/"]) {
    rejected(value);
  }
});

test("rejects absolute URLs and other schemes", () => {
  for (const value of [
    "https://evil.example",
    "http://evil.example/tourist-visa",
    "HTTPS://EVIL.EXAMPLE",
    "ftp://evil.example",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:a@example.com",
    "evil.example/tourist-visa",
    "https:evil.example",
    "https:/evil.example",
  ]) {
    rejected(value);
  }
});

test("rejects protocol-relative URLs", () => {
  for (const value of ["//evil.example", "///evil.example", "////evil.example", "//", "//evil.example/tourist-visa", "/tourist-visa//evil.example"]) {
    rejected(value);
  }
});

test("rejects any backslash, which browsers treat as a slash", () => {
  for (const value of ["/\\evil.example", "\\evil.example", "\\\\evil.example", "/\\/evil.example", "/tourist-visa\\..\\x", "/a\\b"]) {
    rejected(value);
  }
});

test("rejects whitespace and control characters, including ones browsers silently strip", () => {
  for (const value of [
    "/\t/evil.example", // browsers remove the tab, leaving //evil.example
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/ /evil.example",
    "/tourist-visa ",
    "/tourist visa",
    "/\u0000",
    "/\u001f",
    "/\u007f",
    "/\u0085",
  ]) {
    rejected(value);
  }
});


test("rejects percent-encoded versions of the same tricks, including double encoding", () => {
  for (const value of [
    "/%2F/evil.example", // decodes to //
    "/%2f%2fevil.example",
    "/%2F%2Fevil.example",
    "/%5Cevil.example", // decodes to a backslash
    "/%5cevil.example",
    "/%255Cevil.example", // decodes twice to a backslash
    "/%252F%252Fevil.example", // decodes twice to //
    "/%25252F%25252Fevil.example", // three layers
    "/%09/evil.example", // tab
    "/%0d%0aSet-Cookie:x=1",
    "/%0A",
    "/%00",
    "/%E2%80%A8", // U+2028 line separator
    "/%E2%80%AE", // right-to-left override
    "/tourist-visa/%2E%2E/%2E%2E/x", // encoded dot segments
    "/%2e%2e/x",
  ]) {
    rejected(value);
  }
});

test("rejects malformed percent-escapes", () => {
  for (const value of ["/%", "/%E0%A4%A", "/%zz", "/%E0%80%80"]) rejected(value);
});

test("rejects dot segments", () => {
  for (const value of ["/..", "/../x", "/./x", "/a/../b", "/a/./b", "/..//evil.example", "/a/.."]) rejected(value);
});

test("rejects the login and registration pages so a signed-in user cannot loop", () => {
  for (const value of [
    "/login",
    "/login/",
    "/login?next=/tourist-visa",
    "/login#x",
    "/LOGIN",
    "/Login/anything",
    "/register",
    "/register?x=1",
    "/signup",
    "/login-01",
    "/auth-success",
    "/auth-success?token=abc",
    "/%6Cogin", // "login" with an encoded letter
    "/%256Cogin", // and double encoded
  ]) {
    rejected(value);
  }
  // Pages that merely start with the same letters are fine.
  for (const value of ["/logins", "/registered", "/tourist-visa/login-help"]) accepted(value);
});

test("rejects over-long values", () => {
  accepted(`/${"a".repeat(500)}`);
  rejected(`/${"a".repeat(600)}`);
});

test("never returns anything but the original string or null", () => {
  const inputs = ["/ok", "//no", "/%2F/no", "https://no", "/caf%C3%A9", "/a?b=c#d"];
  for (const input of inputs) {
    const result = safeNextPath(input);
    assert.ok(result === null || result === input, input);
  }
});

test("postLoginDestination keeps the existing defaults when there is no valid next", () => {
  for (const next of [null, undefined, "", "//evil.example", "https://evil.example", "/\\evil.example", "/login", 42]) {
    assert.equal(postLoginDestination(false, next), "/", `user, next=${JSON.stringify(next)}`);
    assert.equal(postLoginDestination(true, next), "/admin/users", `admin, next=${JSON.stringify(next)}`);
  }
});

test("postLoginDestination honours a valid next for both roles", () => {
  assert.equal(postLoginDestination(false, "/tourist-visa"), "/tourist-visa");
  assert.equal(postLoginDestination(true, "/tourist-visa/2A?x=1"), "/tourist-visa/2A?x=1");
});

test("loginUrlWithNext round-trips through URLSearchParams to a value safeNextPath accepts", () => {
  for (const here of ["/tourist-visa", "/tourist-visa/2A", "/tourist-visa?x=1&y=2", "/tourist-visa/2A#top"]) {
    const url = loginUrlWithNext(here);
    assert.ok(url.startsWith("/login?next="));
    const next = new URLSearchParams(url.split("?").slice(1).join("?")).get("next");
    assert.equal(next, here);
    assert.equal(safeNextPath(next), here);
  }
});

// Inputs built from code points, so this file stays pure ASCII.
const ch = (...codes) => String.fromCharCode(...codes);

test("rejects raw invisible and bidi characters", () => {
  // Not on the URL allow-list, so refused before any decoding.
  for (const code of [0x00a0, 0x0085, 0x200b, 0x2028, 0x2029, 0x202e, 0x2066, 0xfeff]) {
    rejected("/" + ch(code) + "x");
  }
});

test("rejects look-alikes of the slash", () => {
  const fullwidth = ch(0xff0f); // FULLWIDTH SOLIDUS
  const division = ch(0x2215); // DIVISION SLASH
  rejected(fullwidth + fullwidth + "evil.example");
  rejected("/" + fullwidth + fullwidth + "evil.example");
  rejected("/" + division + division + "evil.example");
  rejected("/" + ch(0xff45) + "vil"); // fullwidth letter
});

test("rejects percent-encoded invisible characters", () => {
  for (const code of [0x2028, 0x2029, 0x202e, 0x200b, 0xfeff]) {
    rejected("/" + encodeURIComponent(ch(code)));
  }
  // A no-break space is only a space, so its encoded form is accepted like %20.
  accepted("/" + encodeURIComponent(ch(0x00a0)));
});
