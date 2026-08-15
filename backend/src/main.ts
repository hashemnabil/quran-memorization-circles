import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_PREFIX') || 'api';
  app.setGlobalPrefix(prefix);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  const origins = (config.get<string>('CORS_ORIGINS') || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Authentication first, then role checks; both are applied globally so a
  // forgotten decorator fails closed instead of open.
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

  // Uploaded logos / avatars.
  app.useStaticAssets(join(process.cwd(), config.get('UPLOAD_DIR') || 'uploads'), {
    prefix: '/uploads/',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('نظام إدارة حلقات تحفيظ القرآن الكريم')
    .setDescription(
      'واجهة برمجة التطبيقات الخاصة بنظام إدارة حلقات التحفيظ: المستخدمون، الحلقات، الطلاب، الحضور، التسميع، الاختبارات، الدعم الفني، الإشعارات والمحادثات.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
    customSiteTitle: 'توثيق واجهة النظام',
  });

  const port = parseInt(config.get('PORT') || '4000', 10);
  // No explicit host: Node binds dual-stack, so both 127.0.0.1 and ::1 work.
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`الخادم يعمل على http://localhost:${port}/${prefix}`);
  logger.log(`توثيق Swagger: http://localhost:${port}/${prefix}/docs`);
}

bootstrap();
