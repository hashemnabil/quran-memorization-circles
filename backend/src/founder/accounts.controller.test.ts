import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateFounderDto, FounderAccountsController } from './accounts.controller';
import { EventEmitter } from 'node:events';
import { loginLimiter } from '../auth/login-limiter';

test('additional founder creation is founder-only and validates identity/password fields', async () => {
  assert.deepEqual(Reflect.getMetadata('roles', FounderAccountsController), ['FOUNDER']);
  const invalid = plainToInstance(CreateFounderDto, { username: 'new.owner', fullName: 'New owner', password: 'short', currentPassword: 'owner-password' });
  assert.ok((await validate(invalid)).some(error => error.property === 'password'));
});
test('an administrator or invalid password cannot create a founder', async () => {
  let writes = 0;
  const controller = new FounderAccountsController({ user: { findFirst: async () => null }, $transaction: async () => { writes++; } } as any);
  await assert.rejects(controller.create({ id: 'admin', role: 'ADMIN' } as any, { username: 'new.owner', fullName: 'New owner', password: 'Temporary-password123', currentPassword: 'wrong' }), (error: any) => error.getStatus() === 403);
  assert.equal(writes, 0);
});

test('changing the proposed new username cannot bypass identity-confirmation attempt limits', () => {
  const limiter = loginLimiter(() => 1000);
  for (let attempt = 0; attempt < 9; attempt++) {
    const response: any = new EventEmitter(); response.statusCode = 403;
    response.setHeader = () => {}; response.status = (status: number) => { response.statusCode = status; return response; }; response.json = () => response;
    let next = false;
    limiter({ method: 'POST', path: '/api/founder/accounts', ip: '127.0.0.1', body: { username: `different-${attempt}` } } as any, response, () => { next = true; });
    if (attempt < 8) { assert.equal(next, true); response.emit('finish'); }
    else { assert.equal(next, false); assert.equal(response.statusCode, 429); }
  }
});
