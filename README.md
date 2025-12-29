# Halqa - منصة تعليم القرآن الكريم

منصة تعليم القرآن الكريم عبر الإنترنت مع خاصية الحجز والدفع الإلكتروني والمكالمات المرئية.

## 🚀 التقنيات المستخدمة

- **Frontend**: Angular 17
- **UI Framework**: Bootstrap 5
- **Icons**: Font Awesome
- **Payment**: Stripe
- **Video Calls**: 100ms
- **Backend**: Node.js API (Render.com)
- **Deployment**: Vercel

## 📋 المتطلبات

- Node.js (v18.x أو أحدث)
- npm أو yarn
- Angular CLI

## ⚙️ التثبيت والإعداد

```bash
# تثبيت الحزم
npm install

# تشغيل الخادم المحلي
npm start

# المتصفح سيفتح على
# http://localhost:4200
```

## 🔨 أوامر Build

```bash
# Build للتطوير
npm run build:dev

# Build للإنتاج
npm run build

# مراقبة التغييرات
npm run watch
```

## 🌐 النشر على Vercel

للحصول على دليل كامل لرفع المشروع على Vercel:

📖 **[دليل النشر بالعربية](VERCEL_SETUP_AR.md)**
📖 **[Deployment Guide (English)](DEPLOYMENT.md)**

### خطوات سريعة:

1. رفع المشروع على GitHub
2. ربط المشروع مع Vercel
3. Deploy! 🎉

## 📁 هيكل المشروع

```
src/
├── app/
│   ├── components/      # جميع المكونات
│   ├── services/        # الخدمات
│   ├── guards/          # حماية المسارات
│   ├── interceptors/    # HTTP Interceptors
│   ├── shared/          # المكونات المشتركة
│   └── environment/     # ملفات البيئة
├── assets/              # الملفات الثابتة
│   ├── i18n/           # ملفات الترجمة
│   ├── icons/          # الأيقونات
│   └── images/         # الصور
└── styles.scss         # الأنماط العامة
```

## 🔧 البيئات (Environments)

المشروع يدعم بيئتين:

- **Development**: `environment.ts`
- **Production**: `environment.prod.ts`

يتم التبديل تلقائياً حسب نوع الـ build.

## 🧪 الاختبارات

```bash
# تشغيل الاختبارات
npm test
```

## 📚 الوثائق الإضافية

- [دليل تصميم الأزرار](BUTTON_DESIGN_SPECS.md)
- [دليل استكشاف أخطاء HMS](DEBUGGING_HMS_TRACKS.md)
- [دليل المكالمات المرئية](VIDEO_CALL_DEBUGGING_GUIDE.md)
- [تدفق الدفع الإلكتروني](WALLET_PAYMENT_FLOW.md)

## 🤝 المساهمة

المشروع قيد التطوير النشط. للمساهمة:

1. Fork المشروع
2. أنشئ branch للميزة الجديدة
3. Commit التغييرات
4. Push إلى الـ branch
5. افتح Pull Request

## 📝 الترخيص

هذا المشروع خاص بمنصة Halqa.

## 📞 الدعم

للدعم والاستفسارات، يرجى التواصل من خلال:

- Email: support@halqa.com
- GitHub Issues

---

Built with ❤️ using Angular
