import type { ImportInfo } from './io.mjs';

export function ImportDetails({ info }: { info?: ImportInfo }) {
  if (!info) return null;
  return <details className="import-details calibration-note"><summary>Import details</summary>
    <p>{info.format === 'sms-five-column' ? 'SMS reference: column 1 is velocity; column 2 is total counts. Difference and directional counts are not fitted.' : `SPEC MCA: ${info.channels} raw count channels in acquisition order. Header calibration is not a velocity scale.`}</p>
    {info.filename && <p>{info.filename}</p>}
    {info.headers && <pre>{info.headers.join('\n')}</pre>}
  </details>;
}
