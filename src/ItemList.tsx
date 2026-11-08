import type { ComponentProps, ReactNode } from 'react';

export function ItemList({ className = '', ...props }: ComponentProps<'div'>) {
  return <div {...props} className={`item-list ${className}`}/>;
}

export function ItemListNumber({ value }: { value: number }) {
  return <span className="item-number">{value}</span>;
}

export function ItemListName({ children, keepEnd = false }: { children: ReactNode; keepEnd?: boolean }) {
  return <strong className={`item-name${keepEnd ? ' item-name-tail' : ''}`}>
    {keepEnd ? <bdi dir="auto">{children}</bdi> : children}
  </strong>;
}

export function ItemListRow({ className = '', selected, actions, children, ...props }: ComponentProps<'div'> & {
  selected: boolean; actions: ReactNode;
}) {
  return <div {...props} className={`item-list-row ${className}`} data-selected={selected}>
    {children}{actions}
  </div>;
}
