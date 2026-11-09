import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { Numeric, NumericScope, displayNumber, parseNumericText } from '../src/Numeric';
const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = await import('react-dom/client');

test('compact numeric display preserves small values and trims insignificant digits', () => {
  assert.equal(displayNumber(.123456789), '0.12346');
  assert.equal(displayNumber(1.23456789e-12), '1.2346e-12');
  assert.equal(displayNumber(100000), '100000');
  assert.equal(displayNumber(null), '');
});
test('numeric focus/blur preserves precision, edits commit once, and Escape cancels', async () => {
  const container = document.getElementById('root')!, root = createRoot(container);
  const changes: (number | null)[] = [];
  function Harness() { const [value, setValue] = useState<number | null>(.123456789); return <Numeric label="Value" value={value} onChange={v => { changes.push(v); setValue(v); }}/>; }
  const input = () => container.querySelector('input')!;
  const type = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input(), value); input().dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  try {
    await act(async () => root.render(<Harness/>)); assert.equal(input().value, '0.12346');
    await act(async () => input().focus()); assert.equal(input().value, '0.12346');
    await act(async () => input().blur()); assert.equal(changes.length, 0);
    await act(async () => input().focus()); await type('0.12346'); await act(async () => input().blur()); assert.equal(changes.length, 0);
    assert.match(input().title,/0\.123456789/);await act(async()=>input().focus());await type('0,12346');await act(async()=>input().blur());assert.equal(changes.length,0,'retyping the compact value with a decimal comma preserves full precision');
    await act(async () => input().focus()); await type('0.987654321'); await act(async () => input().blur());
    assert.deepEqual(changes, [.987654321]); assert.equal(input().value, '0.98765');
    await act(async () => input().focus()); await type('7'); await act(async () => input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.deepEqual(changes, [.987654321]); assert.equal(input().value, '0.98765');
    await act(async () => input().focus()); await type('invalid'); await act(async () => input().blur());
    assert.equal(input().getAttribute('aria-invalid'), 'true'); assert.equal(changes.length, 1);
    assert.match(document.getElementById(input().getAttribute('aria-describedby')!)!.textContent!, /finite number/);
  } finally { await act(async () => root.unmount()); }
});

test('Enter keeps editing reachable, Escape retains focus, and Shift+Enter skips Fit checkboxes',async()=>{
 const container=document.getElementById('root')!,root=createRoot(container);
 const rect=dom.window.HTMLElement.prototype.getClientRects;dom.window.HTMLElement.prototype.getClientRects=function(){return [{width:80,height:24}] as unknown as DOMRectList;};
 function Harness(){const[value,setValue]=useState<number|null>(1);return <div className="site-editor"><Numeric label="First" value={value} onChange={setValue}/><input type="checkbox"/><Numeric label="Second" value={2} onChange={()=>{}}/></div>;}
 const field=()=>container.querySelector('input')!;
 const type=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(field(),value);field().dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 const key=async(key:string,shiftKey=false)=>act(async()=>{field().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));});
 try{
  await act(async()=>root.render(<Harness/>));await act(async()=>field().focus());await type('3.123456');await key('Enter');assert.equal(document.activeElement,field());assert.equal(field().value,'3.1235');
  await type('4.5');await key('Enter');assert.equal(field().value,'4.5');await type('7');await key('Escape');assert.equal(document.activeElement,field());assert.equal(field().value,'4.5');
  await type('invalid');await key('Enter',true);assert.equal(document.activeElement,field());assert.equal(field().getAttribute('aria-invalid'),'true');
  await type('8');await key('Enter',true);assert.equal(document.activeElement,container.querySelector('input[aria-label="Second"]'));
 }finally{dom.window.HTMLElement.prototype.getClientRects=rect;await act(async()=>root.unmount());}
});

test('numeric parsing accepts decimal commas and Unicode minus without accepting grouped thousands',()=>{
 assert.equal(parseNumericText('1,5'),1.5);assert.equal(parseNumericText('−0.5'),-.5);assert.equal(parseNumericText('−1,5e−3'),-.0015);assert.equal(parseNumericText(',25'),.25);assert.ok(Number.isNaN(parseNumericText('1,234,567')));assert.ok(Number.isNaN(parseNumericText('1,2.3')));
});
test('a single comma that could be a thousands separator is rejected instead of changing a value by 1000',()=>{
 for(const input of ['1,234','123,456','−12,345'])assert.ok(Number.isNaN(parseNumericText(input)));
 assert.equal(parseNumericText('0,123'),.123);assert.equal(parseNumericText('1,2345'),1.2345);assert.equal(parseNumericText('1,234e-3'),.001234);
});

test('an invalid local draft cannot follow an identical numeric value into another site or model',async()=>{
 const container=document.getElementById('root')!,root=createRoot(container),changes:number[]=[];
 const render=(scope:string)=>root.render(<NumericScope scopeKey={scope}><select aria-label="Site"><option>Site</option></select><Numeric label="Scoped value" value={1.23456789} onChange={value=>changes.push(value!)}/></NumericScope>);
 try{await act(async()=>render('modelA:site1'));const field=container.querySelector('input')!,picker=container.querySelector('select')!;await act(async()=>field.focus());await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(field,'invalid');field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>picker.focus());assert.equal(field.getAttribute('aria-invalid'),'true');await act(async()=>render('modelA:site2'));assert.equal(container.querySelector('input'),field,'no selector or editor DOM remount is required');assert.equal(document.activeElement,picker);assert.equal(field.getAttribute('aria-invalid'),'false');assert.equal(field.value,'1.2346');assert.deepEqual(changes,[]);}finally{await act(async()=>root.unmount());}
});
