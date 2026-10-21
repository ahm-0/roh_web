/* =====================================================================
   rouh-core.js — الطبقة المشتركة لتطبيق فريق روح التعليمي
   (Supabase + المصادقة + الأدوار + التنقل بين الصفحات + أدوات مساعدة)
   يجب تحميله بعد مكتبة supabase-js وقبل سكربت كل صفحة.
   ===================================================================== */
(function () {
    'use strict';

    // مفتاح publishable مخصص للاستخدام في المتصفح، والحماية الفعلية تتم عبر سياسات RLS في القاعدة
    var SUPABASE_URL = 'https://pzqbyevyxirvfywqzstr.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_1l3XMnqtDjol4KCFizEmaA_4ZqgiNvV';
    var EMAIL_DOMAIN = 'rouh-app.com';

    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    // ---------- التنقل (صفحات حقيقية تعمل على GitHub Pages بمسارات نسبية) ----------
    var PAGES = {
        home: 'index.html',
        profile: 'profile.html',
        news: 'news.html',
        quizzes: 'exams.html',
        lessons: 'lessons.html',
        chat: 'chat.html',
        support: 'support.html',
        supervisor: 'admin.html'
    };

    function go(key) {
        var target = PAGES[key] || key;
        window.location.href = target;
    }

    var STAGE_NAMES = {
        sci: 'البكالوريا العلمي',
        lit: 'البكالوريا الأدبي',
        ninth: 'الصف التاسع الأساسي'
    };
    var DEFAULT_AVATAR = 'https://i.ibb.co/whHk6hcT/IMG-20261011-WA0031.jpg';

    // ---------- أدوات مساعدة ----------
    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function safeUrl(u) {
        var s = String(u || '').trim();
        return /^https?:\/\//i.test(s) ? s : '';
    }

    function timeAgo(iso) {
        if (!iso) return '';
        var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 45) return 'الآن';
        if (diff < 3600) return 'منذ ' + Math.max(1, Math.floor(diff / 60)) + ' د';
        if (diff < 86400) return 'منذ ' + Math.floor(diff / 3600) + ' ساعة';
        if (diff < 86400 * 30) return 'منذ ' + Math.floor(diff / 86400) + ' يوم';
        return new Date(iso).toLocaleDateString('ar-SY');
    }

    function clockTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var today = new Date();
        var t = d.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === today.toDateString()) return t;
        var y = new Date(); y.setDate(today.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return 'أمس';
        return d.toLocaleDateString('ar-SY');
    }

    function normalizePhone(s) { return String(s || '').replace(/[^\d]/g, ''); }

    function identifierToEmail(id) {
        var v = String(id || '').trim().toLowerCase();
        if (v.indexOf('@') > -1) return v;
        return normalizePhone(v) + '@' + EMAIL_DOMAIN;
    }

    function compressImage(file, maxDim, quality) {
        maxDim = maxDim || 1280; quality = quality || 0.82;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = reject;
            reader.onload = function (e) {
                var img = new Image();
                img.onerror = reject;
                img.onload = function () {
                    var w = img.width, h = img.height;
                    var ratio = Math.min(1, maxDim / Math.max(w, h));
                    var c = document.createElement('canvas');
                    c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('compress_failed')); }, 'image/jpeg', quality);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function uid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    // رفع ملف إلى التخزين (المسار: <bucket>/<userId>/<folder>/<uuid>.<ext>) ويعيد الرابط العام
    async function uploadFile(bucket, blobOrFile, folder, ext) {
        var me = Rouh.me;
        if (!me) throw new Error('not_authenticated');
        var e = ext || (blobOrFile.type && blobOrFile.type.split('/')[1]) || 'bin';
        if (e === 'jpeg') e = 'jpg';
        var prefix = (bucket === 'lesson-videos' || bucket === 'library-files') ? 'uploads' : me.id;
        var path = prefix + '/' + (folder ? folder + '/' : '') + uid() + '.' + e;
        var res = await sb.storage.from(bucket).upload(path, blobOrFile, {
            contentType: blobOrFile.type || undefined, upsert: false, cacheControl: '3600'
        });
        if (res.error) throw res.error;
        return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }

    async function uploadImage(file, folder) {
        var blob = await compressImage(file, 1280, 0.82);
        return uploadFile('media', blob, folder || 'img', 'jpg');
    }

    // ---------- المظهر (فاتح/داكن) ----------
    function applyTheme(iconId) {
        var dark = localStorage.getItem('rouh_dark_mode') === 'true';
        document.body.classList.toggle('dark-ui', dark);
        var ic = document.getElementById(iconId || 'themeToggleIcon');
        if (ic) ic.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    function toggleTheme(iconId) {
        var dark = !document.body.classList.contains('dark-ui');
        localStorage.setItem('rouh_dark_mode', dark ? 'true' : 'false');
        applyTheme(iconId);
    }

    // ---------- المستخدم الحالي والصلاحيات ----------
    var Rouh = {
        sb: sb, PAGES: PAGES, go: go, STAGE_NAMES: STAGE_NAMES, DEFAULT_AVATAR: DEFAULT_AVATAR,
        esc: esc, safeUrl: safeUrl, timeAgo: timeAgo, clockTime: clockTime,
        normalizePhone: normalizePhone, compressImage: compressImage,
        uploadFile: uploadFile, uploadImage: uploadImage,
        applyTheme: applyTheme, toggleTheme: toggleTheme,
        me: null, roles: [], session: null
    };

    Rouh.hasRole = function (r) { return Rouh.roles.indexOf(r) > -1; };
    Rouh.isAdmin = function () { return Rouh.hasRole('admin'); };
    Rouh.isStaff = function () { return Rouh.hasRole('admin') || Rouh.hasRole('supervisor'); };
    Rouh.isContentManager = function () { return Rouh.isStaff() || Rouh.hasRole('teacher'); };
    Rouh.canPublishNews = function () { return Rouh.isStaff() || !!(Rouh.me && Rouh.me.can_publish_news); };

    // يحلل رابط Google Drive ويعيد معرّف الملف وروابط المعاينة (أو null إن لم يكن رابط Drive صالحاً)
    Rouh.driveInfo = function (url) {
        var s = String(url || '').trim();
        if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(s)) return null;
        var m = s.match(/\/(?:file\/d|folders)\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
        if (!m) return null;
        return {
            id: m[1],
            isFolder: /\/folders\//.test(s),
            link: s,
            preview: 'https://drive.google.com/file/d/' + m[1] + '/preview'
        };
    };

    Rouh.avatarOf = function (p) { return (p && p.avatar_url) || DEFAULT_AVATAR; };

    // ---------- ذاكرة مؤقتة للمستخدم (تجعل التنقل بين الصفحات فورياً) ----------
    var CACHE_KEY = 'rouh_me_cache_v1';
    var CACHE_TTL = 5 * 60 * 1000;

    function readCache(uidv, allowStale) {
        try {
            var o = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (o && o.uid === uidv && (allowStale || Date.now() - o.t < CACHE_TTL)) return o;
        } catch (e) { /* تجاهل */ }
        return null;
    }
    Rouh.saveCache = function () {
        try {
            if (Rouh.me) sessionStorage.setItem(CACHE_KEY, JSON.stringify({ uid: Rouh.me.id, t: Date.now(), me: Rouh.me, roles: Rouh.roles }));
        } catch (e) { /* تجاهل */ }
    };
    function clearCache() { try { sessionStorage.removeItem(CACHE_KEY); } catch (e) { /* تجاهل */ } }

    Rouh.loadMe = async function (force) {
        Rouh.transient = false;
        var s = await sb.auth.getSession();   // قراءة محلية سريعة عادةً
        if (s.error) { Rouh.transient = true; return null; }
        Rouh.session = s.data.session;
        if (!Rouh.session) { clearCache(); Rouh.me = null; Rouh.roles = []; return null; }
        var uidv = Rouh.session.user.id;

        var cached = !force && readCache(uidv, false);
        if (cached) { Rouh.me = cached.me; Rouh.roles = cached.roles; return Rouh.me; }

        var results;
        try {
            results = await Promise.all([
                sb.from('profiles').select('*').eq('id', uidv).maybeSingle(),
                sb.from('user_private').select('phone,email,gender').eq('user_id', uidv).maybeSingle(),
                sb.from('user_roles').select('role').eq('user_id', uidv)
            ]);
        } catch (e) { results = [{ error: e }, {}, {}]; }

        // خطأ شبكة/خادم مؤقت: لا نُخرج المستخدم من حسابه — نستخدم آخر نسخة محفوظة إن وُجدت
        if (results[0].error || results[2].error) {
            var stale = readCache(uidv, true);
            if (stale) { Rouh.me = stale.me; Rouh.roles = stale.roles; return Rouh.me; }
            Rouh.transient = true;
            return null;
        }
        var prof = results[0].data;
        if (!prof) { await sb.auth.signOut(); clearCache(); Rouh.me = null; return null; }
        if (prof.is_active === false) { await sb.auth.signOut(); clearCache(); Rouh.me = null; Rouh.suspended = true; return null; }
        var priv = results[1].data || {};
        Rouh.me = Object.assign({}, prof, { phone: priv.phone || '', email: priv.email || '', gender: priv.gender || null });
        Rouh.roles = (results[2].data || []).map(function (r) { return r.role; });
        Rouh.saveCache();
        return Rouh.me;
    };

    function showRetryBanner() {
        if (document.getElementById('rouhRetryBanner')) return;
        var d = document.createElement('div');
        d.id = 'rouhRetryBanner';
        d.style.cssText = 'position:fixed;inset:auto 12px 96px 12px;z-index:100000;background:#0f1f14;color:#fff;padding:12px 14px;border-radius:16px;font:800 0.82rem Tajawal,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35);';
        d.innerHTML = 'تعذر الاتصال بالخادم. <button style="margin-inline-start:8px;border:none;border-radius:10px;padding:6px 12px;background:#22c55e;color:#fff;font:800 0.8rem Tajawal,sans-serif;cursor:pointer;" onclick="location.reload()">إعادة المحاولة</button>';
        document.body.appendChild(d);
    }

    // تحميل مسبق (Prefetch) لصفحات التنقل أثناء خمول المتصفح لتسريع الانتقال
    function prefetchPages() {
        var cur = (location.pathname.split('/').pop() || 'index.html');
        ['index.html', 'profile.html', 'news.html', 'exams.html', 'chat.html', 'lessons.html'].forEach(function (pg) {
            if (pg === cur) return;
            var l = document.createElement('link');
            l.rel = 'prefetch'; l.href = pg; l.as = 'document';
            document.head.appendChild(l);
        });
    }

    // يُستدعى في بداية كل صفحة. يعيد المستخدم أو يحوّل إلى صفحة الدخول
    Rouh.init = async function (opts) {
        opts = opts || {};
        if (Rouh.native) Rouh.native.ready();   // استعداد التطبيق عند تهيئة الصفحة
        var me = await Rouh.loadMe();
        if (!me && Rouh.transient) {
            // مشكلة اتصال وليست «غير مسجّل»: لا نحوّل إلى شاشة الدخول
            if (opts.requireAuth !== false) showRetryBanner();
            return null;
        }
        if (!me) {
            if (opts.requireAuth !== false) {
                var back = encodeURIComponent(location.pathname.split('/').pop() || '');
                window.location.replace(PAGES.home + (back ? '?next=' + back : ''));
            }
            return null;
        }
        if (opts.requireStaff && !Rouh.isStaff()) {
            window.location.replace(PAGES.home);
            return null;
        }
        // تحديث آخر ظهور (مرة كل 10 دقائق كحد أقصى)
        try {
            var last = Number(sessionStorage.getItem('rouh_seen_at') || 0);
            if (Date.now() - last > 600000) {
                sessionStorage.setItem('rouh_seen_at', String(Date.now()));
                sb.rpc('touch_last_seen');
            }
        } catch (e) { /* تجاهل */ }
        // إخفاء/إظهار عناصر حسب الدور: <el data-role="staff|admin|content">
        document.querySelectorAll('[data-role]').forEach(function (el) {
            var need = el.getAttribute('data-role');
            var ok = need === 'staff' ? Rouh.isStaff() : need === 'admin' ? Rouh.isAdmin() : need === 'content' ? Rouh.isContentManager() : true;
            if (!ok) el.style.display = 'none';
        });
        sb.auth.onAuthStateChange(function (ev) {
            if (ev === 'SIGNED_OUT') { clearCache(); window.location.replace(PAGES.home); }
        });
        if (window.requestIdleCallback) requestIdleCallback(prefetchPages, { timeout: 4000 }); else setTimeout(prefetchPages, 2500);
        return me;
    };

    // ---------- المصادقة ----------
    Rouh.signIn = async function (identifier, password) {
        var email = identifierToEmail(identifier);
        var res = await sb.auth.signInWithPassword({ email: email, password: password });
        if (res.error) throw res.error;
        var me = await Rouh.loadMe(true);
        if (!me) throw new Error(Rouh.suspended ? 'account_suspended' : 'profile_missing');
        return me;
    };

    Rouh.signUp = async function (d) {
        var phone = normalizePhone(d.phone);
        var res = await sb.auth.signUp({
            email: (d.email && String(d.email).trim().toLowerCase()) || (phone + '@' + EMAIL_DOMAIN),
            password: d.password,
            options: { data: { full_name: d.full_name, phone: phone, stage: d.stage, city: d.city, gender: d.gender || null } }
        });
        if (res.error) throw res.error;
        if (!res.data.session) throw new Error('email_confirmation_required');
        return Rouh.loadMe(true);
    };

    Rouh.signOut = async function () {
        try { await sb.auth.signOut(); } catch (e) { /* تجاهل */ }
        clearCache();
        Rouh.me = null; Rouh.roles = [];
        window.location.replace(PAGES.home);
    };

    Rouh.authErrorText = function (err) {
        var m = String((err && (err.message || err.error_description)) || err || '');
        if (/Invalid login credentials/i.test(m)) return 'رقم الهاتف أو كلمة المرور غير صحيحة';
        if (/already registered|already been registered|User already/i.test(m)) return 'هذا الرقم مسجل مسبقاً، جرّب تسجيل الدخول';
        if (/Password should be|at least 6/i.test(m)) return 'كلمة المرور يجب أن تكون 6 محارف على الأقل';
        if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة';
        if (/email_confirmation_required/.test(m)) return 'تم إنشاء الحساب. افتح رسالة التأكيد المرسلة إلى بريدك ثم سجّل الدخول.';
        if (/account_suspended|banned/i.test(m)) return 'تم إيقاف هذا الحساب. تواصل مع الدعم.';
        if (/Failed to fetch|NetworkError/i.test(m)) return 'تعذر الاتصال بالخادم، تحقق من الإنترنت';
        return 'حدث خطأ: ' + m;
    };

    // ---------- استدعاء دوال الإدارة (Edge Function) ----------
    Rouh.adminCall = async function (payload) {
        var res = await sb.functions.invoke('admin-users', { body: payload });
        if (res.error) {
            var msg = res.error.message || 'request_failed';
            try { if (res.error.context && res.error.context.json) { var j = await res.error.context.json(); if (j && j.error) msg = j.error; } } catch (e) { /* تجاهل */ }
            throw new Error(msg);
        }
        if (res.data && res.data.error) throw new Error(res.data.error);
        return res.data;
    };

    // ---------- التنقل من عناصر الصفحة: <button data-nav="news"> ----------
    document.addEventListener('click', function (ev) {
        var el = ev.target.closest && ev.target.closest('[data-nav]');
        if (!el) return;
        ev.preventDefault();
        go(el.getAttribute('data-nav'));
    });


    // =====================================================================
    // الجسر مع تطبيق Capacitor الأصلي (window.RohApp) + إضافات Capacitor الاختيارية
    // كل الاستدعاءات آمنة: إن لم يكن الجسر موجوداً (متصفح عادي) تعمل بدائل الويب تلقائياً.
    // =====================================================================
    var N = {};
    // نفس نظام الملف المرجعي: capacitorPlugin + isNative + حراسة typeof لكل استدعاء أصلي
    var capacitorPlugin = function (name) {
        try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; } catch (e) { return null; }
    };
    var plugin = capacitorPlugin;
    var isNativeRoh = function () {
        try {
            return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || !!window.RohApp;
        } catch (e) { return !!window.RohApp; }
    };

    N.available = function () { return !!(window.RohApp); };
    N.isCapacitor = function () {
        try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
    };
    N.isNativeApp = isNativeRoh;
    N.capacitorPlugin = capacitorPlugin;

    // استدعاء دالة من window.RohApp بأمان. يعيد true إن نُفّذ الاستدعاء.
    N.call = function (name) {
        var args = Array.prototype.slice.call(arguments, 1);
        try {
            var bridge = window.RohApp;
            if (bridge && typeof bridge[name] === 'function') { bridge[name].apply(bridge, args); return true; }
        } catch (e) { /* تجاهل */ }
        return false;
    };

    var readyDone = false;
    // استعداد التطبيق (تُستدعى أول شيء عند تهيئة كل صفحة): تزيل شاشة الترحيب الأصلية
    N.ready = function () {
        if (readyDone) return;
        try {
            if (typeof window.rohNativeReady === 'function') { window.rohNativeReady(); readyDone = true; return; }
            if (window.RohApp && typeof window.RohApp.ready === 'function') { window.RohApp.ready(); readyDone = true; }   // window.RohApp.ready()
            var splash = capacitorPlugin('SplashScreen');
            if (splash && typeof splash.hide === 'function') { splash.hide(); readyDone = true; }
        } catch (error) { console.warn('تعذر إرسال إشارة الجاهزية للتطبيق', error); }
    };
    N.openVideo = function (url, title, secure) { // window.RohApp.openVideo(url, title[, secure])
        return secure ? N.call('openVideo', url, title || '', true) : N.call('openVideo', url, title || '');
    };
    N.openPdf = function (url, title) { return N.call('openPdf', url, title || ''); };
    N.openStorageManager = function () { return N.call('openStorageManager'); };

    // ---- حماية لقطات الشاشة (تتجمّع عدة أسباب: تفضيل المستخدم / اختبار / ...) ----
    var protectReasons = {};
    var protectState = null;
    function userProtectPref() { try { return localStorage.getItem('rouh_shot_protect') === 'true'; } catch (e) { return false; } }
    function applyProtection() {
        var want = Object.keys(protectReasons).some(function (k) { return protectReasons[k]; });
        if (protectState === want) return;
        if (N.call(want ? 'enableScreenshotProtection' : 'disableScreenshotProtection')) protectState = want;
    }
    N.setProtection = function (reason, on) { protectReasons[reason] = !!on; applyProtection(); };
    N.userProtection = function () { return userProtectPref(); };
    N.toggleUserProtection = function () {
        var next = !userProtectPref();
        try { localStorage.setItem('rouh_shot_protect', next ? 'true' : 'false'); } catch (e) { /* تجاهل */ }
        N.setProtection('user', next);
        return next;
    };

    // ---- رابط Google Drive → رابط مباشر قابل للتشغيل/التحميل داخل ExoPlayer وعارض PDF ----
    N.driveDirect = function (idOrUrl) {
        var info = /^https?:/i.test(String(idOrUrl)) ? Rouh.driveInfo(idOrUrl) : { id: idOrUrl };
        if (!info || !info.id) return '';
        return 'https://drive.usercontent.google.com/download?id=' + info.id + '&export=download&confirm=t';
    };

    // ---- نسخ نص ----
    async function copyText(text) {
        text = String(text || '');
        try {
            var cb = plugin('Clipboard');
            if (cb && cb.write) { await cb.write({ string: text }); return true; }
        } catch (e) { /* تابع للبدائل */ }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
        } catch (e) { /* تابع للبدائل */ }
        try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
            document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) { return false; }
    }

    // ---- مشاركة نص/رابط ----
    async function shareText(opts) {
        opts = opts || {};
        try {
            var sh = capacitorPlugin('Share');
            if (isNativeRoh() && sh && sh.share) { await sh.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title || 'مشاركة' }); return 'shared'; }
        } catch (e) { if (e && /cancel/i.test(String(e.message || e))) return 'cancelled'; }
        try {
            if (navigator.share) { await navigator.share({ title: opts.title, text: opts.text, url: opts.url }); return 'shared'; }
        } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
        var okc = await copyText([opts.text, opts.url].filter(Boolean).join('\n'));
        return okc ? 'copied' : 'failed';
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onerror = reject;
            r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
            r.readAsDataURL(blob);
        });
    }
    function canvasToBlob(canvas, type) {
        return new Promise(function (resolve) { canvas.toBlob(function (b) { resolve(b); }, type || 'image/png'); });
    }

    // ---- مشاركة صورة (Canvas أو Blob) ----
    async function shareImage(src, filename, opts) {
        opts = opts || {};
        filename = filename || 'rouh-image.png';
        var blob = (src && src.toBlob) ? await canvasToBlob(src, 'image/png') : src;
        if (!blob) return 'failed';
        // 1) إضافات Capacitor: حفظ مؤقت ثم مشاركة الملف
        try {
            var fs = capacitorPlugin('Filesystem'), sh = capacitorPlugin('Share');
            if (isNativeRoh() && fs && sh && fs.writeFile && sh.share) {
                var b64 = await blobToBase64(blob);
                var w = await fs.writeFile({ path: filename, data: b64, directory: 'CACHE' });
                await sh.share({ title: opts.title, text: opts.text, files: [w.uri], dialogTitle: opts.title || 'مشاركة' });
                return 'shared';
            }
        } catch (e) { if (e && /cancel/i.test(String(e.message || e))) return 'cancelled'; }
        // 2) Web Share API مع ملفات
        try {
            var file = new File([blob], filename, { type: blob.type || 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: opts.title, text: opts.text, files: [file] });
                return 'shared';
            }
        } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
        // 3) تنزيل مباشر في المتصفح
        return downloadBlob(blob, filename) ? 'downloaded' : 'failed';
    }

    function downloadBlob(blob, filename) {
        try {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename; a.style.display = 'none';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            return true;
        } catch (e) { return false; }
    }

    // ---- حفظ صورة: داخل التطبيق عبر ورقة المشاركة/الملفات، وفي المتصفح كتنزيل ----
    async function saveImage(src, filename, opts) {
        var blob = (src && src.toBlob) ? await canvasToBlob(src, 'image/png') : src;
        if (!blob) return 'failed';
        if (N.isNativeApp()) return shareImage(blob, filename, opts);
        return downloadBlob(blob, filename || 'rouh-image.png') ? 'downloaded' : 'failed';
    }

    // ---- فتح رابط خارجي ----
    async function openExternal(rawUrl) {
        var url = Rouh.safeUrl(rawUrl);
        if (!url) return false;
        try {
            var br = capacitorPlugin('Browser');
            if (isNativeRoh() && br && br.open) { await br.open({ url: url }); return true; }
            if (isNativeRoh() && window.RohApp && typeof window.RohApp.openExternalUrl === 'function') { window.RohApp.openExternalUrl(url); return true; }
            var opened = window.open(url, '_blank', 'noopener,noreferrer');
            if (!opened) window.location.href = url;
            return true;
        } catch (error) {
            console.warn('تعذر فتح الرابط', error);
            return false;
        }
    }

    // ---- فتح ملف PDF: عارض التطبيق الأصلي إن وُجد، وإلا رابط خارجي ----
    N.viewPdf = function (url, title) {
        var d = Rouh.driveInfo(url);
        if (d && d.isFolder) { openExternal(url); return 'external'; }
        var direct = d ? N.driveDirect(d.id) : Rouh.safeUrl(url);
        if (direct && N.openPdf(direct, title)) return 'native';
        openExternal(url);
        return 'external';
    };

    Rouh.native = N;
    Rouh.nativeReady = N.ready;
    Rouh.isNative = isNativeRoh;
    Rouh.capacitorPlugin = capacitorPlugin;
    Rouh.copy = copyText;
    Rouh.share = shareText;
    Rouh.shareImage = shareImage;
    Rouh.saveImage = saveImage;
    Rouh.openExternal = openExternal;

    // أول تحميل: إزالة شاشة الترحيب الأصلية + إظهار عناصر التطبيق الأصلي + استعادة حماية اللقطات
    function nativeBoot() {
        N.ready();                                           // استعداد التطبيق أولاً
        document.documentElement.dataset.screenCapture = userProtectPref() ? 'blocked' : 'allowed';
        if (isNativeRoh()) {
            document.querySelectorAll('[data-native-only]').forEach(function (el) { el.style.display = ''; });
            N.setProtection('user', userProtectPref());      // يعيد الحالة الصحيحة في كل صفحة
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', nativeBoot); else nativeBoot();
    window.addEventListener('load', function () { N.ready(); });      // شبكة أمان إن تأخر الجسر
    setTimeout(function () { N.ready(); }, 2500);
    // عند مغادرة الصفحة: نرفع الحماية المؤقتة (الاختبار/الفيديو) ونُبقي تفضيل المستخدم
    window.addEventListener('pagehide', function () {
        Object.keys(protectReasons).forEach(function (k) { if (k !== 'user') protectReasons[k] = false; });
        applyProtection();
    });

    // الروابط الخارجية target=_blank تُفتح عبر Capacitor Browser إن توفر
    document.addEventListener('click', function (ev) {
        var a = ev.target.closest && ev.target.closest('a[target="_blank"]');
        if (!a || !isNativeRoh() || !capacitorPlugin('Browser')) return;
        var href = a.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) return;
        ev.preventDefault();
        openExternal(href);
    });

    window.Rouh = Rouh;
})();
