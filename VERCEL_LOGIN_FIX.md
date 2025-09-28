# إصلاح مشكلة تسجيل الدخول في Vercel

## المشكلة
```
No existing credentials found. Please log in:
Error: The specified token is not valid. Use `vercel login` to generate a new token.
```

## الحلول

### الحل 1: تسجيل الدخول التفاعلي
```bash
# تشغيل السكريبت التلقائي
./scripts/vercel-login-fix.sh
```

### الحل 2: تسجيل الدخول اليدوي
```bash
# تسجيل الدخول
vercel login

# اتبع التعليمات على الشاشة
# 1. افتح الرابط المعروض
# 2. سجل الدخول في Vercel
# 3. انسخ الكود المعروض
# 4. الصق الكود في Terminal
```

### الحل 3: استخدام Token
```bash
# إنشاء token جديد
# 1. اذهب إلى https://vercel.com/account/tokens
# 2. انقر على "Create Token"
# 3. انسخ Token
# 4. استخدمه في الأمر التالي:

vercel login --token YOUR_TOKEN_HERE
```

### الحل 4: إعادة تعيين بيانات تسجيل الدخول
```bash
# امسح بيانات تسجيل الدخول القديمة
rm -rf ~/.vercel

# سجل الدخول مرة أخرى
vercel login
```

## خطوات النشر الكاملة

### الخطوة 1: تسجيل الدخول
```bash
vercel login
```

### الخطوة 2: ربط المشروع
```bash
vercel link
```

### الخطوة 3: إضافة المتغيرات البيئية
```bash
# متغيرات أساسية
vercel env add DATABASE_URL
vercel env add NEXT_PUBLIC_API_BASE

# متغيرات اختيارية
vercel env add CLAUDE_API_KEY
vercel env add OPENAI_API_KEY
```

### الخطوة 4: النشر
```bash
# نشر تجريبي
vercel

# نشر للإنتاج
vercel --prod
```

## اختبار النشر

### 1. فحص حالة تسجيل الدخول
```bash
vercel whoami
```

### 2. فحص المشروع
```bash
vercel ls
```

### 3. فحص المتغيرات البيئية
```bash
vercel env ls
```

## حل المشاكل المتقدمة

### مشكلة 1: "Invalid token"
```bash
# إنشاء token جديد
# اذهب إلى https://vercel.com/account/tokens
# انقر على "Create Token"
# استخدم Token الجديد
vercel login --token NEW_TOKEN
```

### مشكلة 2: "Network error"
```bash
# تحقق من اتصال الإنترنت
ping vercel.com

# جرب استخدام VPN
# أو انتظر قليلاً وحاول مرة أخرى
```

### مشكلة 3: "Browser not opening"
```bash
# افتح الرابط يدوياً
# انسخ الكود من Terminal
# الصق الكود في المتصفح
```

### مشكلة 4: "Project not found"
```bash
# امسح بيانات تسجيل الدخول
rm -rf ~/.vercel

# سجل الدخول مرة أخرى
vercel login

# اربط المشروع
vercel link
```

## نصائح مهمة

1. **تأكد من اتصال الإنترنت** قبل تسجيل الدخول
2. **استخدم متصفح حديث** لفتح رابط Vercel
3. **انسخ الكود بدقة** من Terminal
4. **انتظر قليلاً** إذا كان الاتصال بطيئاً
5. **جرب VPN** إذا كان هناك مشاكل في الشبكة

## روابط مفيدة

- [تسجيل الدخول في Vercel](https://vercel.com/login)
- [إنشاء Token](https://vercel.com/account/tokens)
- [لوحة تحكم Vercel](https://vercel.com/dashboard)
- [وثائق Vercel](https://vercel.com/docs)

## الدعم

إذا استمرت المشاكل:
1. تحقق من اتصال الإنترنت
2. جرب متصفح مختلف
3. استخدم VPN
4. امسح بيانات تسجيل الدخول القديمة
5. أنشئ token جديد