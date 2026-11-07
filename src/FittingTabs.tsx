const tabs = [
  { id:'Gen', label:'General' },
  { id:'Bnds', label:'Bounds' },
  { id:'xVBF', label:'xVBF' },
  { id:'Opt', label:'Fit options' },
];

export function FittingTabs({ selected, onSelect }: { selected:string; onSelect:(tab:string) => void }) {
  return <div className="tabs" role="tablist" aria-label="Fitting options">{tabs.map((tab, index) =>
    <button id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`} role="tab" aria-selected={selected === tab.id}
      tabIndex={selected === tab.id ? 0 : -1} key={tab.id} className={selected === tab.id ? 'active' : ''}
      onClick={() => onSelect(tab.id)} onKeyDown={event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        onSelect(tabs[next].id);
        document.getElementById(`tab-${tabs[next].id}`)?.focus();
      }}>{tab.label}</button>
  )}</div>;
}
