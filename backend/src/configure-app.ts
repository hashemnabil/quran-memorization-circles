import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';


export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  // PDF data URLs are stored with issued records; allow bounded, larger JSON bodies.
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));

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
    setHeaders: (res) => { res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"); },
  });

  if (config.get('NODE_ENV') !== 'production' || config.get('ENABLE_API_DOCS') === 'true') {
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

  }
  app.enableShutdownHooks();
}
