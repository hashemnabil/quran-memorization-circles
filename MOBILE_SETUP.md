# تشغيل الموقع وتطبيق الجوال محلياً

هذا الدليل يجهز بيئة تطوير موحدة. يستخدم الموقع وتطبيق الجوال **نفس NestJS API وقاعدة PostgreSQL**؛ لا تنشئ قاعدة منفصلة للجوال.

## المتطلبات

- Node.js 20 أو أحدث وnpm.
- Docker Desktop لتشغيل PostgreSQL بالطريقة الأسهل، أو PostgreSQL 14+ مثبت محلياً.
- Android Studio + Android SDK لتوليد/تشغيل Android.
- macOS + Xcode لتوليد/تشغيل iOS.

## 1) تنزيل المشروع

```bash
git clone https://github.com/hashemnabil/quran-memorization-circles.git
cd quran-memorization-circles
git checkout feature/mobile-app-offline-sync
```

## 2) تشغيل قاعدة البيانات

```bash
docker compose up -d postgres
```

إذا عندك PostgreSQL جاهز، تخطَّ Docker وعدّل عنوان قاعدة البيانات في `backend/.env`.

## 3) إعداد متغيرات الخادم

انسخ `backend/.env.example` إلى `backend/.env`، وتأكد أن الاتصال المحلي يطابق إعدادات Docker:

```env
DATABASE_URL="postgresql://postgres:root@localhost:5432/quran_circles?schema=public"
DIRECT_URL="postgresql://postgres:root@localhost:5432/quran_circles?schema=public"
PORT=3000
API_PREFIX=api
CORS_ORIGINS=http://localhost:5173,http://localhost:4173,https://localhost,http://localhost,capacitor://localhost
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-another-long-random-secret
PUBLIC_URL=http://localhost:3000
UPLOAD_DIR=uploads
```

استخدم أسراراً قوية خاصة ببيئتك ولا ترفع ملف `.env` إلى Git. عند استضافة الخادم، اضبط `PUBLIC_URL` و`CORS_ORIGINS` على نطاقاتك الفعلية واستخدم HTTPS.

## 4) تثبيت الحزم وإعداد قاعدة البيانات

من جذر المشروع:

```bash
npm run install:all
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm --prefix backend run seed
```

**تنبيه:** أمر seed يعيد تعبئة البيانات التجريبية وقد يمسح البيانات الموجودة. لا تشغّله على قاعدة بيانات حقيقية أو محتوية على بيانات مهمة. للإنتاج اتبع سياسة migrations/backup الخاصة بك ولا تستخدم بيانات الاختبار.

## 5) تشغيل الخادم والموقع معاً

```bash
npm run dev:all
```

- الموقع: http://localhost:5173
- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs

أو شغّل `npm run dev:backend` و`npm run dev:frontend` في نافذتين منفصلتين.

## 6) تجهيز Android وiOS

من مجلد `frontend`:

```bash
npm install
npm run build
npx cap add android
# على macOS فقط:
npx cap add ios
npm run mobile:sync
npm run mobile:android
# على macOS فقط:
npm run mobile:ios
```

نفّذ `npx cap add android` و`npx cap add ios` مرة واحدة فقط لكل منصة. إذا كانت المجلدات موجودة، استخدم `npm run mobile:sync` بدلاً من إضافتها مجدداً.

## 7) ربط نسخة الجوال بالخادم

في بناء Vite المخصص للجوال، اضبط `VITE_API_URL` إلى عنوان API الذي يمكن للجهاز الوصول إليه، شاملاً `/api`، واضبط `VITE_SOCKET_URL` إلى أصل الخادم، من دون `/api`. مثال توضيحي فقط:

```env
VITE_API_URL=https://api.example.com/api
VITE_SOCKET_URL=https://api.example.com
```

لا تستخدم `localhost` في تطبيق هاتف فعلي؛ فهو يشير إلى الهاتف نفسه. يجب أن يكون الخادم قابلاً للوصول عبر HTTPS، وأن يسمح CORS بأصول Capacitor اللازمة. لا تضمّن أسرار الخادم داخل متغيرات `VITE_*` لأنها تُضمّن في التطبيق.

## ما الذي يعمل وما الذي لم يكتمل؟

- التطبيق يستخدم واجهة الموقع الحالية، لذا الصفحات والوظائف المتصلة بالخادم تبقى ضمن نفس التطبيق بعد البناء.
- شريط حالة الانقطاع وطابور IndexedDB التأسيسي موجودان في هذا الفرع.
- **لا يزال العمل دون إنترنت بكامل الوظائف غير مكتمل:** لم تُحوّل كل استعلامات الصفحات إلى تخزين محلي، ولم تُربط كل التعديلات بالطابور، ولا توجد بعد واجهة مزامنة من الخادم مع idempotency/versioning وتسوية تعارضات. أثناء انقطاع الإنترنت، وظائف تعتمد على API لن تعمل لمجرد تثبيت التطبيق.
- لم يتم بناء أو توقيع ملفات APK/IPA أو اختبارها على أجهزة في بيئة هذا التعديل. تحتاج مفاتيح التوقيع وحسابات المتاجر وإعدادات الإنتاج الخاصة بك.
