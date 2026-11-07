export function InspectorSwitch({ selected, onSelect }: { selected:'sites'|'options'|'plot'; onSelect:(value:'sites'|'options'|'plot') => void }) {
  return <nav className="inspector-switch" aria-label="Editing panel">
    <button className="inspector-spectrum-button" type="button" aria-pressed={selected === 'plot'} aria-controls="model-workspace" onClick={() => onSelect('plot')}>Spectrum</button>
    <button type="button" aria-pressed={selected === 'sites'} aria-controls="site-inspector" onClick={() => onSelect('sites')}>Sites</button>
    <button type="button" aria-pressed={selected === 'options'} aria-controls="fitting-options-sidebar" onClick={() => onSelect('options')}>Fitting options</button>
  </nav>;
}
