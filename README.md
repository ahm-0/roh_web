# تطبيق فريق روح التعليمي

موقع ثابت (HTML/JS) مرتبط بـ Supabase، جاهز للنشر على GitHub Pages.

## الملفات
- `index.html` الرئيسية + تسجيل الدخول | `profile.html` | `news.html` | `exams.html` | `lessons.html` | `chat.html` | `support.html` | `admin.html` (للمشرفين ومديري المحتوى المعيّنين)
- `rouh-core.js` الطبقة المشتركة (Supabase، المصادقة، الأدوار، التنقل)

## إعداد Supabase (مرة واحدة)
1. Authentication ← Providers ← Email: عطّل **Confirm email** (الدخول بالهاتف يتحول داخلياً إلى بريد `رقم@rouh-app.com`).
2. Authentication ← URL Configuration: ضع رابط موقعك على GitHub Pages في Site URL.
3. سجّل حساباً ثم رقّه أدمن من SQL Editor:
   `insert into public.user_roles(user_id, role) select id, 'admin' from public.user_private where phone = '09XXXXXXXX' on conflict do nothing;`
   ثم احذف دور student القديم إن أردت: `delete from public.user_roles where role='student' and user_id = (select user_id from public.user_private where phone='09XXXXXXXX');`
4. غيّر كود VIP الافتراضي: `update public.vip_codes set code = 'كودك' where code = 'ROUH2026';`

## الأدوار
student (طالب) • teacher (دور تعريفي فقط؛ لا يمنح رفعاً تلقائياً) • supervisor (الدعم والمستخدمون والأخبار الرسمية) • admin (كل شيء + الأدوار)

## الصلاحيات والمحتوى
- الدردشة العامة: كل المستخدمين المسجلين يكتبون فيها.
- الأخبار: النشر للمشرف والأدمن، أو لمن يمنحه المشرف «صلاحية نشر الأخبار» من بوابة المشرفين ← المستخدمون.
- المحتوى الظاهر للطلاب مصدره جداول Supabase؛ لا تُنشأ قوائم دروس أو اختبارات تجريبية داخل الصفحة. الكتب والملخصات والنوط والأسئلة وفيديوهات الدروس تظهر من السجلات الموجودة فقط.
- إدخال المحتوى من بوابة الإعدادات ← إدارة المحتوى، ويستطيع المشرف تعيين مستخدمين لأقسام ومراحل محددة (دروس، كتب، ملخصات، نوط، اختبارات). تفرض قاعدة البيانات هذه القيود عبر RLS، وليس عبر إخفاء عناصر الواجهة فقط.
- الملفات والفيديوهات تُضاف كرابط مشاركة/عرض؛ لا يرفع الموقع ملفات كتب أو فيديوهات إلى التخزين.
- لا توجد أداة لإرفاق الصور في الدردشة أو تغيير صورة الملف الشخصي. يمنع Supabase كذلك إدراج صور رسائل جديدة أو تغيير avatar عبر API؛ تبقى السجلات القديمة محفوظة.

- التوثيق: الطالب يقدّم طلباً من أيقونة الشارة في ملفه الشخصي، والمشرف يراجعه من بوابة المشرفين ← طلبات التوثيق.
- رسائل المشرفين في الدردشة تظهر بفقاعة مميزة مع شارة «مشرف».

