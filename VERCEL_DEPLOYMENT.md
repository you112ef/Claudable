# Vercel Deployment Instructions

## المشكلة التي تم حلها
كان النشر على Vercel لا يعمل بسبب:
1. عدم وجود سكريبت `build` في package.json الرئيسي
2. إعدادات Vercel غير صحيحة للمشروع متعدد المجلدات
3. عدم وجود ملف `.vercelignore`

## الحلول المطبقة

### 1. إضافة سكريبت البناء
```json
{
  "scripts": {
    "build": "npm --workspace apps/web run build",
    "start": "npm --workspace apps/web run start"
  }
}
```

### 2. تحديث إعدادات Vercel
```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": "apps/web/.next",
  "functions": {
    "apps/web/app/api/**": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

### 3. إضافة ملف .vercelignore
لتجنب رفع ملفات غير ضرورية مثل:
- مجلدات التطوير
- ملفات البيئة المحلية
- ملفات قاعدة البيانات
- ملفات الاختبار

## كيفية النشر على Vercel

1. تأكد من أن الفرع `cursor/resolve-and-merge-all-updates-746d` محدث
2. في لوحة تحكم Vercel:
   - اختر المشروع
   - اذهب إلى Settings > General
   - تأكد من أن:
     - Build Command: `npm run build`
     - Install Command: `npm install`
     - Output Directory: `apps/web/.next`
     - Root Directory: `/` (المجلد الجذر)

3. قم بتشغيل النشر مرة أخرى

## التحقق من النشر
- تأكد من أن البناء يعمل محلياً: `npm run build`
- تحقق من أن جميع التبعيات مثبتة: `npm install`
- تأكد من أن ملفات البيئة صحيحة

## ملاحظات مهمة
- المشروع يستخدم Next.js 14.2.5
- قاعدة البيانات: SQLite مع Prisma
- API routes موجودة في `apps/web/app/api/`
- الواجهة الأمامية في `apps/web/app/`