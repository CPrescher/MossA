import type { FitFinalization, FitResult, FitState, FitTrial, LocalFitResult, Parameter, Project } from './types';
import type { NativeSession } from './native-session';

type InternalProject = Project & { search_defer_uncertainties?: boolean; search_probe?: unknown };
type Model = {id:number;project:Project};
type Command = {id:number;model:number;dataset:number;operation:string;prefit?:string;values:number[];max_iterations:number;derivative_method:Project['derivative_method']|null;thin_solver:Project['thin_solver']|null;search_defer_uncertainties:boolean;search_probe:unknown;state?:FitState};
export type ComparisonBatchRequest = {models:Model[];datasets:{id:number;y:number[]}[];release:number[];operations:Command[];reuse_preparation?:boolean};
type Reply = {kind:'valid'} | {kind:'prefitted';fit:Reply|null;error:string|null} | {kind:'trial';values:number[];objective:number;free_parameters:number;state:FitState} | {kind:'complete';values:number[];fit:Omit<FitResult,'project'>};
export type ComparisonBatchResponse = {models:Model[];results:{id:number;result:Reply|null;error:string|null}[]};
type Pending = {command:Command;project:InternalProject;data:number[];resolve:(r:any)=>void;reject:(e:Error)=>void};

function parameters(p:Project):Parameter[] {
  const list=[...p.background];
  for(const site of p.sites) {
    list.push(...Object.keys(site.params).sort().map(k=>site.params[k]));
    if(site.xvbf) {
      list.push(site.xvbf.delta);
      for(const c of [...site.xvbf.cs,...site.xvbf.qs])list.push(c.center,c.width,c.weight);
    }
  }
  return list;
}
function metadata(p:Parameter) {return [p.fit,p.min??null,p.max??null,p.link?[p.link.target,p.link.factor]:null];}
function signature(p:Project) {
  return JSON.stringify([p.mode,p.weighting,p.source_fwhm,p.source_squared,p.source_gaussians??null,p.nuclear_constants??null,p.background.map(metadata),
    p.sites.map(s=>[s.name,s.color??null,s.kind,s.profile,Object.keys(s.params).sort().map(k=>[k,metadata(s.params[k])]),
      s.xvbf?[metadata(s.xvbf.delta),...[s.xvbf.cs,s.xvbf.qs].map(axis=>axis.map(c=>[metadata(c.center),metadata(c.width),metadata(c.weight)]))]:null])]);
}

