// Test helper (not part of the application): loads a .ts or .tsx file of the client the way Next.js would compile it, with its own imports
// replaced by the fakes a test passes in, so the real component can be rendered to HTML with react-dom/server and its effects run by hand.
// No DOM library is needed: the component's effects are recorded while it renders, and the test calls them with a fake `window`.
//
//   const { module, effects } = loadTsx("components/Footer.tsx", { mocks: { "@/redux/hooks": { useAppSelector: ... } } });
//
// Any specifier that is not in `mocks` is loaded for real: "@/x" and relative paths from src/ (compiled by TypeScript's transpileModule),
// and packages from the client's node_modules.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire("typescript");
const React = nodeRequire("react");

const EXTENSIONS = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];
function resolveFile(base) {
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`cannot find ${base}`);
}

/** A copy of React whose useEffect and useLayoutEffect only record their functions (a server render never runs effects). */
export function recordingReact(effects) {
  const record = (fn) => {
    effects.push(fn);
  };
  return Object.assign({}, React, { useEffect: record, useLayoutEffect: record });
}

export function loadTsx(file, { mocks = {}, recordEffects = true, reactOverrides = {} } = {}) {
  const effects = [];
  const fakes = { ...mocks };
  if (recordEffects && !fakes.react) fakes.react = Object.assign(recordingReact(effects), reactOverrides);
  const cache = new Map();

  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = fs.readFileSync(absolute, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: absolute,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const mod = { exports: {} };
    cache.set(absolute, mod);
    const localRequire = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(fakes, specifier)) return fakes[specifier];
      if (specifier.startsWith("@/")) return load(resolveFile(path.join(SRC, specifier.slice(2))));
      if (specifier.startsWith(".")) return load(resolveFile(path.resolve(path.dirname(absolute), specifier)));
      return nodeRequire(specifier);
    };
    new Function("exports", "require", "module", "__filename", "__dirname", outputText)(mod.exports, localRequire, mod, absolute, path.dirname(absolute));
    return mod.exports;
  };

  return { module: load(resolveFile(path.join(SRC, file))), effects };
}

export { React };
