import { Plus, Trash2, Copy } from 'lucide-react';
import { MONTHS, newExperience, sortExperiences, type ExperienceItem } from './lib/experiences';

const years = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() - i));
function MonthYear({ month, year, disabled, onChange }: { month: string; year: string; disabled?: boolean; onChange: (m: string, y: string) => void }) {
  return <span className="exp-monthyear">
    <select value={month} disabled={disabled} onChange={e => onChange(e.target.value, year)} aria-label="Mês"><option value="">Mês</option>{MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}</select>
    <select value={year} disabled={disabled} onChange={e => onChange(month, e.target.value)} aria-label="Ano"><option value="">Ano</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
  </span>;
}

export default function ExperienceEditor({ items, onChange }: { items: ExperienceItem[]; onChange: (items: ExperienceItem[]) => void }) {
  const update = (id: string, patch: Partial<ExperienceItem>) => onChange(items.map(e => e.id === id ? { ...e, ...patch } : e));
  const sorted = sortExperiences(items);
  return <div className="exp-editor wide">
    <span className="exp-title">Experiências profissionais</span>
    {sorted.map((e, idx) => <div key={e.id} className="exp-card">
      <div className="exp-card-head"><b>Experiência {idx + 1}</b><span>
        <button type="button" title="Duplicar" aria-label="Duplicar experiência" onClick={() => onChange([...items, { ...e, id: crypto.randomUUID() }])}><Copy size={14} /></button>
        <button type="button" title="Excluir" aria-label="Excluir experiência" onClick={() => onChange(items.filter(x => x.id !== e.id))}><Trash2 size={14} /></button>
      </span></div>
      <div className="exp-grid">
        <label>Empresa ou estabelecimento<input value={e.company} onChange={ev => update(e.id, { company: ev.target.value })} /></label>
        <label>Cargo ou função<input value={e.role} onChange={ev => update(e.id, { role: ev.target.value })} /></label>
        <label>Início<MonthYear month={e.startMonth} year={e.startYear} onChange={(m, y) => update(e.id, { startMonth: m, startYear: y })} /></label>
        <label>Encerramento<MonthYear month={e.endMonth} year={e.endYear} disabled={e.current} onChange={(m, y) => update(e.id, { endMonth: m, endYear: y })} /></label>
      </div>
      <label className="exp-check"><input type="checkbox" checked={e.current} onChange={ev => update(e.id, { current: ev.target.checked, ...(ev.target.checked ? { endMonth: '', endYear: '' } : {}) })} /> Ainda trabalho nesta empresa</label>
      <label>Principais atividades e responsabilidades<textarea rows={4} placeholder="Uma atividade por linha" value={e.activities} onChange={ev => update(e.id, { activities: ev.target.value })} /></label>
    </div>)}
    <button type="button" className="exp-add" onClick={() => onChange([...items, newExperience()])}><Plus size={15} /> Adicionar {items.length ? 'outra ' : ''}experiência profissional</button>
  </div>;
}
