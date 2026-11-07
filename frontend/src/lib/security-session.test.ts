import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionStore, type AsyncCredentials } from './session-store';
import { productionCsp } from './security-csp';
function fixture() {
  const values = new Map<string, string>(); const legacy = new Map<string, string>();
  const adapter: AsyncCredentials = { get: async key => values.get(key) || null, set: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } };
  return { values, legacy, adapter, store: () => createSessionStore(adapter, { getItem: key => legacy.get(key) || null, removeItem: key => { legacy.delete(key); } }) };
}
test('asynchronous migration publishes tokens only after durable storage and removes plaintext legacy keys', async () => {
  const f = fixture(); f.legacy.set('qc.accessToken', 'old-access'); f.legacy.set('qc.refreshToken', 'old-refresh');
  const store = f.store(); assert.equal(store.access(), null); await Promise.all([store.ready(), store.ready()]);
  assert.equal(store.access(), 'old-access'); assert.equal(store.refresh(), 'old-refresh'); assert.equal(f.legacy.size, 0);
  assert.equal(JSON.parse([...f.values.values()][0]).refreshToken, 'old-refresh');
});
test('native adapter failure never falls back or reports a usable migrated session', async () => {
  const f = fixture(); f.legacy.set('qc.accessToken', 'old-access'); f.adapter.set = async () => { throw new Error('Keystore locked'); };
  const store = f.store(); await assert.rejects(store.ready()); assert.equal(store.access(), null); assert.equal(f.legacy.get('qc.accessToken'), 'old-access');
});
test('logout during a pending read cannot resurrect tokens', async () => {
  const f = fixture(); let resolve!: (value: string) => void;
  f.adapter.get = () => new Promise(done => { resolve = done; });
  const store = f.store(); const ready = store.ready(); const clear = store.clear();
  resolve(JSON.stringify({ accessToken: 'stale', refreshToken: 'stale-refresh' }));
  await Promise.all([ready, clear]); assert.equal(store.access(), null); assert.equal(store.refresh(), null); assert.equal(f.values.size, 0);
});
test('user switching replaces both credentials atomically and local unlock exposes no API access token', async () => {
  const f = fixture(); const store = f.store(); await store.ready();
  await store.set('a-access', 'a-refresh', 'a'); await store.set('b-access', 'b-refresh', 'b');
  assert.equal(store.owner(), 'b'); assert.equal(store.access(), 'b-access');
  store.setLocal(true); assert.equal(store.access(), null); assert.equal(store.isLocal(), true);
  await store.clear(); assert.equal(store.owner(), null); assert.equal(f.values.size, 0);
});
test('a queued credential write cannot defeat a later logout', async () => {
  const f = fixture(); const store = f.store(); await store.ready();
  const write = store.set('a', 'r', 'one'); const clear = store.clear(); await Promise.all([write, clear]);
  assert.equal(store.access(), null); assert.equal(f.values.size, 0);
});
test('production CSP blocks inline scripts, objects and unsafe transport schemes while permitting configured API and sockets', () => {
  const csp = productionCsp('https://api.school.example/api', 'https://socket.school.example');
  assert(csp.includes("script-src 'self';")); assert(csp.includes('wss://socket.school.example'));
  assert(csp.includes("object-src 'none'")); assert(!csp.includes('unsafe-eval'));
  assert.throws(() => productionCsp('javascript:alert(1)')); assert.throws(() => productionCsp('http://public.example'));
});
