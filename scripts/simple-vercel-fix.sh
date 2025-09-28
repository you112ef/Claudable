#!/bin/bash

# سكريبت بسيط لحل مشكلة Vercel
# Simple script to fix Vercel issues

echo "🔧 حل مشكلة النشر على Vercel..."

# فحص Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "📦 تثبيت Vercel CLI..."
    npm install -g vercel@latest
fi

echo "✅ Vercel CLI جاهز"

# امسح بيانات تسجيل الدخول القديمة
echo "🧹 مسح بيانات تسجيل الدخول القديمة..."
rm -rf ~/.vercel 2>/dev/null || true

# تسجيل الدخول
echo "🔐 تسجيل الدخول في Vercel..."
echo "يرجى اتباع التعليمات:"
echo "1. افتح الرابط المعروض"
echo "2. سجل الدخول في Vercel"
echo "3. انسخ الكود المعروض"
echo "4. الصق الكود هنا"
echo ""

vercel login

# فحص تسجيل الدخول
if vercel whoami &> /dev/null; then
    echo "✅ تم تسجيل الدخول بنجاح!"
    
    # ربط المشروع
    echo "🔗 ربط المشروع..."
    vercel link
    
    # إضافة متغيرات البيئة
    echo "⚙️ إضافة متغيرات البيئة..."
    echo "يرجى إدخال القيم المطلوبة:"
    
    echo "DATABASE_URL (مثال: postgresql://user:pass@host:port/db):"
    vercel env add DATABASE_URL
    
    echo "NEXT_PUBLIC_API_BASE (مثال: https://your-api.vercel.app):"
    vercel env add NEXT_PUBLIC_API_BASE
    
    # النشر
    echo "🚀 النشر..."
    echo "اختيار نوع النشر:"
    echo "1) نشر تجريبي"
    echo "2) نشر للإنتاج"
    
    read -p "اختر رقم (1-2): " choice
    
    case $choice in
        1)
            vercel
            ;;
        2)
            vercel --prod
            ;;
        *)
            vercel
            ;;
    esac
    
    echo "✅ تم النشر بنجاح!"
    
else
    echo "❌ فشل تسجيل الدخول"
    echo ""
    echo "🔧 الحلول البديلة:"
    echo "1. جرب مرة أخرى: vercel login"
    echo "2. استخدم token: vercel login --token YOUR_TOKEN"
    echo "3. تحقق من اتصال الإنترنت"
    echo "4. جرب متصفح مختلف"
fi

echo ""
echo "📋 الخطوات التالية:"
echo "1. تحقق من لوحة تحكم Vercel"
echo "2. اختبر التطبيق المنشور"
echo "3. أضف متغيرات إضافية إذا لزم الأمر"