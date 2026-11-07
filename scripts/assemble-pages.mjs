// Publish one Pages artifact: the app at /MossA/, the manual at /MossA/manual/.
// Each builder cleans only its own output; copying happens after both succeed.
import { cp, rm, stat } from 'node:fs/promises';

const app = new URL('../dist/', import.meta.url);
const manual = new URL('../manual/dist/', import.meta.url);
await Promise.all([stat(new URL('index.html', app)), stat(new URL('index.html', manual))]);
const target = new URL('manual/', app);
await rm(target, { recursive: true, force: true });
await cp(manual, target, { recursive: true });
console.log('Pages artifact ready: dist/ (app) and dist/manual/ (manual).');
