import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateFounderDto, FounderAccountsController } from './accounts.controller';

test('additional founder creation is founder-only and validates identity/password fields', async () => {
  assert.deepEqual(Reflect.getMetadata('roles', FounderAccountsController), ['FOUNDER']);
  const invalid = plainToInstance(CreateFounderDto, { username: 'new.owner', fullName: 'New owner', password: 'short', currentPassword: 'owner-password' });
  assert.ok((await validate(invalid)).some(error => error.property === 'password'));
});
test('an administrator or invalid password cannot create a founder', async () => {
  let writes = 0;
  const controller = new FounderAccountsController({ user: { findFirst: async () => null }, $transaction: async () => { writes++; } } as any);
  await assert.rejects(controller.create({ id: 'admin', role: 'ADMIN' } as any, { username: 'new.owner', fullName: 'New owner', password: 'Temporary-password123', currentPassword: 'wrong' }));
  assert.equal(writes, 0);
});
