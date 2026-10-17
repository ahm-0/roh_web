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
    Rouh.avatarOf = function (p) { return (p && p.avatar_url) || DEFAULT_AVATAR; };

    Rouh.loadMe = async function () {
        var s = await sb.auth.getSession();
        Rouh.session = s.data.session;
        if (!Rouh.session) { Rouh.me = null; Rouh.roles = []; return null; }
        var uidv = Rouh.session.user.id;
        var results = await Promise.all([
            sb.from('profiles').select('*').eq('id', uidv).maybeSingle(),
            sb.from('user_private').select('phone,email,gender').eq('user_id', uidv).maybeSingle(),
            sb.from('user_roles').select('role').eq('user_id', uidv)
        ]);
        var prof = results[0].data;
        if (!prof) { await sb.auth.signOut(); Rouh.me = null; return null; }
        if (prof.is_active === false) { await sb.auth.signOut(); Rouh.me = null; Rouh.suspended = true; return null; }
        var priv = results[1].data || {};
        Rouh.me = Object.assign({}, prof, { phone: priv.phone || '', email: priv.email || '', gender: priv.gender || null });
        Rouh.roles = (results[2].data || []).map(function (r) { return r.role; });
        return Rouh.me;
    };

    // يُستدعى في بداية كل صفحة. يعيد المستخدم أو يحوّل إلى صفحة الدخول
    Rouh.init = async function (opts) {
        opts = opts || {};
        var me = await Rouh.loadMe();
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
            if (ev === 'SIGNED_OUT') window.location.replace(PAGES.home);
        });
        return me;
    };

    // ---------- المصادقة ----------
    Rouh.signIn = async function (identifier, password) {
        var email = identifierToEmail(identifier);
        var res = await sb.auth.signInWithPassword({ email: email, password: password });
        if (res.error) throw res.error;
        var me = await Rouh.loadMe();
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
        return Rouh.loadMe();
    };

    Rouh.signOut = async function () {
        try { await sb.auth.signOut(); } catch (e) { /* تجاهل */ }
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

    window.Rouh = Rouh;
})();
