export function FileActionIcon({ action }: { action: 'new' | 'add' | 'open' | 'save' | 'save-as' | 'data' | 'graph' | 'example' }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {action === 'new' && <><path d="M14 3H4v18h16V9M14 3v6h6M8 14h8m-4-4v8"/></>}
    {action === 'add' && <><path d="M12 16V3m-4 4 4-4 4 4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></>}
    {action === 'open' && <><path d="M3 8V5a1 1 0 0 1 1-1h6l2 3h7a1 1 0 0 1 1 1v2M3 8h7l2 3h9l-3 9H3Z"/></>}
    {action === 'save' && <><path d="M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8"/></>}
    {action === 'save-as' && <><path d="M4 3h13l4 4v4M7 3v6h10V3M3 3v18h7M7 21v-8h4M14 18h8m-3-3 3 3-3 3"/></>}
    {action === 'data' && <><path d="M14 3H4v18h16V9M14 3v6h6Zm-7 9h6m-6 4h4m6-4v6m-3-3 3 3 3-3"/></>}
    {action === 'graph' && <><path d="M3 3v18h18M6 14l4-5 4 3 6-8M15 4h5v5"/></>}
    {action === 'example' && <><path d="M9 3h6m-5 0v6L4 19a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2L14 9V3M7 15h10"/><path d="M10 18h.01M14 17h.01"/></>}
  </svg>;
}
