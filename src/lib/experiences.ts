export type ExperienceItem = {
  id: string; company: string; role: string;
  startMonth: string; startYear: string; endMonth: string; endYear: string;
  current: boolean; activities: string;
};
export const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTH_NAMES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const newExperience = (): ExperienceItem => ({ id: crypto.randomUUID(), company: '', role: '', startMonth: '', startYear: '', endMonth: '', endYear: '', current: false, activities: '' });

const norm = (s: string) => s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Accepts "01", "1", "jan", "Janeiro" → "01". */
export function parseMonth(value: unknown): string {
  const raw = norm(String(value ?? ''));
  if (!raw) return '';
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return String(n).padStart(2, '0');
  const i = MONTH_NAMES.findIndex(m => m.startsWith(raw.slice(0, 3)));
  return i >= 0 ? String(i + 1).padStart(2, '0') : '';
}
export function parseYear(value: unknown): string {
  const m = String(value ?? '').match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : '';
}
const label = (month: string, year: string) => year ? (month ? `${MONTHS[Number(month) - 1]}/${year}` : year) : '';
export function formatPeriod(e: ExperienceItem): string {
  const start = label(e.startMonth, e.startYear);
  const end = e.current ? 'Atual' : label(e.endMonth, e.endYear);
  return start && end ? `${start} a ${end}` : start || end;
}
const key = (e: ExperienceItem) => Number(e.startYear || 0) * 100 + Number(e.startMonth || 0);
/** Most recent first; current jobs on top. */
export const sortExperiences = (list: ExperienceItem[]) => [...list].sort((a, b) => Number(b.current) - Number(a.current) || key(b) - key(a));

export const activityLines = (text: string) => text.split(/\r?\n/).map(l => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
/** Adds new activity lines, skipping ones already present (case/accent/punctuation-insensitive). */
export function mergeActivities(current: string, additions: string[]): string {
  const lines = activityLines(current);
  const seen = new Set(lines.map(norm));
  for (const a of additions) { const t = a.replace(/^\s*[•\-*]\s*/, '').trim(); const k = norm(t); if (t && !seen.has(k)) { seen.add(k); lines.push(t); } }
  return lines.join('\n');
}
const header = (e: ExperienceItem) => [e.role, e.company, formatPeriod(e)].filter(s => s && s.trim()).join(' — ');
export const formatExperiencesSimple = (list: ExperienceItem[]) => sortExperiences(list).map(header).filter(Boolean).join('\n');
export const formatExperiencesFull = (list: ExperienceItem[]) => sortExperiences(list).map(e => [header(e), ...activityLines(e.activities).map(l => `• ${l}`)].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');

export const sameJob = (a: { company?: string; role?: string }, b: { company?: string; role?: string }) => norm(a.company || '') === norm(b.company || '') && norm(a.role || '') === norm(b.role || '');
