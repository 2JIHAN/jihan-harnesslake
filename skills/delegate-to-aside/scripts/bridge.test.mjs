import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserReachable } from './lib.mjs';

const dir = mkdtempSync(join(tmpdir(), 'aside-bridge-test-'));
const oldPath = process.env.PATH;
try {
  // Model authentication is deliberately broken; browser connectivity still works.
  writeFileSync(join(dir, 'aside'), '#!/bin/sh\nif [ "$1" = repl ]; then echo AGENCI_BROWSER_READY; else exit 1; fi\n', { mode: 0o755 });
  process.env.PATH = `${dir}:${oldPath}`;
  assert.equal(browserReachable('u1'), true);
  writeFileSync(join(dir, 'aside'), '#!/bin/sh\necho "a misleading https://example.com URL"\n', { mode: 0o755 });
  assert.equal(browserReachable('u1'), false);
  console.log('Browser reachability does not depend on model authentication.');
} finally {
  process.env.PATH = oldPath;
  rmSync(dir, { recursive: true });
}