/** Compact packets under the existing JS search/recovery state machines. */
export class NativeComparisonBatch {
  private models=new Map<string,Model>();
  private byId=new Map<number,Model>();
  private readyModels=new Set<number>();
  private readyDatasets=new Set<number>();
  private newModels:Model[]=[];
  private datasets:{id:number;y:number[]}[]=[];
  private release:number[]=[];
  private queue:Pending[]=[];
  private scheduled=false;
  private running=false;
  private sequence=0;
  private datasetSequence=0;
  private failed:Error|null=null;
  private grid:number[]|null=null;
  constructor(private session:NativeSession,private reusePreparation=true) {}
  lane(y:number[]) {
    // Match JSON transport's normalization of signed zero in input spectra.
    y=y.map(v=>v===0?0:v);
    const dataset=++this.datasetSequence;let registered=false,closed=false;
    let cached:{key:string;result:LocalFitResult|Error}|null=null;
    const fitKey=(p:InternalProject,algorithm:string)=>JSON.stringify([signature(p),parameters(p).map(v=>v.value),p.max_iterations,p.derivative_method??null,p.thin_solver??null,p.search_probe??null,!!p.search_defer_uncertainties,algorithm]);
    const request=(operation:string,p:InternalProject,state?:FitState,prefit?:string)=> {
      this.session.check();if(this.failed)return Promise.reject(this.failed);
      if(closed||p.spectrum.y.length!==y.length||p.spectrum.y.some((v,i)=>v!==y[i]))return Promise.reject(new Error('Comparison spectrum changed within a simulation.'));
      if(!this.grid)this.grid=[...p.spectrum.x];
      if(p.spectrum.x.length!==this.grid.length||p.spectrum.x.some((v,i)=>v!==this.grid![i]))return Promise.reject(new Error('Comparison velocity grid changed within an analysis.'));
      const inputValues=parameters(p).map(v=>v.value);
      if(inputValues.some(v=>!Number.isFinite(v)))return Promise.reject(new Error('Invalid comparison parameter values.'));
      if(!registered){this.datasets.push({id:dataset,y});registered=true;}
      const key=signature(p);let model=this.models.get(key);
      if(!model) {
        const template=structuredClone(p);
        template.spectrum.y=[];template.max_iterations=1;
        delete template.search_starts;delete template.search_strategy;delete template.search_probe;delete template.search_defer_uncertainties;
        delete template.derivative_method;delete template.thin_solver;
        for(const parameter of parameters(template))parameter.value=0;
        model={id:this.models.size+1,project:template};this.models.set(key,model);this.byId.set(model.id,model);this.newModels.push(model);
      }
      const command:Command={id:++this.sequence,model:model.id,dataset,operation,...(prefit?{prefit}:{}),values:inputValues,max_iterations:p.max_iterations,
        derivative_method:p.derivative_method??null,thin_solver:p.thin_solver??null,search_defer_uncertainties:!!p.search_defer_uncertainties,search_probe:p.search_probe??null,...(state?{state}:{})};
      return new Promise<any>((resolve,reject)=>{this.queue.push({command,project:p,data:y,resolve,reject});this.schedule();});
    };
    return {
      validate:async(p:Project,algorithm:'trf'|'bounded-lm'='trf')=>{
        const trial={...p,search_defer_uncertainties:true};
        const result=await request('evaluate',trial,undefined,algorithm==='bounded-lm'?'fit-recovery':'fit');
        if(!result)throw new Error('Missing native prefitted trial.');
        cached={key:fitKey(trial,algorithm),result};
      },
      fit:(p:Project,algorithm:'trf'|'bounded-lm'='trf'):Promise<LocalFitResult>=>{
        this.session.check();
        if(closed||p.spectrum.y.length!==y.length||p.spectrum.y.some((v,i)=>v!==y[i]))return Promise.reject(new Error('Comparison spectrum changed within a simulation.'));
        if(!this.grid||p.spectrum.x.length!==this.grid.length||p.spectrum.x.some((v,i)=>v!==this.grid![i]))return Promise.reject(new Error('Comparison velocity grid changed within an analysis.'));
        if(cached) {
          const saved=cached;cached=null;
          if(saved.key!==fitKey(p,algorithm))return Promise.reject(new Error('Native prefitted candidate changed before fitting.'));
          return saved.result instanceof Error?Promise.reject(saved.result):Promise.resolve(saved.result);
        }
        return request(algorithm==='bounded-lm'?'fit-recovery':'fit',p);
      },
      finalize:(f:FitFinalization)=>request('finalize-fit',f.project,f.state) as Promise<FitResult>,
      close:()=>{if(!closed){closed=true;if(registered){this.release.push(dataset);this.schedule();}}},
    };
  }
  private schedule() {
    if(this.scheduled||this.running)return;
    this.scheduled=true;queueMicrotask(()=>{this.scheduled=false;void this.flush();});
  }
  private async flush() {
    if(this.running||(!this.queue.length&&!this.release.length))return;
    this.running=true;
    try {
      // Register before dispatch so separate native jobs may complete in any
      // order without racing a new model/spectrum into existence.
      if(this.newModels.length||this.datasets.length||this.release.length) {
        const models=this.newModels.splice(0),datasets=this.datasets.splice(0),release=this.release.splice(0);
        const response=await this.session.comparisonBatch({models,datasets,release,operations:[]});
        if(response.models.length!==models.length||response.results.length)throw new Error('Incomplete comparison registration.');
        for(const m of response.models) {
          const owner=this.byId.get(m.id);if(!owner)throw new Error('Unexpected registered comparison model.');owner.project=m.project;
          this.readyModels.add(m.id);
        }
        for(const d of datasets)this.readyDatasets.add(d.id);
        for(const id of release)this.readyDatasets.delete(id);
      }
      const pending:Pending[]=[],fast:Pending[]=[];
      this.queue=this.queue.filter(p=>{
        if(pending.length<16&&this.readyModels.has(p.command.model)&&this.readyDatasets.has(p.command.dataset)){pending.push(p);return false;}
        return true;
      });
      // Expensive fits are independent jobs: a cheap worker must not wait for
      // another simulation's slow fit. Validation/finalization can coalesce.
      for(const p of pending) {
        if(p.command.prefit||p.command.operation==='fit'||p.command.operation==='fit-recovery')void this.dispatch([p]);
        else fast.push(p);
      }
      if(fast.length)void this.dispatch(fast);
    } catch(error) {this.fail(error,this.queue.splice(0));}
    finally {this.running=false;if(!this.failed&&(this.queue.length||this.release.length))this.schedule();}
  }
  private fail(error:unknown,pending:Pending[]) {
    this.failed=error instanceof Error?error:new Error(String(error));
    for(const p of [...pending,...this.queue.splice(0)])p.reject(this.failed);
  }
  private async dispatch(pending:Pending[]) {
    try {
      this.session.check();const response=await this.session.comparisonBatch({models:[],datasets:[],release:[],operations:pending.map(p=>p.command),reuse_preparation:this.reusePreparation});
      if(response.results.length!==pending.length)throw new Error('Incomplete native comparison batch.');
      for(let i=0;i<pending.length;i++) {
        const p=pending[i],packet=response.results[i];
        if(packet.id!==p.command.id)throw new Error('Invalid native comparison response order.');
        if(packet.error){p.reject(new Error(packet.error));continue;}
        if(!packet.result)throw new Error('Missing native comparison result.');
        let wire=packet.result;
        if(wire.kind==='prefitted') {
          if(wire.error){p.resolve(new Error(wire.error));continue;}
          if(!wire.fit||wire.fit.kind==='prefitted')throw new Error('Invalid native prefitted result.');
          wire=wire.fit;
        }
        if(wire.kind==='valid'){p.resolve(undefined);continue;}
        const template=this.byId.get(p.command.model)!.project;
        const {spectrum,...body}=template;
        const project={...structuredClone(body),spectrum:{x:spectrum.x,y:p.data}} as InternalProject;
        project.max_iterations=p.command.max_iterations;
        if(p.command.derivative_method)project.derivative_method=p.command.derivative_method;else delete project.derivative_method;
        if(p.command.thin_solver)project.thin_solver=p.command.thin_solver;else delete project.thin_solver;
        const slots=parameters(project);
        if(slots.length!==wire.values.length)throw new Error('Invalid native comparison parameter layout.');
        slots.forEach((slot,j)=>{slot.value=wire.values[j];});
        if(wire.kind==='complete')p.resolve({...wire.fit,project});
        else {
          // Search uses only the fitted project/objective until finalization.
          // Full curves, rank, stationarity and uncertainties are computed for
          // the exact winning coordinates by the unchanged finalizer.
          const trial:FitTrial={project,evaluation:{parameters:{},y:[],background:[],components:[],residual:[],sse:0,objective:wire.objective},
            iterations:wire.state.iterations,converged:wire.state.converged,termination:wire.state.termination,free_parameters:wire.free_parameters,
            finalization:{project:p.project,state:wire.state}};
          p.resolve(trial);
        }
      }
    } catch(error) {this.fail(error,pending);}
  }
}
