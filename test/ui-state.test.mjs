import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx=vm.createContext({window:{},Map,Set});
vm.runInContext(readFileSync(new URL('../ui-state.js',import.meta.url),'utf8'),ctx);
const ui=ctx.window.ReviewUI;
const groups=Array.from({length:12},(_,i)=>({id:'group-'+i,edges:[{key:'pair-'+i}]}));
test('resume finds the same pending group after own and earlier remote answers remove rows',()=>{
  const session={mode:'match',page:2,cursor:6,resume:ui.capture(groups,'match',6)};
  const remaining=groups.filter((_,i)=>![0,1,6,8].includes(i));
  assert.equal(remaining[ui.position(remaining,session)].id,'group-7');
  const allThreeDone=groups.filter((_,i)=>![0,1,6,7,8].includes(i));
  assert.equal(allThreeDone[ui.position(allThreeDone,session)].id,'group-9');
});
test('regrouping and split IDs do not invalidate task anchors, exhausted tails revisit earlier items',()=>{
  const session={mode:'match',page:1,cursor:3,resume:ui.capture(groups,'match',3)};
  const split=[groups[0],{id:'changed-members',edges:[{key:'pair-3'}]},groups[5]];
  assert.equal(ui.position(split,session),1);
  assert.equal(ui.position([groups[0],groups[1]],session),0);
  assert.equal(ui.position(groups,session,9),9);
});
test('solo resume uses product IDs and supports old sessions and held queues',()=>{
  const solos=Array.from({length:30},(_,i)=>({product:{key:'air-'+i}}));
  const session={mode:'single',page:1,cursor:10,resume:ui.capture(solos,'single',10)};
  const remaining=solos.filter((_,i)=>![0,1,10,12].includes(i));
  assert.equal(remaining[ui.position(remaining,session)].product.key,'air-11');
  assert.equal(ui.position(solos,{mode:'single',page:2,cursor:0}),20);
  assert.equal(ui.position(groups,{mode:'held',page:1,cursor:3,resume:ui.capture(groups,'held',3)}),3);
});
test('forward navigation follows unseen task IDs rather than jumping past a remnant sorted to the tail',()=>{
  const session={mode:'match',page:0,cursor:0,resume:ui.capture(groups,'match',0)};
  const moved=[...groups.slice(1),{id:'split-remnant',edges:groups[0].edges}];
  assert.equal(moved[ui.next(moved,session,groups.slice(0,3))].id,'group-3');
  const later={mode:'match',page:2,cursor:6,resume:ui.capture(groups,'match',6)};
  const pending=[groups[0],groups[1],groups[6]];
  assert.equal(pending[ui.next(pending,later,[groups[6]])].id,'group-0');
});
test('readbacks distinguish actual choices, links, corrections and concurrent conflicts',()=>{
  const event=(id,value)=>({id,task:'pair-1',value});
  const same=event('a',{relation:'same'}),different=event('b',{relation:'different'}),hold=event('c',{relation:'hold'});
  assert.equal(ui.summary([same]),'全部同じ');
  assert.equal(ui.summary([same,different]),'同じ商品 ／ 別の商品');
  assert.equal(ui.summary([hold]),'保留');
  assert.equal(ui.summary([event('d',{mapping:'unmatched'})]),'対応先なし');
  assert.equal(ui.summary([same,event('e',{mapping:'linked',target:'base-1'})]),'BASEの商品に対応');
  assert.equal(ui.summary([event('f',{relation:'reset'})]),'確認前に戻しました');
  const model={heads:(_task,state)=>state};
  assert.equal(ui.current([same],model,[same]),'現在もこの回答です');
  assert.equal(ui.current([same],model,[different]),'あとから訂正された回答があります');
  assert.equal(ui.current([same],model,[same,different]),'ほかの回答との確認が必要');
  assert.equal(ui.current([same],model,[same],new Set(['pair-1'])),'ほかの回答との確認が必要');
  const replacement={...hold,parents:[same.id]};
  assert.equal(ui.summary(ui.batchEvents([same,replacement])),'保留');
  assert.equal(ui.batchEvents([same,different]).length,2);
});
