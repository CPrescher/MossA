import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayKeys} from '../src/display-parameters';
import {newSite,keys} from '../src/types';
test('display order groups ratios after the physical parameters without changing engine traversal',()=>{
 const site=newSite(0,'Sextet'),before=structuredClone(site),engineOrder=keys(site);
 assert.deepEqual(displayKeys(site),['cs','fwhm','intensity','qs','bhf','a12','a13']);
 assert.deepEqual(keys(site),engineOrder);assert.deepEqual(site,before);
 assert.deepEqual(displayKeys(newSite(1,'Doublet')),['cs','fwhm','intensity','qs','a12']);
});
