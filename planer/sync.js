// Sync mit Supabase. Die Oberfläche arbeitet weiter mit den lokalen Daten; jede Aufgabe, jeder Termin usw.
// wird als eigene Zeile hochgeladen und per Realtime an andere Geräte (und von Claude-Agenten) verteilt.
// Konflikte: Wer zuletzt speichert, gewinnt – pro Eintrag, nicht für die ganze Datenbank.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const KINDS = { tasks: 'task', events: 'event', projects: 'project', templates: 'template' };
const META = 'planer.sync';
let sb = null, user = null, channel = null, api = null;
let shadow = {};        // key -> JSON des Stands, der zuletzt mit dem Server übereinstimmte
let lastPull = null;
let pushTimer = null, pushing = false, again = false, retryTimer = null;

export const sync = {
  configured: !!(SUPABASE_URL && SUPABASE_KEY),
  state: 'off',         // off | connecting | ok | pending | offline | error
  email: '', error: '', lastSync: null, feedUrl: '',
};

const loadMeta = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } };
const saveMeta = () => { try { localStorage.setItem(META, JSON.stringify({ userId: user?.id, shadow, lastPull })); } catch {} };
function setState(state, error = '') { sync.state = state; sync.error = error; api?.onStatus(); }

function itemsOf(db) {
  const m = {};
  for (const [arr, kind] of Object.entries(KINDS)) (db[arr] || []).forEach(x => { m[`${kind}:${x.id}`] = x; });
  m['settings:main'] = db.settings;
  return m;
}
// JSON mit sortierten Schlüsseln: gleiche Inhalte ergeben immer denselben Text, egal in welcher Reihenfolge die Felder stehen.
const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);
const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };

function loadLib() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/supabase.js';
    s.onload = () => res(window.supabase);
    s.onerror = () => rej(new Error('Sync-Bibliothek nicht ladbar'));
    document.head.appendChild(s);
  });
}

export async function initSync(hooks) {
  api = hooks;
  if (!sync.configured) return;
  try {
    const lib = await loadLib();
    sb = lib.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'planer.auth' } });
  } catch (e) { setState('offline', e.message); return; }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') stop();
    else if (session?.user && session.user.id !== user?.id) start(session.user);
  });
  const { data } = await sb.auth.getSession();
  if (data.session?.user) start(data.session.user); else setState('off');
  window.addEventListener('online', () => user && pull().then(push));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && user) pull().then(push); });
}

async function start(u) {
  user = u; sync.email = u.email || '';
  const meta = loadMeta();
  const first = meta.userId !== u.id;
  shadow = first ? {} : meta.shadow || {};
  lastPull = first ? null : meta.lastPull || null;
  setState('connecting');
  try {
    await pull(first);   // beim ersten Mal gewinnt der Server bei gleichen Einträgen
    await push();
    subscribe();
    loadFeed();
  } catch (e) { setState(navigator.onLine ? 'error' : 'offline', e.message); }
}

function stop() {
  if (channel) sb.removeChannel(channel);
  channel = null; user = null; sync.email = ''; sync.feedUrl = '';
  shadow = {}; lastPull = null;
  try { localStorage.removeItem(META); } catch {}
  setState('off');
}

