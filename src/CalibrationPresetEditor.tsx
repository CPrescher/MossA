import { useEffect, useRef, useState } from 'react';
import { Numeric } from './Numeric';
import { VelocityCalibrationDialog } from './VelocityCalibration';
import { calibrationFromReference, makeCalibrationPreset, sameCalibration, velocityControls, type CalibrationPreset } from './calibration-presets';
import type { Calibration } from './session';

export type PresetEditorState = { preset: CalibrationPreset | null; cal: Calibration; startReference?: boolean };

export function CalibrationPresetEditor({ initial, raw, onSave, onCancel }: { initial: PresetEditorState; raw: number[] | null; onSave: (name: string, cal: Calibration) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(() => velocityControls(initial.cal));
  const [name, setName] = useState(initial.preset?.name ?? '');
  const [error, setError] = useState(''), [referenceOpen, setReferenceOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const editing = !!initial.preset;
  const modified = !editing || name.trim() !== initial.preset!.name || !sameCalibration(draft, initial.cal, false);
  useEffect(() => {
    dialog.current?.showModal();
    // Mount the fitter after the editor enters the top layer. Closing the
    // fitter then returns to the editor and its unsaved settings.
    if (initial.startReference) setReferenceOpen(true);
  }, []);
  const change = (values: Partial<Calibration>) => {
    setDraft(old => {
      const next = { ...old, ...values };
      if (next.max !== old.max || next.shift !== old.shift || next.sinusoidal !== old.sinusoidal) delete next.reference;
      return next;
    });
    setError('');
  };
  const save = () => {
    try {
      if (dialog.current?.querySelector('input[aria-invalid="true"]')) throw new Error('Correct the highlighted input first.');
      makeCalibrationPreset(name, draft);
      onSave(name, draft);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return <dialog className="calibration-preset-editor" ref={dialog} aria-labelledby="calibration-preset-editor-title" onClose={e => { if (e.target === e.currentTarget) onCancel(); }} onCancel={e => { if (e.target === e.currentTarget) { e.preventDefault(); onCancel(); } }} onKeyDown={e => e.stopPropagation()}>
    <div className="preset-editor-heading"><div><h2 id="calibration-preset-editor-title">{editing ? 'Edit calibration preset' : 'New calibration preset'}</h2><p>{editing ? initial.preset!.name : 'Define a reusable velocity scale and folding setup'}</p></div><button aria-label="Close preset editor" onClick={onCancel}>×</button></div>
    <div className="preset-editor-body">
      <label className="preset-editor-name">Preset name<input autoFocus={!editing} aria-label="Calibration preset name" maxLength={160} value={name} placeholder="e.g., 10 mm/s · room temperature" onChange={e => { setName(e.target.value); setError(''); }}/></label>
      <div className="preset-editor-reference"><div><h3>Reference calibration</h3><p>{draft.reference ? `α-Fe · ${draft.reference.name}` : 'Manually defined scale'}</p></div><button onClick={() => setReferenceOpen(true)}>{editing ? 'Recalibrate from reference…' : 'Calibrate from reference…'}</button></div>
      <fieldset className="preset-editor-section"><legend>Velocity scale</legend><div className="preset-editor-grid">
        <label>Max. velocity (mm/s)<Numeric label="Maximum velocity" value={draft.max} onChange={v => change({ max: v! })}/></label>
        <label>Standard CS (mm/s)<Numeric label="Standard center shift" value={draft.shift} onChange={v => change({ shift: v! })}/></label>
      </div><label className="preset-editor-check"><input type="checkbox" checked={draft.sinusoidal} onChange={e => change({ sinusoidal: e.target.checked })}/>Sinusoidal drive</label></fieldset>
      <fieldset className="preset-editor-section"><legend>Folding</legend>
        <label className="preset-editor-check"><input type="checkbox" checked={draft.folding} onChange={e => change({ folding: e.target.checked })}/>Fold raw channels</label>
        <label className="preset-editor-check"><input type="checkbox" checked={draft.autoFold !== false} disabled={!draft.folding} onChange={e => change({ autoFold: e.target.checked })}/>Find fold center automatically for each import</label>
        <label className="preset-editor-center">Fold center<Numeric label="Fold center" value={draft.center} disabled={!draft.folding} onChange={v => change({ center: v!, autoFold: false })}/><span>1-based channel; integer or half-integer</span></label>
      </fieldset>
      {error && <p className="calibration-error" role="alert">{error}</p>}
    </div>
    <div className="preset-editor-footer"><p aria-live="polite">{editing && modified ? 'Unsaved changes. ' : ''}Saves this preset. Existing spectra keep their calibration.</p><div><button onClick={onCancel}>Cancel</button><button className="calibration-preset-save" title="Save this preset; use Apply to this spectrum separately to recalibrate existing data" disabled={!modified} onClick={save}>{editing ? 'Save changes to preset' : 'Save preset'}</button></div></div>
    {referenceOpen && <VelocityCalibrationDialog cal={draft} raw={raw} purpose={editing ? 'update-preset' : 'preset'} onClose={() => setReferenceOpen(false)} onApply={result => {
      setDraft(calibrationFromReference(draft, result));
      if (!name.trim()) setName(result.reference.name.replace(/\.[^.]+$/, '') || 'Iron reference');
      setError('');
    }}/>}
  </dialog>;
}
