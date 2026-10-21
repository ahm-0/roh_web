-- Content sections, per-user scoped upload grants, and image restrictions.
-- Existing content rows are preserved. Public catalog rows are not deleted.

-- Lessons become explicitly stage-scoped so database rows can drive the UI.
ALTER TABLE public.lesson_videos ADD COLUMN IF NOT EXISTS stage text;
UPDATE public.lesson_videos
SET stage = CASE
  WHEN subject_id LIKE 'lit_%' THEN 'lit'
  WHEN subject_id LIKE 'n9_%' THEN 'ninth'
  ELSE 'sci'
END
WHERE stage IS NULL;
ALTER TABLE public.lesson_videos ALTER COLUMN stage SET NOT NULL;
ALTER TABLE public.lesson_videos DROP CONSTRAINT IF EXISTS lesson_videos_stage_check;
ALTER TABLE public.lesson_videos
  ADD CONSTRAINT lesson_videos_stage_check CHECK (stage = ANY (ARRAY['sci'::text, 'lit'::text, 'ninth'::text]));

-- Distinguish summaries from notes in the library.
ALTER TABLE public.library_items DROP CONSTRAINT IF EXISTS library_items_kind_check;
ALTER TABLE public.library_items
  ADD CONSTRAINT library_items_kind_check CHECK (kind = ANY (ARRAY['book'::text, 'note'::text, 'summary'::text]));

-- Per-user upload/edit/delete grants. A NULL stage grants the section in every stage.
CREATE TABLE IF NOT EXISTS public.content_upload_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage text NULL CHECK (stage IS NULL OR stage = ANY (ARRAY['sci'::text, 'lit'::text, 'ninth'::text])),
  section text NOT NULL CHECK (section = ANY (ARRAY['lessons'::text, 'books'::text, 'notes'::text, 'summaries'::text, 'exams'::text])),
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, stage, section)
);
CREATE INDEX IF NOT EXISTS content_upload_permissions_user_scope_idx
  ON public.content_upload_permissions (user_id, section, stage);
ALTER TABLE public.content_upload_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.content_upload_permissions TO authenticated;
DROP POLICY IF EXISTS content_upload_permissions_read ON public.content_upload_permissions;
CREATE POLICY content_upload_permissions_read ON public.content_upload_permissions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR public.is_staff());
DROP POLICY IF EXISTS content_upload_permissions_insert_staff ON public.content_upload_permissions;
CREATE POLICY content_upload_permissions_insert_staff ON public.content_upload_permissions
  FOR INSERT TO authenticated WITH CHECK (public.is_staff() AND created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS content_upload_permissions_delete_staff ON public.content_upload_permissions;
CREATE POLICY content_upload_permissions_delete_staff ON public.content_upload_permissions
  FOR DELETE TO authenticated USING (public.is_staff());

CREATE OR REPLACE FUNCTION public.can_manage_content(p_stage text, p_section text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_staff() OR EXISTS (
    SELECT 1 FROM public.content_upload_permissions p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.section = p_section
      AND (p.stage IS NULL OR p.stage = p_stage)
  );
$function$;

-- Keep generic UI checks aligned with scoped grants; RLS below is the enforcement layer.
CREATE OR REPLACE FUNCTION public.is_content_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_staff() OR EXISTS (
    SELECT 1 FROM public.content_upload_permissions p
    WHERE p.user_id = (SELECT auth.uid())
  );
$function$;

-- Lesson content: only staff or users assigned to the lesson section for that stage.
DROP POLICY IF EXISTS lesson_videos_insert ON public.lesson_videos;
DROP POLICY IF EXISTS lesson_videos_update ON public.lesson_videos;
DROP POLICY IF EXISTS lesson_videos_delete ON public.lesson_videos;
CREATE POLICY lesson_videos_insert ON public.lesson_videos
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_content(stage, 'lessons') AND created_by = (SELECT auth.uid()));
CREATE POLICY lesson_videos_update ON public.lesson_videos
  FOR UPDATE TO authenticated USING (public.can_manage_content(stage, 'lessons'))
  WITH CHECK (public.can_manage_content(stage, 'lessons'));
CREATE POLICY lesson_videos_delete ON public.lesson_videos
  FOR DELETE TO authenticated USING (public.can_manage_content(stage, 'lessons'));

-- Library content: each kind maps to its own permission section.
DROP POLICY IF EXISTS library_write ON public.library_items;
CREATE POLICY library_insert_scoped ON public.library_items
  FOR INSERT TO authenticated WITH CHECK (
    public.can_manage_content(stage, CASE kind WHEN 'book' THEN 'books' WHEN 'note' THEN 'notes' WHEN 'summary' THEN 'summaries' ELSE '' END)
  );
CREATE POLICY library_update_scoped ON public.library_items
  FOR UPDATE TO authenticated USING (
    public.can_manage_content(stage, CASE kind WHEN 'book' THEN 'books' WHEN 'note' THEN 'notes' WHEN 'summary' THEN 'summaries' ELSE '' END)
  ) WITH CHECK (
    public.can_manage_content(stage, CASE kind WHEN 'book' THEN 'books' WHEN 'note' THEN 'notes' WHEN 'summary' THEN 'summaries' ELSE '' END)
  );
CREATE POLICY library_delete_scoped ON public.library_items
  FOR DELETE TO authenticated USING (
    public.can_manage_content(stage, CASE kind WHEN 'book' THEN 'books' WHEN 'note' THEN 'notes' WHEN 'summary' THEN 'summaries' ELSE '' END)
  );

-- Quiz question management is scoped by stage to the exams section.
DROP POLICY IF EXISTS quiz_write ON public.quiz_questions;
CREATE POLICY quiz_insert_scoped ON public.quiz_questions
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_content(stage, 'exams'));
CREATE POLICY quiz_update_scoped ON public.quiz_questions
  FOR UPDATE TO authenticated USING (public.can_manage_content(stage, 'exams'))
  WITH CHECK (public.can_manage_content(stage, 'exams'));
