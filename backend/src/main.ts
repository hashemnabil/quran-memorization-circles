import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: ['log', 'error', 'warn'] });
  configureApp(app);
  const config = app.get(ConfigService);
  const port = parseInt(config.get('PORT') || '4000', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`الخادم يعمل على المنفذ ${port}`);
}
bootstrap();
