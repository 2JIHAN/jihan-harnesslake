#!/usr/bin/env node
// Step 2 — Create a named chat session, visible by default or hidden with ASIDE_SESSION_VISIBLE=0.
//
// ephemeral=1 sessions do not appear in app Chats and disappear after the process exits.
// Updating state.db to 0 makes it visible in the GUI. Hidden sessions remain reusable by ID.
//
// Usage: node 02-open-session.mjs <name> [account] [URL]
// The account may be "u1", "1", or an email address, in any of the trailing positions.

import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ask, defaultAccount, ensureBridge, executeSql, isAccountArg, saveSession, sessionsDir, userDir, tailOf } from './lib.mjs';

let account = defaultAccount();
let name = '';
let url = '';
const visible = process.env.ASIDE_SESSION_VISIBLE !== '0';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node 02-open-session.mjs <name> [account] [URL]');
  console.error('Or:    node 02-open-session.mjs [account] <name> [URL]');
  process.exit(1);
}

if (isAccountArg(args[0])) {
  account = args[0].toLowerCase();
  name = args[1] || `task_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
  url = args[2] || '';
} else {
  name = args[0];
  if (args[1] && isAccountArg(args[1])) {
    account = args[1].toLowerCase();
    url = args[2] || '';
  } else {
    url = args[1] || '';
    if (args[2] && isAccountArg(args[2])) account = args[2].toLowerCase();
  }
}

const bridge = ensureBridge(account);
if (!bridge) process.exit(1);

const db = join(userDir(account), 'state.db');
const dir = sessionsDir(account);
mkdirSync(dir, { recursive: true });
const before = new Set(readdirSync(dir));
const sql = (q) => executeSql(db, q);

// Opening via openTab links the URL into the chat session for side panel visibility.
const prompt = url
  ? bridge.bootstrapOpened
    ? `Navigate the active bootstrap tab to ${url} without opening another tab, then reply with the page title in one line. Further instructions will follow.`
    : `Use openTab to open ${url} and reply with the page title in one line. Further instructions will follow.`
  : 'Reply with "ready" in one line. Do not click anything. Further instructions will follow.';

const out = ask(account, prompt);

const created = readdirSync(dir).filter((d) => !before.has(d));
if (created.length === 0) {
  console.error('Failed to locate newly created session directory.');
  process.exit(1);
}

// Folder format is <date>_<ID>, but session resume requires ID only.
const id = created[0].replace(/^\d{4}-\d{2}-\d{2}_/, '');

if (visible) {
  sql(`UPDATE sessions SET ephemeral=0, title='${name.replace(/'/g, "''")}' WHERE id='${id}';`);
  if (sql(`SELECT ephemeral FROM sessions WHERE id='${id}';`) !== '0') {
    console.error('Failed to flip ephemeral flag — session will not appear in Chats.');
    process.exit(1);
  }
}

saveSession(account, name, id);
console.log(tailOf(out, 5));
console.log(`\nSession "${name}" ready (id=${id}, ephemeral=${visible ? 0 : 1})`);
if (visible) console.log('You can monitor progress live in the Aside app Chats list.');
console.log(`Next step: node 03-say.mjs "Instruction" ${account} ${name}`);
