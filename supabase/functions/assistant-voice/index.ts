import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveGeminiKey } from '../_shared/ai-key.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const VOICES = ['Aoede', 'Kore', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Zephyr', 'Orus'];
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

function pcmToWav(pcm: Uint8Array, rate = 24000): Uint8Array {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, 'data'); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer)); out.set(pcm, 44); return out;
}

// Public. Body: { action: 'config' } -> { ok, voice_default_on }
//               { action: 'speak', text } -> { ok, audio_base64, mime } using the admin-selected voice.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método inválido.' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: s } = await admin.from('ai_settings').select('voice_style, extra, assistant_enabled').eq('id', 'default').maybeSingle();
    const extra = (s?.extra && typeof s.extra === 'object' && !Array.isArray(s.extra)) ? s.extra as Record<string, unknown> : {};
    if (body?.action === 'config') return json({ ok: true, voice_default_on: extra.voice_default_on === true });
    if (body?.action !== 'speak') return json({ ok: false, error: 'Ação inválida.' }, 400);
    if (s && s.assistant_enabled === false) return json({ ok: false, error: 'Assistente desativada.' }, 200);
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 800) : '';
    if (!text) return json({ ok: false, error: 'Texto vazio.' }, 400);
    const voice = VOICES.includes(s?.voice_style ?? '') ? s!.voice_style : 'Kore';
    const key = await resolveGeminiKey(admin);
    if (!key) return json({ ok: false, error: 'Chave não configurada.' }, 200);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (!res.ok) return json({ ok: false, error: `Google respondeu ${res.status}.` }, 200);
    const data = await res.json();
    const b64 = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
    if (!b64) return json({ ok: false, error: 'Sem áudio.' }, 200);
    const wav = pcmToWav(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    let bin = ''; for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode(...wav.subarray(i, i + 0x8000));
    return json({ ok: true, mime: 'audio/wav', audio_base64: btoa(bin), voice });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
