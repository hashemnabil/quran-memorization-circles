#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('@capacitor/cli/package.json'));
const tarPath = cliRequire.resolve('tar');
const tar = cliRequire('tar');
// Capacitor 6's default import assumes the tar 6 export shape. Keep native
// platform compatibility while using the patched tar 7 named-export package.
if (tar.__esModule && !tar.default) cliRequire.cache[tarPath].exports = { ...tar, default: tar };
require('@capacitor/cli/bin/capacitor');
