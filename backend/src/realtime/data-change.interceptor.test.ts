import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastValueFrom, of, throwError } from 'rxjs';
import { DataChangeInterceptor } from './data-change.interceptor';
import { RealtimeGateway } from './realtime.gateway';
import { snapshotPatch } from './snapshot-delta';
import { SnapshotDeltaInterceptor } from './snapshot-delta.interceptor';

function fixture(method: string, path: string) {
  let changes = 0;
  const interceptor = new DataChangeInterceptor({ notifyDataChanged() { changes++; } } as any);
  const context = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: path }) }) } as any;
  return { interceptor, context, changes: () => changes };
}
test('successful domain writes notify after the handler returns; reads and authentication do not', async () => {
  for (const [method, path, expected] of [['POST', '/api/students', 1], ['PATCH', '/api/settings', 1], ['DELETE', '/api/students/id', 1], ['GET', '/api/students', 0], ['POST', '/api/auth/login', 0]] as const) {
    const f = fixture(method, path);
    assert.equal(f.changes(), 0);
    await lastValueFrom(f.interceptor.intercept(f.context, { handle: () => of({ id: 'saved' }) }));
    assert.equal(f.changes(), expected);
  }
});
test('failed writes and rejected full-sync operations do not announce new data', async () => {
  const f = fixture('POST', '/api/students');
  await assert.rejects(lastValueFrom(f.interceptor.intercept(f.context, { handle: () => throwError(() => new Error('rollback')) })), /rollback/);
  assert.equal(f.changes(), 0);
  const sync = fixture('POST', '/api/sync-all');
  await lastValueFrom(sync.interceptor.intercept(sync.context, { handle: () => of({ outcomes: [{ status: 'rejected' }] }) }));
  assert.equal(sync.changes(), 0);
  await lastValueFrom(sync.interceptor.intercept(sync.context, { handle: () => of({ outcomes: [{ status: 'applied' }] }) }));
  assert.equal(sync.changes(), 1);
});
test('change announcements use the durable cursor and do not repeat without new writes', async () => {
  const calls: any[] = [];
  const gateway = Object.create(RealtimeGateway.prototype) as RealtimeGateway;
  let seq = 10n;
  (gateway as any).prisma = { $queryRaw: async () => [{ seq }] };
  gateway.server = { to: (rooms: string[]) => ({ emit: (event: string, payload: unknown) => calls.push({ rooms, event, payload }) }) } as any;
  await gateway.notifyDataChanged(); await gateway.notifyDataChanged();
  assert.equal(calls.length, 1);
  seq = 11n; await gateway.notifyDataChanged();
  assert.equal(calls[0].event, 'data:changed');
  assert.deepEqual(Object.keys(calls[0].payload), ['revision']);
  assert.notEqual(calls[0].payload.revision, calls[1].payload.revision);
  assert.equal(calls[1].payload.revision, '11');
  assert.ok(calls[0].rooms.includes('role:TEACHER'));
});

test('snapshot patches send changed rows and removal/order IDs without unchanged record contents', () => {
  const before = [{ id: 'one', name: 'UNCHANGED-PRIVATE-CONTENT' }, { id: 'two', name: 'before' }, { id: 'gone' }];
  const after = [before[0], { id: 'two', name: 'after' }, { id: 'new' }];
  const patch = snapshotPatch(before, after);
  assert.deepEqual(patch.changed, [after[1], after[2]]);
  assert.deepEqual(patch.order, ['one', 'two', 'new']);
  assert.ok(!JSON.stringify(patch).includes('UNCHANGED-PRIVATE-CONTENT'));
});

test('section delta cache is scoped to authenticated account and endpoint', async () => {
  const interceptor = new SnapshotDeltaInterceptor();
  const request: any = { method: 'GET', originalUrl: '/api/support', user: { id: 'one' }, headers: { 'x-offline-snapshot': '1' } };
  const context = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => request }) } as any;
  const run = (data: any) => lastValueFrom(interceptor.intercept(context, { handle: () => of(data) }));
  const initial = await run([{ id: 'one', name: 'before' }]);
  request.headers['x-offline-base'] = initial.offlineSnapshot.token;
  const changed = await run([{ id: 'one', name: 'after' }]);
  assert.equal(changed.offlineDelta.patch.changed[0].name, 'after');
  request.user.id = 'two';
  assert.ok((await run([])).offlineSnapshot);
  request.user.id = 'one'; request.originalUrl = '/api/users';
  assert.ok((await run([])).offlineSnapshot);
});
