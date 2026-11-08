import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { newNuclearConstants } from './nuclear-constants.mjs';
import { displayNumber } from './Numeric';
import { CalibrationPresetEditor, type PresetEditorState } from './CalibrationPresetEditor';
import { controlsFromPreset, makeCalibrationPreset, sameCalibration, velocityControls, type CalibrationPreset, type CalibrationPresets } from './calibration-presets';
import type { Calibration } from './session';

type Props = CalibrationPresets & {
  cal: Calibration; raw: number[] | null; hasSpectrum?: boolean; disabled?: boolean;
  onChange: (settings: CalibrationPresets) => void;
  onApply: (cal: Calibration) => void;
  onInspectFolding: () => void;
  onDialogChange: (open: boolean) => void;
};

export function CalibrationPresetsPanel({ cal, raw, hasSpectrum = true, disabled = false, calibrationPresets: presets, importCalibrationPresetId: defaultId, onChange, onApply, onInspectFolding, onDialogChange }: Props) {
  const match = () => presets.find(p => p.id === cal.preset?.id) ?? presets.find(p => sameCalibration(p.cal, cal));
  const [selectedId, setSelectedId] = useState(match()?.id ?? (raw ? '' : defaultId));
  const [menu, setMenu] = useState(false), [managing, setManaging] = useState(false);
  const [editor, setEditor] = useState<PresetEditorState | null>(null);
  const [error, setError] = useState(''), [savedMessage, setSavedMessage] = useState('');
  const add = useRef<HTMLDivElement>(null), addButton = useRef<HTMLButtonElement>(null), firstChoice = useRef<HTMLButtonElement>(null);
  const addMenu = useRef<HTMLDivElement>(null), manager = useRef<HTMLDialogElement>(null);
  const dialogChange = useRef(onDialogChange); dialogChange.current = onDialogChange;
  const selected = presets.find(p => p.id === selectedId);
  const importPreset = presets.find(p => p.id === defaultId)!;
  const preview = selected ? controlsFromPreset(selected) : cal;
  if (raw && preview.autoFold !== false && selected) preview.center = cal.center;
  const changed = !sameCalibration(preview, cal, false);
  const calibrationKey = JSON.stringify(cal);
  useEffect(() => { setSelectedId(match()?.id ?? (raw ? '' : defaultId)); setError(''); setSavedMessage(''); }, [calibrationKey]);
  useEffect(() => { if (selectedId && !selected) setSelectedId(defaultId); }, [presets, defaultId, selectedId]);
  // Closing the nested reference fitter leaves the preset editor modal.
  useEffect(() => { dialogChange.current(!!editor || managing); }, [!!editor, managing]);
  useEffect(() => () => dialogChange.current(false), []);
  useEffect(() => {
    if (!menu) return;
    firstChoice.current?.focus();
    const outside = (e: PointerEvent) => { if (!add.current?.contains(e.target as Node) && !addMenu.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menu]);
  useEffect(() => { if (disabled) setMenu(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!menu || !addMenu.current || !addButton.current) return;
    const place = () => {
      const anchor = addButton.current!.getBoundingClientRect(), popup = addMenu.current!;
      popup.style.left = `${Math.max(8, Math.min(anchor.right - popup.offsetWidth, window.innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${anchor.bottom + 6 + popup.offsetHeight <= window.innerHeight - 8 ? anchor.bottom + 6 : Math.max(8, anchor.top - popup.offsetHeight - 6)}px`;
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [menu]);
  useEffect(() => { if (managing) manager.current?.showModal(); }, [managing]);
  const choose = (preset: CalibrationPreset) => { setSelectedId(preset.id); setError(''); setSavedMessage(''); };
  const openEditor = (preset: CalibrationPreset | null, mode: 'edit' | 'manual' | 'reference' | 'copy') => {
    const controls = velocityControls(preset?.cal ?? preview);
    if (mode === 'manual') { delete controls.reference; controls.nuclear_constants = newNuclearConstants(); }
    setEditor({ preset: mode === 'edit' ? preset : null, cal: controls, startReference: mode === 'reference' });
    setMenu(false); setSavedMessage(''); setError('');
  };
  const save = (name: string, controls: Calibration) => {
    if (!editor) return;
    const preset = makeCalibrationPreset(name, controls);
    if (presets.some(p => p.id !== editor.preset?.id && p.name.toLowerCase() === preset.name.toLowerCase())) throw new Error('Choose a name that is not already in use.');
    if (!editor.preset && presets.length >= 100) throw new Error('A project supports up to 100 calibration presets.');
    if (editor.preset) preset.id = editor.preset.id;
    onChange({ calibrationPresets: editor.preset ? presets.map(p => p.id === preset.id ? preset : p) : [...presets, preset], importCalibrationPresetId: defaultId });
    setSelectedId(preset.id); setEditor(null); setError('');
    setSavedMessage('Preset saved. Existing spectra retain their calibration.');
  };
  return <section className="option-section calibration-presets">
    <h3>Folding &amp; calibration</h3>
    <p className="calibration-applied">{!hasSpectrum ? 'No spectrum loaded' : raw ? `Applied to spectrum: ${cal.preset?.name ?? match()?.name ?? 'Custom calibration'} · max. ${displayNumber(cal.max)} mm/s` : 'Spectrum uses velocity values from file'}</p>
    <div className="calibration-preset-picker">
      <label className="stack-label">Preset<select aria-label="Calibration preset" value={selectedId} onChange={e => { const preset = presets.find(p => p.id === e.target.value); if (preset) choose(preset); }}>
        {selectedId === '' && <option value="">Custom settings</option>}
        {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <div className="calibration-preset-add" ref={add} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); addButton.current?.focus(); } }}>
        <button ref={addButton} className="calibration-preset-icon" aria-label="Add calibration preset" title="Create a velocity-calibration preset: define manually, fit an α-Fe reference, or copy current settings" aria-expanded={menu} aria-controls="calibration-preset-add-menu" onClick={() => setMenu(v => !v)}>＋</button>
        {menu && !disabled && createPortal(<div className="calibration-preset-menu" id="calibration-preset-add-menu" ref={addMenu} role="dialog" aria-label="New calibration preset" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); addButton.current?.focus(); } }}>
          <button ref={firstChoice} onClick={() => openEditor(null, 'manual')}><strong>Define manually…</strong><span>Enter a velocity scale and folding settings</span></button>
          <button onClick={() => openEditor(null, 'reference')}><strong>From reference file…</strong><span>Fit an α-Fe standard to determine the scale</span></button>
          <button onClick={() => openEditor(null, 'copy')}><strong>Save current settings…</strong><span>Keep these values as a separate preset</span></button>
        </div>, document.body)}
      </div>
      <button className="calibration-preset-icon" aria-label="Manage calibration presets" title="Open Calibration presets to rename, Edit, or Remove presets" onClick={() => setManaging(true)}>⋯</button>
    </div>
    <label className="check-label calibration-import-default" title={selectedId === defaultId ? 'Already the default for new raw-count imports' : 'Use this preset for future raw-count imports'}><input type="checkbox" aria-label="Use preset for new imports" checked={selectedId === defaultId} disabled={selectedId === defaultId || !selected} onChange={() => { if (selected) onChange({ calibrationPresets: presets, importCalibrationPresetId: selected.id }); }}/>Use for new imports</label>
    <div className="calibration-preset-summary"><div><span>Max. velocity</span><strong>{displayNumber(preview.max)} <small>mm/s</small></strong></div><div><span>Standard CS</span><strong>{displayNumber(preview.shift)} <small>mm/s</small></strong></div></div>
    <p className="calibration-preset-reference" title={preview.reference?.name}>{preview.reference ? `α-Fe · ${preview.reference.name}` : 'Manually defined scale'}</p>
    <button className="full-width calibration-preset-edit" title={selected ? 'Edit the preset’s saved velocity and folding settings; apply separately to update this spectrum' : 'Save the current velocity and folding settings as a new preset'} onClick={() => openEditor(selected ?? null, selected ? 'edit' : 'copy')}>{selected ? 'Edit preset…' : 'Save as preset…'}</button>
    {savedMessage && <p className="calibration-edit-status" aria-live="polite">{savedMessage}</p>}
    {error && <p className="calibration-error" role="alert">{error}</p>}
    <button className="full-width calibration-preset-apply" title={!hasSpectrum ? 'Import a raw-count spectrum before applying a preset' : !raw ? 'This file supplies its velocity axis; raw-channel calibration does not replace it' : !changed ? 'The selected velocity and folding settings already match this spectrum' : 'Apply the selected velocity and folding settings to this spectrum and all its models'} disabled={!raw || !changed} onClick={() => {
      try { makeCalibrationPreset('Calibration', preview); onApply(preview); setError(''); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }}>{!hasSpectrum ? 'Apply after importing a spectrum' : !raw ? 'File velocity axis retained' : !changed ? 'Applied to spectrum' : 'Apply to this spectrum'}</button>
    {raw && cal.folding && <button className="full-width calibration-inspect-current" onClick={onInspectFolding}>Inspect this spectrum’s folding…</button>}
    <p className="calibration-import-note" aria-live="polite">New raw-count imports use <strong>{importPreset.name}</strong>.</p>
    {editor && createPortal(<CalibrationPresetEditor initial={editor} raw={raw} onSave={save} onCancel={() => setEditor(null)}/>, document.body)}
    {managing && <dialog className="calibration-preset-manager" ref={manager} aria-labelledby="calibration-preset-manager-title" onClose={() => setManaging(false)} onKeyDown={e => e.stopPropagation()}>
      <div className="calibration-heading"><h2 id="calibration-preset-manager-title">Calibration presets</h2><form method="dialog"><button aria-label="Close calibration presets">×</button></form></div>
      <div className="calibration-preset-list">{presets.map(p => <PresetRow key={p.id} preset={p} isDefault={p.id === defaultId} canRemove={presets.length > 1} onEdit={() => { choose(p); manager.current?.close(); openEditor(p, 'edit'); }} onRename={name => {
        if (!name.trim() || presets.some(other => other.id !== p.id && other.name.toLowerCase() === name.trim().toLowerCase())) return;
        onChange({ calibrationPresets: presets.map(other => other.id === p.id ? { ...p, name: name.trim() } : other), importCalibrationPresetId: defaultId });
      }} onRemove={() => {
        const remaining = presets.filter(other => other.id !== p.id);
        onChange({ calibrationPresets: remaining, importCalibrationPresetId: p.id === defaultId ? remaining[0].id : defaultId });
      }}/>)}</div>
      <p className="calibration-import-note">Editing, renaming, or removing a preset preserves calibrations already applied to spectra.</p>
    </dialog>}
  </section>;
}
function PresetRow({ preset, isDefault, canRemove, onEdit, onRename, onRemove }: { preset: CalibrationPreset; isDefault: boolean; canRemove: boolean; onEdit: () => void; onRename: (name: string) => void; onRemove: () => void }) {
  const [name, setName] = useState(preset.name);
  useEffect(() => setName(preset.name), [preset.name]);
  return <div className="calibration-preset-row"><div><input aria-label={`Rename ${preset.name}`} value={name} maxLength={160} onChange={e => setName(e.target.value)} onBlur={() => { onRename(name); setName(preset.name); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(preset.name); e.currentTarget.blur(); } }}/><span>{displayNumber(preset.cal.max)} mm/s{isDefault ? ' · new imports' : ''}</span></div><button aria-label={`Edit ${preset.name}`} onClick={onEdit}>Edit</button><button aria-label={`Remove ${preset.name}`} disabled={!canRemove} onClick={onRemove}>Remove</button></div>;
}
