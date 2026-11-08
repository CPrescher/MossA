import { plainScientificLabel } from './plain-label';
import type { Site } from './types';

/** Site context stays visible while the narrow layout shows the options inspector. */
export function SiteOptionsPicker({ sites, selected, onSelect }: { sites:Site[]; selected:number; onSelect?:(index:number)=>void }) {
  return <label className="site-options-picker"><span>Site</span><select aria-label="Editing site" title={sites[selected]?.name} value={selected} disabled={!onSelect} onChange={event=>onSelect?.(Number(event.target.value))}>
    {sites.map((site,index)=><option key={index} value={index}>{index+1} · {plainScientificLabel(site.name)}</option>)}
  </select></label>;
}
