# تحديث OneSignal في تطبيق Capacitor

انسخ `RohMainActivity.java` إلى مجلد `android-patches` في مشروع تطبيق Android، مستبدلًا الملف الحالي، ثم ابنِ APK جديدًا وأعد تثبيته. الملف يهيئ OneSignal على App ID `f96774ae-3355-4a66-bda2-7a44730432fe` ويرسل الاشتراك عبر جسر `RohAndroid` إلى الموقع.

يجب أن يطابق App ID هذا القيمة في `public.app_settings` بمفتاح `onesignal_app_id`. تطبيقات APK القديمة لا تتغير بتحديث الموقع وحده.
