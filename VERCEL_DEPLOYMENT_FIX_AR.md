# إصلاح مشاكل النشر على Vercel - دليل شامل

## المشاكل الشائعة والحلول

### 1. مشكلة تسجيل الدخول
**الخطأ**: `No existing credentials found`
**الحل**:
```bash
# تسجيل الدخول
vercel login

# أو استخدام token
vercel login --token YOUR_TOKEN
```

### 2. مشكلة ربط المشروع
**الخطأ**: `Project not found`
**الحل**:
```bash
# ربط المشروع
vercel link

# أو إنشاء مشروع جديد
vercel
```

### 3. مشكلة البناء
**الخطأ**: `Build failed`
**الحل**:
```bash
# اختبار البناء محلياً
cd apps/web
npm run build

cd ../api
pip install -r requirements.txt
```

### 4. مشكلة المتغيرات البيئية
**الخطأ**: `Environment variable not found`
**الحل**:
- إضافة المتغيرات في لوحة تحكم Vercel
- أو استخدام `vercel env add`

## خطوات الإصلاح السريع

### الخطوة 1: تثبيت Vercel CLI
```bash
npm install -g vercel
```

### الخطوة 2: تسجيل الدخول
```bash
vercel login
```

### الخطوة 3: ربط المشروع
```bash
vercel link
```

### الخطوة 4: إضافة المتغيرات البيئية
```bash
# إضافة متغيرات أساسية
vercel env add DATABASE_URL
vercel env add NEXT_PUBLIC_API_BASE
```

### الخطوة 5: اختبار النشر
```bash
# نشر تجريبي
vercel

# نشر للإنتاج
vercel --prod
```

## إعدادات Vercel المحدثة

### ملف vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    },
    {
      "src": "apps/api/app/main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/apps/api/app/main.py"
    },
    {
      "src": "/(.*)",
      "dest": "/apps/web/$1"
    }
  ],
  "env": {
    "API_PORT": "8080",
    "PROJECTS_ROOT": "/tmp/projects",
    "PREVIEW_PORT_START": "3100",
    "PREVIEW_PORT_END": "3999"
  },
  "functions": {
    "apps/api/app/main.py": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
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
VERCEL_TOKEN=your_vercel_token
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

# تثبيت تبعيات API
cd ../api
pip install -r requirements.txt
```

### 3. اختبار النشر
```bash
# نشر تجريبي
vercel

# نشر للإنتاج
vercel --prod
```

## حل المشاكل المتقدمة

### مشكلة Python Dependencies
```bash
# استخدام ملف requirements مبسط
cd apps/api
cp requirements-vercel.txt requirements.txt
```

### مشكلة Next.js Build
```bash
# فحص إعدادات Next.js
cd apps/web
cat next.config.js

# اختبار البناء
npm run build
```

### مشكلة Database Connection
```bash
# اختبار اتصال قاعدة البيانات
python -c "
import os
import psycopg2
try:
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
"
```

## سكريبت الإصلاح التلقائي

استخدم السكريبت التالي لإصلاح المشاكل تلقائياً:

```bash
./scripts/fix-vercel-deployment.sh
```

## مراقبة النشر

### 1. فحص حالة النشر
```bash
vercel ls
```

### 2. فحص سجلات النشر
```bash
vercel logs [deployment-url]
```

### 3. فحص متغيرات البيئة
```bash
vercel env ls
```

## نصائح مهمة

1. **تأكد من تسجيل الدخول** في Vercel قبل النشر
2. **اختبر البناء محلياً** قبل النشر
3. **أضف جميع المتغيرات البيئية** المطلوبة
4. **تحقق من مسارات الملفات** في vercel.json
5. **راقب سجلات النشر** لحل المشاكل

## روابط مفيدة

- [لوحة تحكم Vercel](https://vercel.com/dashboard)
- [وثائق Vercel](https://vercel.com/docs)
- [استكشاف الأخطاء](https://vercel.com/docs/concepts/deployments/troubleshooting)
- [متغيرات البيئة](https://vercel.com/docs/concepts/projects/environment-variables)

## الدعم

إذا استمرت المشاكل:
1. تحقق من سجلات النشر في لوحة تحكم Vercel
2. اختبر البناء محلياً
3. تحقق من متغيرات البيئة
4. راجع إعدادات المشروع