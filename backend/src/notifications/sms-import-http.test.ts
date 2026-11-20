import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as XLSX from 'xlsx';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

// Exercise the real controller, Multer interceptor and spreadsheet parser over
// local HTTP. No database, provider worker or outbound SMS service is started.
const parser = new SmsService({} as any);
@Module({ controllers: [SmsController], providers: [{ provide: SmsService, useValue: { import: (file: Express.Multer.File) => parser.import(file) } }] })
class ImportTestModule {}

test('SMS import accepts actual multipart XLSX/XLS/CSV uploads and diagnoses missing files', async () => {
  const app = await NestFactory.create<NestExpressApplication>(ImportTestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const url = `${await app.getUrl()}/sms/import`;
  try {
    for (const bookType of ['xlsx', 'xls', 'csv'] as const) {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['الاسم', 'الهاتف'], ['مستلم اختبار', '0591234567']]));
      const buffer = XLSX.write(book, { type: 'buffer', bookType });
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(buffer)]), `Microsoft Excel Worksheet جديد (2).${bookType}`);
      const response = await fetch(url, { method: 'POST', body: form });
      const result = await response.json() as any;
      assert.equal(response.status, 201, `${bookType}: ${JSON.stringify(result)}`);
      assert.deepEqual(result.columns, ['الاسم', 'الهاتف']);
      assert.equal(result.rows[0]['الهاتف'], '0591234567');
    }
    const missing = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: {} }) });
    assert.equal(missing.status, 400);
    assert.match((await missing.json() as any).message, /لم يصل ملف المستلمين/);
    const form = new FormData(); form.append('file', new Blob(['anything']), 'recipients.txt');
    const unsupported = await fetch(url, { method: 'POST', body: form });
    assert.equal(unsupported.status, 400);
    assert.match((await unsupported.json() as any).message, /امتداد الملف غير مدعوم/);
    const emptyBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(emptyBook, XLSX.utils.aoa_to_sheet([]));
    const empty = new FormData(); empty.append('file', new Blob([new Uint8Array(XLSX.write(emptyBook, { type: 'buffer', bookType: 'xlsx' }))]), 'empty.xlsx');
    const emptyResponse = await fetch(url, { method: 'POST', body: empty });
    assert.equal(emptyResponse.status, 400);
    assert.match((await emptyResponse.json() as any).message, /الصف الأول/);
  } finally { await app.close(); }
});
