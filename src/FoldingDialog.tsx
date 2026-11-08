import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine';
import { Numeric } from './Numeric';
import { FoldingDiagnostics } from './FoldingDiagnostics';
import { estimateFoldCenter, type FoldEstimate } from './folding';
import type { FitResult } from './types';

export function FoldingDialog({ counts, initialCenter, onApply, onClose }: { counts: number[]; initialCenter: number; onApply: (center: number, automatic: boolean) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), engine = useRef<Engine | null>(null), token = useRef(0);
  const [center, setCenter] = useState(initialCenter), [estimate, setEstimate] = useState<FoldEstimate | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    const worker = new Engine(() => setReady(true), message => { setError(message); setBusy(false); setReady(false); });
    engine.current = worker;
    return () => { token.current++; worker.stop(); };
  }, []);
  function changeCenter(value: number, automatic = false) {
    if (!Number.isFinite(value) || value < 1 || value > counts.length || !Number.isInteger(value * 2)) {
      setError('Choose an integer or half-integer fold center inside the data (1-based).'); return;
    }
    try { onApply(value, automatic); setCenter(value); setError(''); }
    catch (e) { setError(String(e)); }
  }
  async function find(apply = true) {
    if (!ready || busy || !engine.current) return;
    const id = ++token.current; setBusy(true); setError('');
    try {
      const result = await estimateFoldCenter(counts, async p => (await engine.current!.request('fit', p)).result as FitResult);
      if (id !== token.current) return;
      setEstimate(result);
      if (apply) changeCenter(result.center, true);
    } catch (e) { if (id === token.current) setError(String(e)); }
    finally { if (id === token.current) setBusy(false); }
  }
  // Opening the diagnostic computes the scan without changing the sample.
  useEffect(() => { if (ready) void find(false); }, [ready]);
  return <dialog className="folding-dialog" ref={dialog} aria-labelledby="folding-heading" onClose={onClose} onKeyDown={e => e.stopPropagation()}>
    <div className="calibration-heading"><h2 id="folding-heading">Folding alignment</h2><form method="dialog"><button aria-label="Close folding alignment">×</button></form></div>
    <div className="folding-dialog-controls"><label>Fold center<Numeric label="Inspected fold center" value={center} disabled={busy} onChange={v => changeCenter(v!)}/></label><button disabled={!ready || busy} onClick={() => void find()}>Find automatically</button><span>{counts.length} loaded points → {Math.floor(counts.length / 2)} folded points</span>{busy && <span role="status">Finding fold center…</span>}{error && <span role="alert">{error}</span>}</div>
    <FoldingDiagnostics counts={counts} center={center} estimate={estimate} disabled={busy} onCenter={value => changeCenter(value)}/>
    <div className="calibration-footer"><p>Center changes apply immediately. Undo restores the previous folding and fit after closing this dialog.</p><button onClick={() => dialog.current?.close()}>Done</button></div>
  </dialog>;
}
