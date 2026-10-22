-- Track library content creator so content announcement requests can be verified server-side.
ALTER TABLE public.library_items
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.library_items ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS library_insert_scoped ON public.library_items;
CREATE POLICY library_insert_scoped ON public.library_items
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND can_manage_content(stage, CASE kind
      WHEN 'book' THEN 'books'
      WHEN 'note' THEN 'notes'
      WHEN 'summary' THEN 'summaries'
      ELSE ''
    END)
  );

-- Keep message owners' delete permission and grant global public-chat deletion to admins only.
DROP POLICY IF EXISTS public_messages_delete ON public.public_messages;
CREATE POLICY public_messages_delete ON public.public_messages
  FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR public.is_admin());