CREATE POLICY quiz_delete_scoped ON public.quiz_questions
  FOR DELETE TO authenticated USING (public.can_manage_content(stage, 'exams'));

-- The website now accepts URLs rather than uploading lesson/library files.
DROP POLICY IF EXISTS lesson_videos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS lesson_videos_storage_update ON storage.objects;
DROP POLICY IF EXISTS lesson_videos_storage_delete ON storage.objects;
DROP POLICY IF EXISTS library_files_storage_insert ON storage.objects;
DROP POLICY IF EXISTS library_files_storage_update ON storage.objects;
DROP POLICY IF EXISTS library_files_storage_delete ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;

-- Keep support/news media uploads working, but block the chat upload path.
DROP POLICY IF EXISTS media_insert_own ON storage.objects;
CREATE POLICY media_insert_own ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (storage.foldername(name))[2] IS DISTINCT FROM 'chat'
  );

-- No image attachment URLs can be newly inserted into public/private chat messages.
-- Existing rows remain intact; old URLs are hidden by the client and cleared on edits.
CREATE OR REPLACE FUNCTION public.clear_chat_message_image()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  NEW.image_url := NULL;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_clear_public_message_image ON public.public_messages;
CREATE TRIGGER trg_clear_public_message_image
  BEFORE INSERT OR UPDATE ON public.public_messages
  FOR EACH ROW EXECUTE FUNCTION public.clear_chat_message_image();
DROP TRIGGER IF EXISTS trg_clear_private_message_image ON public.private_messages;
CREATE TRIGGER trg_clear_private_message_image
  BEFORE INSERT OR UPDATE ON public.private_messages
  FOR EACH ROW EXECUTE FUNCTION public.clear_chat_message_image();

-- Stop assigning/changing avatar URLs through the API while preserving existing rows.
CREATE OR REPLACE FUNCTION public.prevent_profile_avatar_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.avatar_url := NULL;
  ELSIF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    NEW.avatar_url := OLD.avatar_url;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS zz_prevent_profile_avatar_change ON public.profiles;
CREATE TRIGGER zz_prevent_profile_avatar_change
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_avatar_change();
