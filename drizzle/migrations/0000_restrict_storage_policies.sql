CREATE OR REPLACE FUNCTION public.is_active_pix_qr(_bucket text, _name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pix_configs c JOIN public.plans p ON p.id=c.plan_id AND p.is_active
    WHERE c.is_active AND c.qr_code_object_path IS NOT NULL
      AND (c.qr_code_object_path = _bucket || '/' || _name OR c.qr_code_object_path = _name
           OR c.qr_code_object_path LIKE '%/' || _bucket || '/' || _name || '%'))
$$;

DROP POLICY IF EXISTS "Authenticated users can delete template references" ON storage.objects;
CREATE POLICY "Admin delete template references" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'template-references' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Public read qr codes" ON storage.objects;
CREATE POLICY "Read active or admin qr codes" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'qr-codes' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_active_pix_qr(bucket_id, name)));

DROP POLICY IF EXISTS "Sign pix qr codes for checkout" ON storage.objects;
CREATE POLICY "Sign active pix qr codes for checkout" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'pix-qr-codes' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_active_pix_qr(bucket_id, name)));