## إشعارات OneSignal العامة
- بعد تسجيل الدخول يسجل الموقع هوية المستخدم في OneSignal. تفعيل الإشعارات يتم بموافقة المستخدم من الملف الشخصي ← الإعدادات ← «تفعيل الإشعارات على هذا الجهاز»، ثم يُحفظ `subscription_id` في `push_subscriptions` بسياسات RLS تقصر القراءة والكتابة على صاحب الحساب.
- الأدمن فقط يرى أداة «إشعار عام للمستخدمين» في لوحة الإشراف. الإرسال يمر عبر Supabase Edge Function `send-general-notification` التي تتحقق من JWT ودور `admin` قبل استهداف الاشتراكات.
- OneSignal App ID قيمة عامة محفوظة في `app_settings`؛ REST API key سرّ خادمي باسم `ONESIGNAL_REST_API_KEY` ويجب إضافته في Supabase Dashboard ← Edge Functions ← Secrets. لا يوضع المفتاح في ملفات الموقع أو GitHub.
- عامل الخدمة المطلوب لـ OneSignal موجود في `OneSignalSDKWorker.js` ويعمل ضمن مسار GitHub Pages للمشروع.
- تطبيق Capacitor يرسل OneSignal subscription ID عبر `RohAndroid` كحدث `roh:onesignal-player-id`؛ تستمع النواة الآن لهذا الحدث وتستدعي واجهات الجسر الأصلية عند تسجيل الدخول ثم تحفظ الاشتراك في قاعدة البيانات مع إعادة المحاولة عند تعذر الشبكة.
- يجب أن يطابق `ONESIGNAL_APP_ID` في `RohMainActivity.java` المعرّف المسجل في `app_settings.onesignal_app_id`. إذا تغير App ID، حدّث مشروع Android إلى `f96774ae-3355-4a66-bda2-7a44730432fe` وأعد بناء/تثبيت التطبيق؛ ملفات الويب وحدها لا تغيّر إعداد OneSignal المضمّن في APK الموجود.
- عند إضافة كتاب أو ملخص أو نوطة أو فيديو درس عبر لوحة الإشراف/صفحة الدروس، يرسل الموقع إشعار «أضيف محتوى جديد» تلقائيًا إلى الاشتراكات المسجلة. تتأكد Edge Function من هوية صاحب سجل المحتوى وصلاحيته قبل الإرسال.
- الأدمن يستطيع حذف أي رسالة في الدردشة العامة؛ يظل المستخدم قادرًا على حذف رسائله فقط، ولا يستطيع الأدمن تعديل رسالة غيره.
- صفحة إعدادات الملف الشخصي تعرض بصمة المطور ورابط الهاتف.

ترحيل قاعدة البيانات المرتبط بهذه الميزات: `migrations/202610210945_content_sections_and_image_restrictions.sql`.

## التطبيق الأصلي (Capacitor)
الموقع يعمل داخل Capacitor ويستخدم طبقة التوافق في `rouh-core.js` ← `Rouh.native` مع الجسر اليدوي الذي يكشفه التطبيق الأصلي باسم `window.RohAndroid` (ويظل `window.RohApp` مدعوماً للتوافق):
- `window.RohAndroid.webReady()` تُستدعى تلقائياً عند تحميل الصفحة لإزالة طبقة الترحيب الأصلية. تُعاد المحاولة عند جاهزية DOM وعند `load` وبعد مهلة قصيرة إذا تأخر الجسر.
- فيديوهات الدروس: `window.RohAndroid.openNativeVideoViewer(url, title[, true])` — الثالث يمنع تصوير الشاشة للدروس المعلّمة «محمي».
- ملفات PDF: `window.RohAndroid.openNativePdfViewer(url, title)` | مدير الملفات: `window.RohAndroid.openStorageManager()` (الملف الشخصي ← الإعدادات).
- منع اللقطات: `setScreenCaptureProtection(true|false)` أثناء الاختبارات وبتفضيل المستخدم.
- المشاركة والنسخ وحفظ الصور تستخدم إضافات Capacitor إن وُجدت (Share, Filesystem, Clipboard, Browser) وإلا Web Share ثم بدائل المتصفح.
- روابط Drive تُحوَّل إلى رابط مباشر `drive.usercontent.google.com/download?id=...` للمشغّل وعارض PDF.

## النشر على GitHub Pages
ارفع كل الملفات إلى جذر المستودع، ثم Settings ← Pages ← Deploy from branch (main / root).
