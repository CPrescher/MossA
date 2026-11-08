import { useState } from 'react';
import { applyTextSize, readTextSize, textSizeStorageKey, type TextSize } from './appearance';

export function TextSizeControl() {
  const [size, setSize] = useState(readTextSize);
  return <label className="text-size-control" title="Adjust interface text size; saved on this device">
    <span aria-hidden="true">Aa</span>
    <select aria-label="Interface text size" value={size} onChange={event => {
      const next = event.target.value as TextSize;
      setSize(next);
      applyTextSize(next);
      try { window.localStorage.setItem(textSizeStorageKey, next); } catch { /* Keep the choice for this visit. */ }
    }}>
      <option value="compact">Compact</option>
      <option value="comfortable">Comfortable</option>
      <option value="large">Large</option>
      <option value="extra-large">Extra large</option>
    </select>
  </label>;
}
