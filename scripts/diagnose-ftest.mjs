// Replay frozen-reference simulations with identical observations AND starts.
// This is an untimed solver diagnostic, independent of end-to-end RNG drift.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeFixture} from '../tests/native-transport.ts';
import {NativeSession} from '../src/native-session.ts';
import {fitMultiStartAsync} from '../src/multistart.mjs';
import {comparisonGenerator,fitComparisonSimulationAsync,completeComparison} from '../src/comparison.ts';
const args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const input=opt('--input','validation-data/performance/ftest-pilot.json');
const data=JSON.parse(readFileSync(input)),fixture=new NativeFixture(),session=new NativeSession(fixture.transport);
const report={date:new Date().toISOString(),input,hashes:Object.fromEntries([input,'scripts/diagnose-ftest.mjs','rust-core/target/release/examples/native_fixture'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),runs:[]};
const output=opt('--output','validation-data/performance/ftest-same-data.json');
try {
  for(const row of data.runs.filter(r=>r.workers===1&&r.id.includes('nonlinear')&&r.id.includes(opt('--case',''))&&!r.id.includes(opt('--exclude','transmission')))) {
    let commonDataHash;
    for(const mode of ['default','joint','numerical']) {
      const a=row.reference,prepared={options:a.options,simpler:structuredClone(a.simpler),larger:structuredClone(a.larger),improvement:a.improvement,noiseStd:a.noiseStd,fitAttempts:a.fitAttempts.filter(f=>f.stage.startsWith('Observed'))};
      for(const f of [prepared.simpler,prepared.larger]) {
        if(mode!=='default')f.project.thin_solver='joint';
        if(mode==='numerical')f.project.derivative_method='numerical';
      }
      const fit=async(p,algorithm='trf')=>fitMultiStartAsync(p,q=>session.fit(q,algorithm,undefined,{derivativeWorkers:1}),q=>session.evaluate(q),undefined,q=>session.finalize(q,{derivativeWorkers:1}));
      const next=comparisonGenerator(prepared),outcomes=[],dataHash=createHash('sha256');
      for(let job=next();job;job=next()) {
        dataHash.update(JSON.stringify(job));
        outcomes.push(await fitComparisonSimulationAsync(prepared,job.index,job.y,fit));
      }
      const simulated_data_sha256=dataHash.digest('hex');
      if(commonDataHash)assert.equal(simulated_data_sha256,commonDataHash);else commonDataHash=simulated_data_sha256;
      const result=completeComparison(prepared,outcomes),deltas=[];
      for(let i=0;i<outcomes.length;i++)for(const model of ['simpler','larger']) {
        const x=a.diagnostics[i][model],y=result.diagnostics[i][model];
        deltas.push({simulation:i,model,reference:x.objective,optimized:y.objective,delta:y.objective-x.objective,rank:[x.rank,y.rank]});
      }
      const worse=deltas.filter(v=>v.delta>Math.max(1e-7,1e-8*v.reference)),better=deltas.filter(v=>v.delta < -Math.max(1e-7,1e-8*v.reference));
      const r={id:row.id,mode,observations_and_starts_identical:true,simulated_data_sha256,p_values:[a.pValue,result.pValue],exceedances:[a.exceedances,result.exceedances],worse_minima:worse.length,better_minima:better.length,max_worse_delta:Math.max(0,...deltas.map(v=>v.delta)),deltas,result};
      report.runs.push(r);writeFileSync(output,JSON.stringify(report,null,2)+'\n');
      console.log(`${r.id} ${mode}: worse=${worse.length} better=${better.length}, p=${r.p_values.join('/')}`);
      assert.equal(outcomes.length,a.options.simulations);
    }
  }
} finally {session.stop();await fixture.close();}
