import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastValueFrom, of, throwError } from 'rxjs';
import { DataChangeInterceptor } from './data-change.interceptor';
import { RealtimeGateway } from './realtime.gateway';

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
test('change announcements carry only an opaque revision and target authenticated role rooms', () => {
  const calls: any[] = [];
  const gateway = Object.create(RealtimeGateway.prototype) as RealtimeGateway;
  gateway.server = { to: (rooms: string[]) => ({ emit: (event: string, payload: unknown) => calls.push({ rooms, event, payload }) }) } as any;
  gateway.notifyDataChanged(); gateway.notifyDataChanged();
  assert.equal(calls[0].event, 'data:changed');
  assert.deepEqual(Object.keys(calls[0].payload), ['revision']);
  assert.notEqual(calls[0].payload.revision, calls[1].payload.revision);
  assert.ok(calls[0].rooms.includes('role:TEACHER'));
});
