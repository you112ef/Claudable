# حل مشاكل النشر على Vercel

## المشاكل الشائعة والحلول

### 1. مشكلة تسجيل الدخول
**المشكلة**: `No existing credentials found`
**الحل**:
```bash
# تسجيل الدخول في Vercel
vercel login

# أو استخدام token
vercel login --token YOUR_TOKEN
```

### 2. مشكلة إعدادات المشروع
**المشكلة**: مسار الملفات غير صحيح
**الحل**: تحديث `vercel.json`

### 3. مشكلة المتغيرات البيئية
**المشكلة**: متغيرات البيئة غير محددة
**الحل**: إضافة المتغيرات المطلوبة

## خطوات الإصلاح

### الخطوة 1: تسجيل الدخول
```bash
vercel login
```

### الخطوة 2: ربط المشروع
```bash
vercel link
```

### الخطوة 3: اختبار النشر
```bash
vercel
```

### الخطوة 4: النشر للإنتاج
```bash
vercel --prod
```

## إعدادات Vercel المحدثة

### إعدادات المشروع الجذر
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
  ]
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
CLAUDE_API_KEY=your_key
OPENAI_API_KEY=your_key
GITHUB_TOKEN=your_token
```

## اختبار النشر

### 1. اختبار محلي
```bash
# اختبار التطبيق المحلي
cd apps/web
npm run dev

cd ../api
python -m uvicorn app.main:app --reload
```

### 2. اختبار النشر
```bash
# نشر تجريبي
vercel

# نشر للإنتاج
vercel --prod
```

## حل المشاكل

### مشكلة البناء
- تحقق من `package.json`
- تحقق من `requirements.txt`
- تحقق من مسارات الملفات

### مشكلة الاتصال
- تحقق من متغيرات البيئة
- تحقق من إعدادات قاعدة البيانات
- تحقق من مفاتيح API

### مشكلة التوجيه
- تحقق من `vercel.json`
- تحقق من مسارات API
- تحقق من إعدادات Next.js