import { useRef, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Download, Upload, X } from 'lucide-react';
import { exportBackupZip, restoreBackupZip, saveZipWithPicker } from './lib/backupService';

type State = { mode: 'export' | 'restore'; step: string; percent: number; result?: { ok: boolean; message: string } } | null;

export default function BackupCard({ disabled }: { disabled?: boolean }) {
  const [state, setState] = useState<State>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = !!state && !state.result;

  const runExport = async () => {
    setState({ mode: 'export', step: 'Preparando...', percent: 0 });
    try {
      const blob = await exportBackupZip((step, percent) => setState(s => s && { ...s, step, percent }));
      const name = `pro-cv-ia-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const r = await saveZipWithPicker(blob, name);
      setState(s => s && { ...s, result: { ok: r === 'saved', message: r === 'saved' ? `Backup salvo como ${name}.` : 'Salvamento cancelado.' } });
    } catch (e) {
      setState(s => s && { ...s, result: { ok: false, message: e instanceof Error ? e.message : 'Falha ao gerar o backup.' } });
    }
  };

  const runRestore = async (file?: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!window.confirm('Restaurar este backup vai substituir as configurações, planos e modelos com os mesmos dados. Continuar?')) return;
    setState({ mode: 'restore', step: 'Preparando...', percent: 0 });
    try {
      const message = await restoreBackupZip(file, (step, percent) => setState(s => s && { ...s, step, percent }));
      setState(s => s && { ...s, result: { ok: true, message: `${message} Recarregue a página para ver tudo atualizado.` } });
    } catch (e) {
      setState(s => s && { ...s, result: { ok: false, message: e instanceof Error ? e.message : 'Falha ao restaurar o backup.' } });
    }
  };

  return <section className="ai-settings-card backup-settings-card">
    <div className="ai-card-heading"><span className="ai-card-icon"><Archive size={17}/></span><div><h3>Backup, Restauração e Migração do Sistema</h3><p>Leve modelos, imagens, planos, Pix e a personalidade da IA para outro remix. Pedidos de clientes e a chave do Gemini não são incluídos.</p></div></div>
    <div className="backup-actions-grid">
      <div className="backup-action-box">
        <b><Download size={16}/> Exportar backup (.ZIP)</b>
        <p>Gera um arquivo .ZIP completo. Você escolhe a pasta e o nome do arquivo no seu computador.</p>
        <button type="button" className="button primary small" disabled={disabled || busy} onClick={runExport}>Exportar backup</button>
      </div>
      <div className="backup-action-box">
        <b><Upload size={16}/> Restaurar de um backup (.ZIP)</b>
        <p>Selecione, em qualquer pasta, o arquivo .ZIP salvo anteriormente para restaurar tudo neste projeto.</p>
        <button type="button" className="button small backup-secondary" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>Escolher arquivo</button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={e => runRestore(e.target.files?.[0])}/>
      </div>
    </div>
    {state && <div className="backup-modal-backdrop" role="dialog" aria-modal="true">
      <div className="backup-modal-content">
        <h3>{state.mode === 'export' ? 'Gerando backup' : 'Restaurando backup'}</h3>
        {!state.result ? <>
          <p>{state.step}</p>
          <div className="backup-progress-bar"><span style={{ width: `${state.percent}%` }}/></div>
          <small>{state.percent}% · não feche esta janela</small>
        </> : <>
          <p className={state.result.ok ? 'backup-ok' : 'backup-error'}>{state.result.ok ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>} {state.result.message}</p>
          <button type="button" className="button primary small" onClick={() => setState(null)}><X size={14}/> Fechar</button>
        </>}
      </div>
    </div>}
  </section>;
}
