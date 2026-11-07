export function HistoryIcon({ direction }: { direction: 'undo' | 'redo' }) {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g transform={direction === 'redo' ? 'translate(24 0) scale(-1 1)' : undefined}>
      <path d="m9 4-5 5 5 5"/>
      <path d="M4 9h10a6 6 0 0 1 6 6v2"/>
    </g>
  </svg>;
}
