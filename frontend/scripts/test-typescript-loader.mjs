import ts from '../node_modules/typescript/lib/typescript.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); } catch (original) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) throw original;
    const base = specifier.startsWith('@/') ? pathToFileURL(path.resolve('src', specifier.slice(2))).href : new URL(specifier, context.parentURL).href;
    for (const suffix of ['.ts', '.tsx', '/index.ts']) { try { await readFile(fileURLToPath(base + suffix)); return { url: base + suffix, shortCircuit: true }; } catch {} }
    throw original;
  }
}
export async function load(url, context, nextLoad) {
  if (!/\.tsx?$/.test(url)) return nextLoad(url, context);
  const source = await readFile(fileURLToPath(url), 'utf8');
  return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, { fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, jsx: ts.JsxEmit.ReactJSX } }).outputText };
}
