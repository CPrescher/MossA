import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportFilename,safeFilenamePart} from '../src/export-filename';
test('CSV filenames identify their spectrum/model and cannot introduce path separators',()=>{
 assert.equal(exportFilename('Augite.dat','Two sites','spectrum'),'Augite - Two sites - spectrum.csv');
 assert.equal(exportFilename('Fe²⁺ / sample.csv','Model: 3','parameters'),'Fe²⁺ _ sample - Model_ 3 - parameters.csv');
 assert.equal(exportFilename('','','parameters'),'mossa - parameters.csv');
});
test('long Unicode spectrum and model names remain safe filename components with both scopes retained',()=>{
 const filename=exportFilename('Spectrum '+ 'x'.repeat(250),'Model '+ 'é'.repeat(160),'parameters');
 assert.ok(new TextEncoder().encode(filename).length<=240);assert.match(filename,/^Spectrum /);assert.match(filename,/ - Model .* - parameters\.csv$/);
});

test('figure filename stems handle accepted source extensions and clipped trailing dots',()=>{
 assert.equal(safeFilenamePart('Hematite.asc'),'Hematite');assert.equal(safeFilenamePart('sample.mca'),'sample');assert.equal(safeFilenamePart('abc. tail',4),'abc');
});

test('typed SVG or PNG extensions are replaced by the selected figure format',()=>{
 assert.equal(safeFilenamePart('Hematite.svg')+'.svg','Hematite.svg');assert.equal(safeFilenamePart('Hematite.png')+'.svg','Hematite.svg');
});
