import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { PrismaService } from './prisma/prisma.service';
import { recoverSmsSchema } from './notifications/sms-schema';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function applyPendingMigrations() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required before applying database migrations.');
  const result = spawnSync(process.execPath, [
    resolve(__dirname, '../node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--schema', resolve(__dirname, '../prisma/schema.prisma'),
  ], {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL },
  });
  if (result.error || result.status !== 0) throw new Error('Database migrations failed; the API was not started.');
}

async function bootstrap() {
  applyPendingMigrations();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: ['log', 'error', 'warn'] });
  if (await recoverSmsSchema(app.get(PrismaService), process.env.SMS_SCHEMA_RECOVERY === 'apply')) {
    new Logger('Bootstrap').log('SMS schema verified; additive recovery complete');
  }
  configureApp(app);
  const config = app.get(ConfigService);
  const port = parseInt(config.get('PORT') || '4000', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`الخادم يعمل على المنفذ ${port}`);
}
bootstrap();
