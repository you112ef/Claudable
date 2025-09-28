#!/bin/bash

# سكريبت سريع لإصلاح مشاكل النشر على Vercel
# Quick script to fix Vercel deployment issues

echo "🚀 إصلاح سريع لمشاكل النشر على Vercel..."

# فحص Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "📦 تثبيت Vercel CLI..."
    npm install -g vercel@latest
fi

echo "✅ Vercel CLI جاهز"

# تسجيل الدخول
echo "🔐 تسجيل الدخول في Vercel..."
echo "يرجى اتباع التعليمات على الشاشة"
vercel login

# ربط المشروع
echo "🔗 ربط المشروع..."
vercel link

# إضافة متغيرات البيئة الأساسية
echo "⚙️ إضافة متغيرات البيئة الأساسية..."
echo "يرجى إدخال القيم المطلوبة:"

# إضافة DATABASE_URL
echo "إضافة DATABASE_URL (مثال: postgresql://user:pass@host:port/db):"
vercel env add DATABASE_URL

# إضافة NEXT_PUBLIC_API_BASE
echo "إضافة NEXT_PUBLIC_API_BASE (مثال: https://your-api.vercel.app):"
vercel env add NEXT_PUBLIC_API_BASE

# اختبار النشر
echo "🧪 اختبار النشر..."
echo "اختيار نوع النشر:"
echo "1) نشر تجريبي"
echo "2) نشر للإنتاج"

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
        echo "نشر تجريبي (افتراضي)..."
        vercel
        ;;
esac

echo "✅ تم إصلاح مشاكل النشر!"
echo ""
echo "📋 الخطوات التالية:"
echo "1. تحقق من لوحة تحكم Vercel"
echo "2. اختبر التطبيق المنشور"
echo "3. أضف متغيرات إضافية إذا لزم الأمر"
echo ""
echo "🔗 روابط مفيدة:"
echo "- لوحة تحكم Vercel: https://vercel.com/dashboard"
echo "- إعدادات المشروع: https://vercel.com/dashboard/[project-name]/settings"