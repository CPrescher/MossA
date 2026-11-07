export function SidebarIcon({ side, expanded }: { side: 'left' | 'right'; expanded: boolean }) {
  return <svg className="sidebar-toggle-icon" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <g transform={side === 'right' ? 'translate(20 0) scale(-1 1)' : undefined}>
      <rect x="2.5" y="3" width="15" height="14" rx="1.5"/>
      <path d="M7 3v14"/>
      <path d={expanded ? 'm14 7-3 3 3 3' : 'm10 7 3 3-3 3'}/>
    </g>
  </svg>;
}
