# إصلاح سريع لمشاكل النشر على Vercel

## المشكلة الأساسية
النشر على Vercel لا يعمل بسبب مشاكل في الإعدادات أو تسجيل الدخول.

## الحل السريع

### الطريقة 1: استخدام السكريبت التلقائي
```bash
./scripts/quick-vercel-fix.sh
```

### الطريقة 2: الحل اليدوي

#### الخطوة 1: تثبيت Vercel CLI
```bash
npm install -g vercel
```

#### الخطوة 2: تسجيل الدخول
```bash
vercel login
```

#### الخطوة 3: ربط المشروع
```bash
vercel link
```

#### الخطوة 4: إضافة المتغيرات البيئية
```bash
# إضافة متغيرات أساسية
vercel env add DATABASE_URL
vercel env add NEXT_PUBLIC_API_BASE
```

#### الخطوة 5: النشر
```bash
# نشر تجريبي
vercel

# نشر للإنتاج
vercel --prod
```

## المتغيرات البيئية المطلوبة

### متغيرات أساسية
```
DATABASE_URL=postgresql://user:pass@host:port/database
NEXT_PUBLIC_API_BASE=https://your-api.vercel.app
```

### متغيرات اختيارية
```
CLAUDE_API_KEY=your_claude_key
OPENAI_API_KEY=your_openai_key
GITHUB_TOKEN=your_github_token
```

## اختبار النشر

### 1. اختبار محلي
```bash
# اختبار التطبيق الويب
cd apps/web
npm run dev

# اختبار API
cd apps/api
python -m uvicorn app.main:app --reload
```

### 2. اختبار البناء
```bash
# بناء التطبيق الويب
cd apps/web
npm run build
```

### 3. اختبار النشر
```bash
# نشر تجريبي
vercel

# نشر للإنتاج
vercel --prod
```

## حل المشاكل الشائعة

### مشكلة 1: "No existing credentials found"
**الحل**:
```bash
vercel login
```

### مشكلة 2: "Project not found"
**الحل**:
```bash
vercel link
```

### مشكلة 3: "Build failed"
**الحل**:
```bash
# اختبار البناء محلياً
cd apps/web
npm run build
```

### مشكلة 4: "Environment variable not found"
**الحل**:
```bash
vercel env add VARIABLE_NAME
```

## مراقبة النشر

### فحص حالة النشر
```bash
vercel ls
```

### فحص سجلات النشر
```bash
vercel logs [deployment-url]
```

### فحص متغيرات البيئة
```bash
vercel env ls
```

## نصائح مهمة

1. **تأكد من تسجيل الدخول** في Vercel
2. **اختبر البناء محلياً** قبل النشر
3. **أضف جميع المتغيرات البيئية** المطلوبة
4. **تحقق من مسارات الملفات** في vercel.json
5. **راقب سجلات النشر** لحل المشاكل

## الدعم

إذا استمرت المشاكل:
1. تحقق من سجلات النشر في لوحة تحكم Vercel
2. اختبر البناء محلياً
3. تحقق من متغيرات البيئة
4. راجع إعدادات المشروع

## روابط مفيدة

- [لوحة تحكم Vercel](https://vercel.com/dashboard)
- [وثائق Vercel](https://vercel.com/docs)
- [استكشاف الأخطاء](https://vercel.com/docs/concepts/deployments/troubleshooting)