function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel(`planer-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'planer_items', filter: `user_id=eq.${user.id}` }, p => {
      if (p.eventType === 'DELETE') apply([{ ...p.old, deleted: true }]);
      else apply([p.new]);
    })
    .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setTimeout(() => user && subscribe(), 5000); });
}

async function pull(serverWins = false) {
  if (!user) return;
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from('planer_items').select('kind,id,data,deleted,updated_at').order('updated_at').range(from, from + 999);
    if (lastPull && !serverWins) q = q.gt('updated_at', lastPull);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  apply(rows, serverWins);
  sync.lastSync = new Date();
  if (sync.state === 'connecting' || sync.state === 'offline' || sync.state === 'error') setState('ok');
}

// Server-Zeilen in die lokalen Daten übernehmen. Lokale, noch nicht hochgeladene Änderungen gewinnen.
function apply(rows, serverWins = false) {
  if (!rows.length) return;
  const db = api.getDb();
  const cur = itemsOf(db);
  let changed = false;
  for (const r of rows) {
    if (!r || !r.kind || !r.id) continue;
    if (r.updated_at && (!lastPull || r.updated_at > lastPull)) lastPull = r.updated_at;
    const k = `${r.kind}:${r.id}`;
    const local = cur[k];
    const localJ = local === undefined ? undefined : stable(local);
    if (!serverWins && localJ !== shadow[k]) continue;
    if (r.deleted) {
      if (local !== undefined && r.kind !== 'settings') { remove(db, r.kind, r.id); changed = true; }
      delete shadow[k];
      continue;
    }
    if (!r.data) continue; // DELETE-Ereignis ohne Daten
    const j = stable(r.data);
    shadow[k] = j;
    if (localJ !== j) { put(db, r.kind, r.data); changed = true; }
  }
  saveMeta();
  if (changed) api.replaceDb(db);
}
function arrOf(kind) { return Object.keys(KINDS).find(a => KINDS[a] === kind); }
function put(db, kind, data) {
  if (kind === 'settings') { db.settings = { ...db.settings, ...data }; return; }
  const arr = db[arrOf(kind)] ||= [];
  const i = arr.findIndex(x => x.id === data.id);
  if (i >= 0) arr[i] = data; else arr.push(data);
}
function remove(db, kind, id) {
  const a = arrOf(kind);
  if (a) db[a] = (db[a] || []).filter(x => x.id !== id);
}

// Nach jedem lokalen Speichern aufrufen: lädt Unterschiede gesammelt hoch.
export function localChanged() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 600);
  if (sync.state === 'ok') setState('pending');
}

async function push() {
  if (!user) return;
  if (pushing) { again = true; return; }
  pushing = true;
  try {
    const cur = itemsOf(api.getDb());
    const rows = [];
    for (const [k, v] of Object.entries(cur)) {
      const j = stable(v);
      if (shadow[k] !== j) { const [kind, id] = splitKey(k); rows.push({ k, j, row: { user_id: user.id, kind, id, data: v, deleted: false } }); }
    }
    for (const k of Object.keys(shadow)) {
      if (!(k in cur)) { const [kind, id] = splitKey(k); rows.push({ k, row: { user_id: user.id, kind, id, data: {}, deleted: true } }); }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from('planer_items').upsert(chunk.map(r => r.row), { onConflict: 'user_id,kind,id' });
      if (error) throw error;
      chunk.forEach(r => { if (r.row.deleted) delete shadow[r.k]; else shadow[r.k] = r.j; });
    }
    saveMeta();
    sync.lastSync = new Date();
    setState('ok');
  } catch (e) {
    setState(navigator.onLine ? 'error' : 'offline', e.message || String(e));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(push, 15000);
  } finally {
    pushing = false;
    if (again) { again = false; push(); }
  }
}

export async function syncNow() { if (!user) return; await pull(); await push(); }

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch' : error.message);
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
  if (error) throw new Error(error.message);
  return !data.session; // true = Bestätigungs-Mail wurde verschickt
}
export async function signOut() { await sb.auth.signOut(); }

async function loadFeed() {
  const { data } = await sb.from('planer_feeds').select('token').maybeSingle();
  sync.feedUrl = data ? feedUrl(data.token) : '';
  api.onStatus();
}
const feedUrl = token => `${SUPABASE_URL}/functions/v1/planer-ics?token=${token}`;
export async function createFeed(renew = false) {
  if (renew) await sb.from('planer_feeds').delete().eq('user_id', user.id);
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const { error } = await sb.from('planer_feeds').insert({ token });
  if (error) throw new Error(error.message);
  sync.feedUrl = feedUrl(token);
  api.onStatus();
}
