#!/usr/bin/env node
// Dependency-free localhost server for the prebuilt prototype.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.MOSSA_PORT || 4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache',
      'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'});
    res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`MossA: http://127.0.0.1:${port}\nAll fitting runs locally. Press Ctrl+C to stop.`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
