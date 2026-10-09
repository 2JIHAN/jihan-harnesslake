// Shared library — Aside CLI execution, profile bridge verification, and session persistence.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

// Avoid hardcoding. Application paths, proxy endpoints, and models are resolved from configuration and live processes.

let DatabaseSync = null;
try {
  const sqlite = await import('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync || null;
} catch {}

const home = homedir();
export const userDir = (account) => join(home, '.aside', 'u', resolveAccount(account).replace(/^u/, ''));
export const sessionsDir = (account) => join(userDir(account), 'sessions');
const storeFile = (account) => join(userDir(account), '.named-sessions.json');

// Zero-dependency SQLite executor with fallback to sqlite3 CLI
export function executeSql(dbPath, query) {
  if (DatabaseSync && existsSync(dbPath)) {
    try {
      const db = new DatabaseSync(dbPath);
      try {
        if (query.trim().toUpperCase().startsWith('SELECT')) {
          const stmt = db.prepare(query);
          const rows = stmt.all();
          if (rows.length === 0) return '';
          const firstVal = Object.values(rows[0])[0];
          return firstVal !== undefined ? String(firstVal) : '';
        } else {
          db.exec(query);
          return '';
        }
      } finally {
        db.close();
      }
    } catch {
      // Fall through to sqlite3 CLI
    }
  }
  return execFileSync('sqlite3', [dbPath, query], { encoding: 'utf8' }).trim();
}

// Check if Aside app is currently running
export function isAppRunning() {
  try {
    execFileSync('pgrep', ['-f', 'Aside.app/Contents/MacOS/Aside'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Locate Aside app bundle path (.app)
export function appBundlePath() {
  if (existsSync('/Applications/Aside.app')) return '/Applications/Aside.app';
  try {
    const found = execFileSync('bash', ['-c', "mdfind 'kMDItemFSName == \"Aside.app\"' | head -1"], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {}
  return '/Applications/Aside.app';
}

// Launch Aside in background without stealing active focus if not running
export function ensureAppRunning({ waitSec = 15, background = true } = {}) {
  if (isAppRunning()) return true;
  console.error('Aside app is not running. Launching in background.');
  const appPath = appBundlePath();
  if (background) {
    execFileSync('open', ['-g', '-a', appPath]);
  } else {
    execFileSync('open', ['-a', appPath]);
  }
  for (let waited = 0; waited < waitSec; waited += 1) {
    execFileSync('sleep', ['1']);
    if (isAppRunning()) return true;
  }
  return isAppRunning();
}

// ── Profile Discovery ─────────────────────────────────────────
// Bindings live under two keys that drift apart, and either can point at a profile
// folder that no longer exists. Merge both, then trust only what is on disk.
function readBindings() {
  const accountsPath = join(home, '.aside', 'accounts.json');
  if (!existsSync(accountsPath)) return [];
  const raw = JSON.parse(readFileSync(accountsPath, 'utf8'));
  const merged = new Map();
  for (const key of ['profileBindings', 'profileAccountBindings']) {
    for (const e of Object.values(raw[key] || {})) {
      if (e.accountId === undefined || !e.profilePath) continue;
      const prev = merged.get(e.accountId);
      if (!prev || (!existsSync(prev.profilePath) && existsSync(e.profilePath))) merged.set(e.accountId, e);
    }
  }
  const emails = Object.fromEntries((raw.accounts || []).map((a) => [a.id, a.email || '']));
  return [...merged.values()].map((e) => ({ ...e, email: emails[e.accountId] || '' }));
}

export function getProfiles() {
  ensureAppRunning({ background: true });
  const appRunning = isAppRunning();
  const localStatePath = join(home, 'Library/Application Support/Aside/Local State');
  const localState = existsSync(localStatePath)
    ? JSON.parse(readFileSync(localStatePath, 'utf8')).profile || {}
    : {};
  const restoreList = new Set(localState.last_active_profiles || []);
  const openProfiles = appRunning ? restoreList : new Set();
  const cache = localState.info_cache || {};

  const rows = [];
  for (const e of readBindings()) {
    const folder = basename(e.profilePath);
    const info = cache[folder] || {};
    rows.push({
      account: `u${e.accountId}`,
      accountId: e.accountId,
      folder,
      missing: !existsSync(e.profilePath),
      label: info.gaia_name || info.name || '-',
      email: e.email || info.user_name || '-',
      open: openProfiles.has(folder),
      restore: restoreList.has(folder),
      lastActive: info.active_time ? new Date(info.active_time * 1000).toISOString().slice(11, 16) : '-',
    });
  }
  rows.sort((a, b) => a.account.localeCompare(b.account));
  return rows;
}

// Does this CLI argument name an account? Accepts "u1", "1", or an email address.
export const isAccountArg = (s) => typeof s === 'string' && (/^u?\d+$/i.test(s) || s.includes('@'));

// Accept "u1", "1", or an email address. Pin work to the email when you have one:
// account numbers and profile folder names both shift as profiles are added or removed.
export function resolveAccount(input) {
  const want = String(input ?? '').trim();
  if (/^u?\d+$/.test(want)) return `u${want.replace(/^u/, '')}`;
  const rows = getProfiles();
  const hit = rows.find((r) => r.email && r.email.toLowerCase() === want.toLowerCase());
  if (hit) return hit.account;
  const known = rows.map((r) => `${r.account} (${r.email})`).join(', ') || 'none';
  throw new Error(`Could not resolve account "${want}". Known accounts: ${known}`);
}

// Automatically discover default account (prefers open window, then first available, fallback 'u0')
export function defaultAccount() {
  if (process.env.ASIDE_ACCOUNT) return process.env.ASIDE_ACCOUNT;
  try {
    const rows = getProfiles();
    const open = rows.find((r) => r.open);
    if (open) return open.account;
    if (rows.length > 0) return rows[0].account;
  } catch {}
  return 'u0';
}

// Map account key to Chrome profile directory
export function profileFor(account) {
  const want = Number(resolveAccount(account).replace(/^u/, ''));
  const bind = readBindings().find((e) => e.accountId === want);
  if (!bind) throw new Error(`Could not find profile bound to account ${account}.`);
  if (!existsSync(bind.profilePath))
    throw new Error(
      `Account ${account} is bound to "${basename(bind.profilePath)}", which no longer exists on disk. Run profiles.mjs and pick a live profile.`
    );
  return basename(bind.profilePath);
}

// Check if browser bridge is reachable
export function browserReachable(account, session) {
  try {
    const out = ask(account, 'Reply with only the URL of the active tab in one line. Do not click anything.', session);
    return /https?:\/\/|chrome:\/\/|chrome-extension:\/\//.test(out);
  } catch {
    return false;
  }
}

export const bridgeOk = browserReachable;

// Launch the bound profile with a real tab when the extension bridge is unreachable.
// `open -a ... --args --profile-directory=...` is ignored when Aside is already
// running, and a profile window with no tab still produces an empty bridge. A new
// app instance plus a bootstrap URL reliably creates/activates the requested
// profile and gives the extension a tab to attach to.
export function ensureBridge(account, waitSec = 45) {
  ensureAppRunning({ background: true });
  if (bridgeOk(account)) return { bootstrapOpened: false };

  const profile = profileFor(account);
  console.error(`Browser unreachable. Launching and activating profile "${profile}" with a bootstrap tab.`);
  const appPath = appBundlePath();
  execFileSync('open', ['-n', '-a', appPath, '--args', `--profile-directory=${profile}`, 'https://example.com']);

  for (let waited = 0; waited < waitSec; waited += 3) {
    execFileSync('sleep', ['3']);
    if (bridgeOk(account)) {
      console.error(`  Bridge connection established in ${waited + 3}s.`);
      return { bootstrapOpened: true };
    }
  }
  console.error(`Failed: Profile "${profile}" window did not become ready within ${waitSec}s.`);
  return false;
}

// ── Models ────────────────────────────────────────────────────
export function defaultModel(account) {
  const m = JSON.parse(readFileSync(join(userDir(account), 'settings.json'), 'utf8')).defaultModel || {};
  return { provider: m.provider, modelId: m.modelId };
}

// Read provider configurations registered for the account (~/.aside/u/<n>/models.json)
export function providersOf(account) {
  const f = join(userDir(account), 'models.json');
  if (!existsSync(f)) return {};
  return JSON.parse(readFileSync(f, 'utf8')).providers || {};
}

// Get baseUrl of the provider used by the default model
export function providerBaseUrl(account, key) {
  const p = providersOf(account)[key || defaultModel(account).provider];
  return p?.baseUrl || null;
}

// ── Named Sessions ────────────────────────────────────────────
export function loadSessions(account) {
  const f = storeFile(account);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

export function saveSession(account, name, id) {
  const all = loadSessions(account);
  all[name] = { id, updatedAt: new Date().toISOString() };
  writeFileSync(storeFile(account), JSON.stringify(all, null, 2));
  writeFileSync(join(userDir(account), '.last-session'), id);
}

export function resolveSession(account, name) {
  if (name) {
    const hit = loadSessions(account)[name];
    if (!hit) throw new Error(`No session named "${name}" found. Run sessions.mjs to view available sessions.`);
    return hit.id;
  }
  const f = join(userDir(account), '.last-session');
  if (!existsSync(f)) throw new Error('No active session found. Please run 02-open-session.mjs first.');
  return readFileSync(f, 'utf8').trim();
}

// ── Command Execution ─────────────────────────────────────────
export const TURN_TIMEOUT_MS = Number(process.env.ASIDE_TURN_TIMEOUT_MS || 120_000);

export function ask(account, prompt, session, { timeout = TURN_TIMEOUT_MS } = {}) {
  const resolvedAccount = resolveAccount(account);
  const base = session
    ? ['session', 'resume', '--account', resolvedAccount, session]
    : ['exec', '--account', resolvedAccount];
  const run = () => execFileSync('aside', [...base, prompt], { encoding: 'utf8', timeout });

  const isTimeout = (e) => e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM';

  try {
    return run();
  } catch (e) {
    // When the connection between the daemon and extension intermittently drops, it manifests as a hang.
    // Retrying once resolves it automatically in most cases.
    if (isTimeout(e)) {
      console.error(`No response within ${Math.round(timeout / 1000)}s. Retrying once (transient bridge disconnect)...`);
      try {
        return run();
      } catch (e2) {
        if (isTimeout(e2)) {
          throw new Error(
            'Both attempts timed out. The connection between the Aside daemon and browser extension appears broken.\n' +
              '  Please retry in a moment. If this persists, restart the Aside application.'
          );
        }
        throw e2;
      }
    }

    throw e;
  }
}

// Extract model used in the most recent session
export function lastUsedModel(account) {
  const dir = sessionsDir(account);
  const recent = readdirSync(dir)
    .map((d) => ({ d, t: statSync(join(dir, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const { d } of recent.slice(0, 5)) {
    const f = join(dir, d, 'messages.jsonl');
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const o = JSON.parse(line);
      if (o.role === 'assistant' && o.provider) {
        return { provider: o.provider, modelId: o.model, at: new Date(o.timestamp) };
      }
    }
  }
  return null;
}

export const tailOf = (text, n = 8) => text.trim().split('\n').slice(-n).join('\n');

export function artifactsDir() {
  const d = join(process.cwd(), 'artifacts');
  mkdirSync(d, { recursive: true });
  return d;
}

// ── Vision-First UI Simulation ────────────────────────────────
// Principles: Vision-first rules are permanently imprinted in AGENTS.md / MEMORY.md.
// Prompts remain short, natural, and token-efficient without boilerplate prefixes.

export function visualNavigate(account, url, session) {
  return ask(account, `Navigate to "${url}" and summarize the page title and key contents in one line.`, session);
}

export function visualClick(account, target, session) {
  return ask(account, `Locate "${target}" on screen and click it with the mouse.`, session);
}

export function visualType(account, target, text, session) {
  return ask(account, `Locate "${target}" on screen and type "${text}".`, session);
}

export function visualInspect(account, question, session) {
  return ask(account, `Inspect the current screen and answer: ${question}`, session);
}

export function visualScroll(account, direction = 'down', session) {
  return ask(account, `Scroll the screen ${direction === 'down' ? 'down' : 'up'}.`, session);
}
