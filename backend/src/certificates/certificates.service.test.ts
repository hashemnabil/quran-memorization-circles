import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role, CertificateKind, StudentFileRequestKind } from '@prisma/client';
import { CertificatesService } from './certificates.service';

test('certificate request persists an administrator notification with its request and emits after commit', async () => {
  let committed = false;
  const notices: any[] = []; const events: any[] = [];
  const tx = {
    $queryRaw: async () => [], syncChange: { create: async () => ({}) },
    studentFileRequest: { create: async () => ({ id: 'request', studentId: 'student' }) },
    user: { findMany: async ({ where }: any) => {
      assert.deepEqual(where, { role: Role.ADMIN, isActive: true, deletedAt: null });
      return [{ id: 'admin1' }, { id: 'admin2' }];
    } },
    notification: { create: async ({ data }: any) => { notices.push(data); return { ...data, id: `notification-${notices.length}` }; } },
  };
  const prisma = {
    student: { findFirst: async () => ({ id: 'student' }) },
    $transaction: async (run: any) => { const value = await run(tx); committed = true; return value; },
    notification: { count: async () => 1 },
  };
  const service = new CertificatesService(prisma as any, { emitToUser: (...args: any[]) => { assert(committed); events.push(args); } } as any);
  const request = await service.createRequest({ id: 'student-account', role: Role.STUDENT, fullName: 'Student' } as any,
    { kind: StudentFileRequestKind.CERTIFICATE, certificateKind: CertificateKind.JUZ_COMPLETION });
  assert.equal(request.id, 'request');
  assert.equal(notices.length, 2); assert.equal(events.length, 2);
  assert.equal(notices[0].link, '/certificates-admin');
  assert.deepEqual(notices[0].data, { requestId: 'request', studentId: 'student' });
  assert.equal(events[0][1], 'notification:new');
});

test('a failed notification transaction never sends a live success event', async () => {
  let emitted = false;
  const prisma = {
    student: { findFirst: async () => ({ id: 'student' }) },
    $transaction: async () => { throw new Error('transaction rolled back'); },
  };
  const service = new CertificatesService(prisma as any, { emitToUser: () => { emitted = true; } } as any);
  await assert.rejects(service.createRequest({ id: 'student-account', role: Role.STUDENT } as any,
    { kind: StudentFileRequestKind.CERTIFICATE, certificateKind: CertificateKind.JUZ_COMPLETION }), /rolled back/);
  assert.equal(emitted, false);
});
