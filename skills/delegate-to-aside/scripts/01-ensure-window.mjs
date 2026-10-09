#!/usr/bin/env node
// Step 1 — Verify profile window status and ensure connection to daemon.
//
// Running the app is not enough; if profiles mismatch, no tabs will be visible.
// Usage: node 01-ensure-window.mjs [account]

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ask, defaultAccount, ensureBridge, tailOf } from './lib.mjs';

const account = process.argv[2] || defaultAccount();

// Print profile status explicitly to avoid assumptions.
console.log(execFileSync(process.execPath, [join(import.meta.dirname, 'profiles.mjs')], { encoding: 'utf8' }));

const bridge = ensureBridge(account);
if (!bridge) process.exit(1);
console.log(`Bridge connection to ${account} confirmed.\n`);

console.log('Open browser tabs:');
console.log(tailOf(ask(account, 'List only the URLs of currently open tabs separated by newlines. Do not click anything.'), 20));
if (bridge.bootstrapOpened) {
  ask(account, 'Close only the active https://example.com/ bootstrap tab. Do not close any other tab.');
}
