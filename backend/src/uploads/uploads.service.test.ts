import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
const service = new UploadsService({ get: () => undefined } as any);
test('image uploads refuse executable SVGs and mismatched content before any write', async () => {
  for (const file of [
    { originalname: 'a.svg', mimetype: 'image/svg+xml', buffer: Buffer.from('<svg><script/></svg>'), size: 24 },
    { originalname: 'a.png', mimetype: 'image/png', buffer: Buffer.from('<html>not a png</html>'), size: 24 },
  ]) await assert.rejects(service.upload(file as any, 'avatars', 'user'), BadRequestException);
});
test('a URL alone never permits deleting another account image or a legacy unowned image', async () => {
  await assert.rejects(service.remove('http://localhost:4000/uploads/avatars/avatar-other-123.png', 'user'), ForbiddenException);
  await assert.rejects(service.remove('/uploads/avatars/avatar-legacy.png', 'user'), ForbiddenException);
  assert.equal(await service.remove('/uploads/avatars/avatar-legacy.png'), false);
});
