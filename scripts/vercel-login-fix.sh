#!/bin/bash

# سكريبت إصلاح تسجيل الدخول في Vercel
# Vercel login fix script

echo "🔐 إصلاح مشكلة تسجيل الدخول في Vercel..."

# فحص Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI غير مثبت. جاري التثبيت..."
    npm install -g vercel@latest
fi

echo "✅ Vercel CLI جاهز"

# محاولة تسجيل الدخول
echo "🔐 محاولة تسجيل الدخول في Vercel..."
echo "يرجى اتباع التعليمات على الشاشة"

# تسجيل الدخول التفاعلي
vercel login

# فحص حالة تسجيل الدخول
if vercel whoami &> /dev/null; then
    echo "✅ تم تسجيل الدخول بنجاح!"
    
    # ربط المشروع
    echo "🔗 ربط المشروع بـ Vercel..."
    vercel link
    
    # إضافة متغيرات البيئة الأساسية
    echo "⚙️ إضافة متغيرات البيئة الأساسية..."
    
    echo "يرجى إدخال DATABASE_URL (مثال: postgresql://user:pass@host:port/db):"
    vercel env add DATABASE_URL
    
    echo "يرجى إدخال NEXT_PUBLIC_API_BASE (مثال: https://your-api.vercel.app):"
    vercel env add NEXT_PUBLIC_API_BASE
    
    # اختبار النشر
    echo "🧪 اختبار النشر..."
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
            echo "نشر تجريبي (افتراضي)..."
            vercel
            ;;
    esac
    
    echo "✅ تم إصلاح مشكلة النشر!"
    echo ""
    echo "📋 الخطوات التالية:"
    echo "1. تحقق من لوحة تحكم Vercel"
    echo "2. اختبر التطبيق المنشور"
    echo "3. أضف متغيرات إضافية إذا لزم الأمر"
    
else
    echo "❌ فشل تسجيل الدخول"
    echo ""
    echo "🔧 الحلول البديلة:"
    echo "1. استخدم token مباشرة:"
    echo "   vercel login --token YOUR_TOKEN"
    echo ""
    echo "2. امسح بيانات تسجيل الدخول:"
    echo "   rm -rf ~/.vercel"
    echo "   vercel login"
    echo ""
    echo "3. استخدم متصفح مختلف أو وضع incognito"
    echo ""
    echo "4. تحقق من اتصال الإنترنت"
fi

echo ""
echo "🔗 روابط مفيدة:"
echo "- لوحة تحكم Vercel: https://vercel.com/dashboard"
echo "- إنشاء token: https://vercel.com/account/tokens"
echo "- إعدادات المشروع: https://vercel.com/dashboard/[project-name]/settings"