import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type ContentRecord = {
  id: string;
  stage: string;
  created_by: string | null;
  title: string;
  kind?: string;
  subject?: string;
  subject_name?: string;
  topic?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const oneSignalKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!supabaseUrl || !serviceKey || !oneSignalKey) return json({ error: 'server_configuration_missing' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const callerId = userData.user.id;

  const { data: roles, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', callerId).limit(10);
  if (roleError) return json({ error: 'authorization_check_failed' }, 500);
  const roleNames = (roles ?? []).map((item: { role: string }) => item.role);
  const isAdmin = roleNames.includes('admin');
  const isStaff = isAdmin || roleNames.includes('supervisor');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const action = String(body.action ?? 'broadcast');
  let title = '';
  let message = '';
  let notificationData: Record<string, string> = { type: 'general_announcement' };

  if (action === 'content_added') {
    const contentType = String(body.content_type ?? '');
    const contentId = String(body.content_id ?? '');
    if (!contentId || !['file', 'video'].includes(contentType)) return json({ error: 'invalid_content_reference' }, 400);

    let record: ContentRecord | null = null;
    if (contentType === 'file') {
      const { data, error } = await admin.from('library_items')
        .select('id,stage,created_by,title,kind,subject').eq('id', contentId).maybeSingle();
      if (error) return json({ error: 'content_lookup_failed' }, 500);
      record = data as ContentRecord | null;
    } else {
      const { data, error } = await admin.from('lesson_videos')
        .select('id,stage,created_by,title,subject_name,topic').eq('id', contentId).maybeSingle();
      if (error) return json({ error: 'content_lookup_failed' }, 500);
      record = data as ContentRecord | null;
    }
    if (!record || record.created_by !== callerId) return json({ error: 'content_not_owned' }, 403);

    const section = contentType === 'video' ? 'lessons' : ({ book: 'books', summary: 'summaries', note: 'notes' } as Record<string, string>)[record.kind ?? ''];
    if (!section) return json({ error: 'unsupported_content_kind' }, 400);
    if (!isStaff) {
      const { data: grants, error } = await admin.from('content_upload_permissions')
        .select('stage').eq('user_id', callerId).eq('section', section).limit(50);
      if (error) return json({ error: 'permission_lookup_failed' }, 500);
      if (!(grants ?? []).some((grant: { stage: string | null }) => !grant.stage || grant.stage === record!.stage)) {
        return json({ error: 'content_permission_required' }, 403);
      }
    }

    const labels: Record<string, string> = { book: 'كتاب', summary: 'ملخص', note: 'نوطة' };
    const contentLabel = contentType === 'video' ? 'فيديو درس' : labels[record.kind ?? ''] ?? 'ملف';
    const subjectName = contentType === 'video' ? record.subject_name : record.subject;
    title = 'أضيف محتوى جديد';
    message = `${contentLabel} جديد: ${record.title}${subjectName ? ` • ${subjectName}` : ''}`;
    notificationData = { type: 'new_content', content_type: contentType, content_id: record.id, stage: record.stage };
  } else {
    if (action !== 'broadcast') return json({ error: 'unknown_action' }, 400);
    if (!isAdmin) return json({ error: 'admin_only' }, 403);
    title = typeof body.title === 'string' ? body.title.trim() : '';
    message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!title || title.length > 100 || !message || message.length > 2000) {
      return json({ error: 'title_and_message_required', limits: { title: 100, message: 2000 } }, 400);
    }
  }

  const { data: appSetting, error: settingError } = await admin
    .from('app_settings').select('value').eq('key', 'onesignal_app_id').maybeSingle();
  const appId = typeof appSetting?.value?.app_id === 'string' ? appSetting.value.app_id : '';
  if (settingError || !appId) return json({ error: 'onesignal_app_id_missing' }, 500);

  const ids: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.from('push_subscriptions')
      .select('subscription_id').eq('provider', 'onesignal').range(offset, offset + pageSize - 1);
    if (error) return json({ error: 'subscription_lookup_failed' }, 500);
    ids.push(...(data ?? []).map((row: { subscription_id: string }) => row.subscription_id).filter(Boolean));
    if (!data || data.length < pageSize) break;
  }
  const subscriptionIds = [...new Set(ids)];
  if (!subscriptionIds.length) return json({ ok: true, notified: 0, message: 'no_subscriptions' });

  const authValue = oneSignalKey.startsWith('os_v2_') ? `Key ${oneSignalKey}` : `Basic ${oneSignalKey}`;
  let notified = 0;
  for (let offset = 0; offset < subscriptionIds.length; offset += 2000) {
    const batch = subscriptionIds.slice(offset, offset + 2000);
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { Authorization: authValue, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_subscription_ids: batch,
        headings: { en: title, ar: title },
        contents: { en: message, ar: message },
        data: notificationData,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('[send-general-notification] OneSignal rejected request', response.status, detail.slice(0, 1000));
      return json({ error: 'onesignal_rejected_notification' }, 502);
    }
    notified += batch.length;
  }
  return json({ ok: true, notified });
});
