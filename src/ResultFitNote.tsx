import type {FitSummary} from './session';
export function ResultFitNote({result,fitting,onWarnings}:{result:FitSummary|null;fitting:boolean;onWarnings:()=>void}) {
 if(fitting)return <span className="results-note">Fitting · std pending</span>;
 if(!result)return <span className="results-note needs-fit" title="These are current model values. Fit after changing the model or data to estimate std.">Not fitted · fit to estimate std</span>;
 return <><span className="results-note" title="Approximate 1 std; fixed and unavailable values are labeled in each cell.">( ) = 1 std</span>{result.warnings.length>0&&<button className="results-note fit-warning-link" onClick={onWarnings} title="Review the complete fit warnings"><span aria-hidden="true">⚠ </span>{result.rank<result.free_parameters?'std unavailable · rank deficient':`${result.warnings.length} fit warning${result.warnings.length===1?'':'s'}`}</button>}</>;
}
