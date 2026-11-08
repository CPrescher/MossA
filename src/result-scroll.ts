/** Keep the selected row below the sticky header without moving numeric columns. */
export function revealSelectedResult(table: HTMLTableElement | null) {
  const row=table?.querySelector<HTMLTableRowElement>('.selected-row');
  const scroller=table?.closest<HTMLElement>('.table-scroll');
  if(!row||!scroller)return;
  const viewport=scroller.getBoundingClientRect(),bounds=row.getBoundingClientRect();
  if(scroller.clientHeight<=0)return;
  const viewportTop=viewport.top+scroller.clientTop,bottom=viewportTop+scroller.clientHeight;
  const top=viewportTop+(table?.tHead?.getBoundingClientRect().height??0);
  if(bounds.top<top)scroller.scrollTop-=top-bounds.top;
  else if(bounds.bottom>bottom)scroller.scrollTop+=bounds.bottom-bottom;
}
