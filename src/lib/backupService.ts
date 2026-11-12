import JSZip from 'jszip';
import { supabase } from '../integrations/supabase/client';
import type { Json } from '../integrations/supabase/types';
import { resolveImageSource, type ImageKind } from './imageSources';

export const BACKUP_VERSION = 1;
type Progress = (step: string, percent: number) => void;

const extFromType = (type: string) => (type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg');
const typeFromExt = (name: string) => (name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const isZipRef = (value: unknown): value is string => typeof value === 'string' && value.startsWith('assets/');

async function fetchAsset(source: string | null | undefined, kind: ImageKind): Promise<Blob | null> {
  if (!source) return null;
  try {
    const { url, revoke } = await resolveImageSource(source, kind);
    const res = await fetch(url);
    revoke?.();
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function exportBackupZip(onProgress: Progress): Promise<Blob> {
  const zip = new JSZip();
  onProgress('Lendo configurações da IA...', 5);
  const [ai, identity, plans, pix, templates] = await Promise.all([
    supabase.rpc('admin_get_ai_settings'),
    supabase.rpc('admin_get_assistant_identity'),
    supabase.from('plans').select('*'),
    supabase.from('pix_configs').select('*'),
    supabase.from('templates').select('*'),
  ]);
  for (const r of [ai, identity, plans, pix, templates]) if (r.error) throw new Error(r.error.message);

  const aiRow = ai.data?.[0] ?? null;
  const idRow = identity.data?.[0] ?? null;
  const planRows = plans.data ?? [];
  const pixRows = pix.data ?? [];
  const tplRows = templates.data ?? [];

  const total = 1 + pixRows.length + tplRows.length * 3;
  let done = 0;
  const step = (msg: string) => onProgress(msg, 10 + Math.round((++done / Math.max(total, 1)) * 75));

  const add = async (source: string | null | undefined, kind: ImageKind, base: string) => {
    const blob = await fetchAsset(source, kind);
    if (!blob) return source ?? null;
    const path = `${base}.${extFromType(blob.type)}`;
    zip.file(path, blob);
    return path;
  };

  let avatar: string | null = idRow?.assistant_avatar_url || null;
  avatar = await add(avatar, 'template', 'assets/assistant/avatar');
  step('Baixando foto da assistente...');

  const pixOut = [];
  for (const row of pixRows) {
    const slug = planRows.find(p => p.id === row.plan_id)?.slug ?? row.plan_id;
    const qr = await add(row.qr_code_object_path, 'pix', `assets/pix/${slug}`);
    pixOut.push({ ...row, plan_slug: slug, qr_code_object_path: qr });
    step('Baixando QR Codes do Pix...');
  }

  const tplOut = [];
  for (const row of tplRows) {
    const preview = await add(row.preview_url, 'template', `assets/templates/${row.id}-preview`); step('Baixando imagens dos modelos...');
    const reference = await add(row.reference_file_url, 'template', `assets/templates/${row.id}-reference`); step('Baixando imagens dos modelos...');
    const clean = await add(row.clean_background_url, 'template', `assets/templates/${row.id}-background`); step('Baixando imagens dos modelos...');
    tplOut.push({ ...row, preview_url: preview, reference_file_url: reference, clean_background_url: clean });
  }

  const manifest = {
    app: 'pro-cv-ia',
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    counts: { templates: tplOut.length, plans: planRows.length, pix_configs: pixOut.length },
    ai_settings: aiRow ? {
      model: aiRow.model, personality_tone: aiRow.personality_tone, voice_style: aiRow.voice_style,
      temperature: aiRow.temperature, system_prompt: aiRow.system_prompt, extra: aiRow.extra,
    } : null,
    assistant_identity: idRow ? { ...idRow, assistant_avatar_url: avatar } : null,
    plans: planRows,
    pix_configs: pixOut,
    templates: tplOut,
  };
  zip.file('backup.json', JSON.stringify(manifest, null, 2));
  onProgress('Gerando arquivo ZIP...', 90);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  onProgress('Backup pronto.', 100);
  return blob;
}

export async function saveZipWithPicker(blob: Blob, suggestedName: string): Promise<'saved' | 'cancelled'> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<any> };
  if (w.showSaveFilePicker && window.self === window.top) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Arquivo de Backup ZIP', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = suggestedName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
}

export async function restoreBackupZip(file: File, onProgress: Progress): Promise<string> {
  onProgress('Abrindo arquivo ZIP...', 3);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error('Arquivo inválido: não é um ZIP de backup.'); }
  const entry = zip.file('backup.json');
  if (!entry) throw new Error('Backup inválido: o arquivo backup.json não foi encontrado.');
  let m: any;
  try { m = JSON.parse(await entry.async('string')); } catch { throw new Error('Backup inválido: backup.json corrompido.'); }
  if (m?.app !== 'pro-cv-ia' || typeof m.version !== 'number' || m.version > BACKUP_VERSION) throw new Error('Este arquivo não é um backup compatível com este sistema.');

  const cache = new Map<string, string>();
  const upload = async (ref: unknown, kind: ImageKind): Promise<string | null> => {
    if (!isZipRef(ref)) return typeof ref === 'string' ? ref : null;
    if (cache.has(ref)) return cache.get(ref)!;
    const f = zip.file(ref);
    if (!f) return null;
    const blob = new Blob([await f.async('arraybuffer')], { type: typeFromExt(ref) });
    const bucket = kind === 'template' ? 'template-references' : 'pix-qr-codes';
    const prefix = ref.startsWith('assets/assistant/') ? 'assistant/' : '';
    const path = `${prefix}${crypto.randomUUID()}.${extFromType(blob.type)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(`Falha ao enviar imagem (${ref}): ${error.message}`);
    const out = kind === 'template' ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : `${bucket}/${path}`;
    cache.set(ref, out);
    return out;
  };

  onProgress('Restaurando configurações da IA...', 10);
  if (m.ai_settings) {
    const a = m.ai_settings;
    const { error } = await supabase.rpc('admin_save_ai_settings', {
      _api_key: null as unknown as string, _model: a.model, _personality_tone: a.personality_tone,
      _voice_style: a.voice_style, _temperature: Number(a.temperature), _system_prompt: a.system_prompt, _extra: (a.extra ?? {}) as Json,
    });
    if (error) throw new Error(`Configurações de IA: ${error.message}`);
  }
  if (m.assistant_identity) {
    const i = m.assistant_identity;
    const avatar = await upload(i.assistant_avatar_url, 'template');
    const { error } = await supabase.rpc('admin_save_assistant_identity', {
      _name: i.assistant_name || 'Anya', _avatar_url: avatar || '', _enabled: i.assistant_enabled !== false, _welcome: i.welcome_message || '',
    });
    if (error) throw new Error(`Identidade da assistente: ${error.message}`);
  }

  onProgress('Restaurando planos e Pix...', 25);
  const plans: any[] = Array.isArray(m.plans) ? m.plans : [];
  const pixList: any[] = Array.isArray(m.pix_configs) ? m.pix_configs : [];
  for (const plan of plans) {
    const pix = pixList.find(p => p.plan_slug === plan.slug || p.plan_id === plan.id);
    const qr = pix ? await upload(pix.qr_code_object_path, 'pix') : null;
    const { error } = await supabase.rpc('admin_save_plan_and_pix', {
      _slug: plan.slug, _price_cents: Number(plan.price_cents) || 0, _pix_key: pix?.pix_key ?? '',
      _recipient_name: pix?.recipient_name ?? '', _qr_code_object_path: qr as unknown as string,
    });
    if (error) throw new Error(`Plano ${plan.slug}: ${error.message}`);
    await supabase.from('plans').update({ name: plan.name, description: plan.description, features: plan.features, sort_order: plan.sort_order, is_active: plan.is_active }).eq('slug', plan.slug);
  }

  const templates: any[] = Array.isArray(m.templates) ? m.templates : [];
  let i = 0;
  for (const t of templates) {
    onProgress(`Restaurando modelos (${++i}/${templates.length})...`, 40 + Math.round((i / Math.max(templates.length, 1)) * 55));
    const row = {
      id: t.id, name: t.name, category: t.category, prompt: t.prompt ?? null, is_active: t.is_active !== false,
      creation_type: t.creation_type ?? null, generated_html: t.generated_html ?? null, template_schema: t.template_schema ?? null,
      preview_url: (await upload(t.preview_url, 'template')) || '',
      reference_file_url: await upload(t.reference_file_url, 'template'),
      clean_background_url: await upload(t.clean_background_url, 'template'),
    };
    const { error } = await supabase.from('templates').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`Modelo "${t.name}": ${error.message}`);
  }
  onProgress('Restauração concluída.', 100);
  return `${templates.length} modelo(s), ${plans.length} plano(s) e as configurações da IA foram restaurados.`;
}
