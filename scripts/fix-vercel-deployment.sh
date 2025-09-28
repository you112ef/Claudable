#!/bin/bash

# سكريبت إصلاح مشاكل النشر على Vercel
# This script fixes common Vercel deployment issues

set -e

echo "🔧 إصلاح مشاكل النشر على Vercel..."

# فحص Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI غير مثبت. جاري التثبيت..."
    npm install -g vercel@latest
fi

echo "✅ Vercel CLI جاهز"

# فحص تسجيل الدخول
if ! vercel whoami &> /dev/null; then
    echo "❌ غير مسجل الدخول في Vercel"
    echo "يرجى تسجيل الدخول أولاً:"
    echo "vercel login"
    exit 1
fi

echo "✅ مسجل الدخول في Vercel"

# فحص إعدادات المشروع
echo "🔍 فحص إعدادات المشروع..."

# فحص ملفات Vercel
if [ ! -f "vercel.json" ]; then
    echo "❌ ملف vercel.json غير موجود"
    exit 1
fi

if [ ! -f "apps/web/package.json" ]; then
    echo "❌ ملف apps/web/package.json غير موجود"
    exit 1
fi

if [ ! -f "apps/api/app/main.py" ]; then
    echo "❌ ملف apps/api/app/main.py غير موجود"
    exit 1
fi

echo "✅ جميع الملفات المطلوبة موجودة"

# فحص التبعيات
echo "🔍 فحص التبعيات..."

# فحص Node.js dependencies
cd apps/web
if [ ! -f "package.json" ]; then
    echo "❌ ملف package.json غير موجود في apps/web"
    exit 1
fi

echo "📦 تثبيت تبعيات الويب..."
npm install

# فحص Python dependencies
cd ../api
if [ ! -f "requirements.txt" ]; then
    echo "❌ ملف requirements.txt غير موجود في apps/api"
    exit 1
fi

echo "📦 تثبيت تبعيات API..."
pip install -r requirements.txt

cd ../..

# اختبار البناء
echo "🔨 اختبار البناء..."

# اختبار بناء الويب
cd apps/web
echo "بناء التطبيق الويب..."
if npm run build; then
    echo "✅ بناء التطبيق الويب نجح"
else
    echo "❌ فشل بناء التطبيق الويب"
    exit 1
fi

cd ../..

# ربط المشروع بـ Vercel
echo "🔗 ربط المشروع بـ Vercel..."

if [ ! -f ".vercel/project.json" ]; then
    echo "ربط المشروع..."
    vercel link
else
    echo "✅ المشروع مربوط بالفعل"
fi

# اختبار النشر
echo "🚀 اختبار النشر..."

echo "اختيار نوع النشر:"
echo "1) نشر تجريبي (preview)"
echo "2) نشر للإنتاج (production)"

read -p "اختر رقم (1-2): " choice

case $choice in
    1)
        echo "نشر تجريبي..."
        vercel
        ;;
    2)
        echo "نشر للإنتاج..."
        vercel --prod
        ;;
    *)
        echo "❌ اختيار غير صحيح"
        exit 1
        ;;
esac

echo "✅ النشر مكتمل!"
echo ""
echo "📋 الخطوات التالية:"
echo "1. تحقق من لوحة تحكم Vercel"
echo "2. اختبر التطبيق المنشور"
echo "3. أضف متغيرات البيئة إذا لزم الأمر"
echo ""
echo "🔗 روابط مفيدة:"
echo "- لوحة تحكم Vercel: https://vercel.com/dashboard"
echo "- إعدادات المشروع: https://vercel.com/dashboard/[project-name]/settings"
echo "- متغيرات البيئة: https://vercel.com/dashboard/[project-name]/settings/environment-variables"