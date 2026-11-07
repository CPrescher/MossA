import {HeaderOptions} from './HeaderOptions';
import {FileActionIcon} from './FileActionIcon';

export function ExportOptions({context,canExport,canExportTable,unavailableReason,onData,onFigure,onTable,onReport}:{context:string;canExport:boolean;canExportTable:boolean;unavailableReason?:string;onData:()=>void;onFigure:()=>void;onTable:()=>void;onReport:()=>void}) {
 return <HeaderOptions label="Export" title="Export data, parameter tables, figures, and fit reports" className="header-export-menu" buttonContent={<><FileActionIcon action="data"/><span>Export</span><span aria-hidden="true">▾</span></>}>
  <div className="export-panel-heading"><h2>Export</h2><p title={context}>{context}</p></div>
  <div className="export-action"><button disabled={!canExport} onClick={onData}><FileActionIcon action="data"/><span>Spectrum data</span><small>CSV</small></button><p>Velocity, observed data, model, residuals, and background.</p></div>
  <div className="export-action"><button disabled={!canExportTable} onClick={onTable}><FileActionIcon action="data"/><span>Parameter table</span><small>CSV</small></button><p>{canExportTable?'Fitted values, std, links, and intensity fractions.':unavailableReason||'Fit the model to export its values and std.'}</p></div>
  <div className="export-action"><button disabled={!canExport} onClick={onFigure}><FileActionIcon action="graph"/><span>Figure</span><small>SVG / PNG / EPS / PDF</small></button><p>Preview and customize a figure for sharing.</p></div>
  <div className="export-action"><button disabled={!canExportTable||!canExport} onClick={onReport}><FileActionIcon action="graph"/><span>Fit report</span><small>PDF</small></button><p>{canExportTable?'Graph above a color-matched parameter table, with fit details and warnings.':unavailableReason||'Fit the model to export a report with values and std.'}</p></div>
  {!canExport&&<p className="export-availability">{unavailableReason||'The spectrum is not ready to export.'}</p>}
 </HeaderOptions>;
}
