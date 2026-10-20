# تطبيق فريق روح التعليمي

موقع ثابت (HTML/JS) مرتبط بـ Supabase، جاهز للنشر على GitHub Pages.

## الملفات
- `index.html` الرئيسية + تسجيل الدخول | `profile.html` | `news.html` | `exams.html` | `lessons.html` | `chat.html` | `support.html` | `admin.html` (للمشرفين)
- `rouh-core.js` الطبقة المشتركة (Supabase، المصادقة، الأدوار، التنقل)

## إعداد Supabase (مرة واحدة)
1. Authentication ← Providers ← Email: عطّل **Confirm email** (الدخول بالهاتف يتحول داخلياً إلى بريد `رقم@rouh-app.com`).
2. Authentication ← URL Configuration: ضع رابط موقعك على GitHub Pages في Site URL.
3. سجّل حساباً ثم رقّه أدمن من SQL Editor:
   `insert into public.user_roles(user_id, role) select id, 'admin' from public.user_private where phone = '09XXXXXXXX' on conflict do nothing;`
   ثم احذف دور student القديم إن أردت: `delete from public.user_roles where role='student' and user_id = (select user_id from public.user_private where phone='09XXXXXXXX');`
4. غيّر كود VIP الافتراضي: `update public.vip_codes set code = 'كودك' where code = 'ROUH2026';`

## الأدوار
student (طالب) • teacher (يرفع الدروس) • supervisor (الدعم والمستخدمون والأخبار الرسمية) • admin (كل شيء + الأدوار)

## الصلاحيات والمحتوى
- الدردشة العامة: كل المستخدمين المسجلين يكتبون فيها.
- الأخبار: النشر للمشرف والأدمن، أو لمن يمنحه المشرف «صلاحية نشر الأخبار» من بوابة المشرفين ← المستخدمون.
- المحتوى: من بوابة المشرفين ← إدارة المحتوى (أسئلة، كتب/نوط، فيديوهات). الملفات والفيديوهات روابط Google Drive بصلاحية «أي شخص لديه الرابط».

- التوثيق: الطالب يقدّم طلباً من أيقونة الشارة في ملفه الشخصي، والمشرف يراجعه من بوابة المشرفين ← طلبات التوثيق.
- رسائل المشرفين في الدردشة تظهر بفقاعة مميزة مع شارة «مشرف».

## النشر على GitHub Pages
ارفع كل الملفات إلى جذر المستودع، ثم Settings ← Pages ← Deploy from branch (main / root).
