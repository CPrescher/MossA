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
  async function find() {
    if (!ready || busy || !engine.current) return;
    const id = ++token.current; setBusy(true); setError('');
    try {
      const result = await estimateFoldCenter(counts, async p => (await engine.current!.request('fit', p)).result as FitResult);
      if (id !== token.current) return;
      setEstimate(result); setCenter(result.center);
    } catch (e) { if (id === token.current) setError(String(e)); }
    finally { if (id === token.current) setBusy(false); }
  }
  useEffect(() => { if (ready) void find(); }, [ready]);
  const valid = Number.isFinite(center) && center >= 1 && center <= counts.length && Number.isInteger(center * 2);
  return <dialog className="folding-dialog" ref={dialog} aria-labelledby="folding-heading" onClose={onClose} onKeyDown={e => e.stopPropagation()}>
    <div className="calibration-heading"><h2 id="folding-heading">Folding alignment</h2><form method="dialog"><button aria-label="Close folding alignment">×</button></form></div>
    <div className="folding-dialog-controls"><label>Fold center<Numeric label="Inspected fold center" value={center} disabled={busy} onChange={v => { setCenter(v!); setError(''); }}/></label><button disabled={!ready || busy} onClick={() => void find()}>Find automatically</button><span>{counts.length} loaded points → {Math.floor(counts.length / 2)} folded points</span>{busy && <span role="status">Finding fold center…</span>}{error && <span role="alert">{error}</span>}</div>
    <FoldingDiagnostics counts={counts} center={center} estimate={estimate} disabled={busy} onCenter={value => { setCenter(value); setError(''); }}/>
    <div className="calibration-footer"><p>Inspect the paired halves before applying. Apply folding is one Undo/Redo step.</p><button disabled={!valid || busy} onClick={() => { if (dialog.current?.querySelector('input[aria-invalid="true"]')) { setError('Correct the highlighted input before applying.'); return; } try { onApply(center, center === estimate?.center); dialog.current?.close(); } catch (e) { setError(String(e)); } }}>Apply folding</button></div>
  </dialog>;
}
