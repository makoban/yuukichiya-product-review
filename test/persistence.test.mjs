import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const D=JSON.parse(readFileSync(new URL('../data.json',import.meta.url)));
const ctx=vm.createContext({window:{},JSON,Map,Set,WeakMap,Date});
vm.runInContext(readFileSync(new URL('../core.js',import.meta.url),'utf8'),ctx);
vm.runInContext(readFileSync(new URL('../persistence.js',import.meta.url),'utf8'),ctx);
const m=ctx.VisualReviewCore.create(D),values=new Map(),store={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const info=()=>({uuid:randomUUID,batchId:randomUUID(),at:new Date().toISOString(),reviewer:'端末-abcdef',evidence:'mixed'});
test('anonymous visual review saves verified backups, compact outbox and every resume mode',()=>{
  const p=ctx.window.ReviewPersistence.create(m,store),empty=m.empty(),group=m.queues(empty).blocks.find(g=>!g.warnings.length);
  assert.equal(p.load().events.length,0);
  const answer=m.batch(empty,[group],{[group.id]:group.members.slice(-2)},'same',info());
  assert.equal(m.queues(answer.state).blocks.some(g=>g.id===group.id),false);
  p.savePending(answer.state,empty);assert.equal(p.load().events.length,0);assert(p.loadPending().events.length>0);
  p.commit(answer.state);assert.equal(p.load().events.length,answer.events.length);assert(values.has(p.backupKey));
  p.clearPending(answer.state);assert.equal(p.loadPending(),null);
  for(const mode of ['match','single','held','history']){
    p.saveSession({reviewer:'端末-abcdef',mode,store:'',school:'',salesOnly:true,page:2,history:[]});
    assert.equal(p.readSession().mode,mode);assert.equal(p.readSession().reviewer,'端末-abcdef');assert.equal(p.readSession().page,2);
  }
  assert.equal(m.delta(answer.state,answer.state).events.length,0);
  const hold=m.batch(answer.state,[group],{},'hold',info());
  const delta=m.delta(hold.state,answer.state);assert(delta.events.every(e=>e.batchId===hold.events[0].batchId||answer.events.some(x=>x.id===e.id)));
  assert.equal(m.canonical(m.merge(answer.state,delta)),m.canonical(hold.state));
  const corrupt='{invalid';store.setItem(p.pendingKey,corrupt);assert.throws(()=>p.loadPending());assert.equal(store.getItem(p.pendingKey),corrupt);
});

test('a BASE link can be undone, regrouped with original Air candidates and sent as a valid delta',()=>{
  const product=(key,source)=>({key,source,store:source==='air'?'本店':'BASE',name:'半袖体操服',cats:['学校'],sizes:[],active:source==='air',image:''});
  const data={datasetId:'qa-bridge',products:[product('air-x','air'),product('air-z','air'),product('base-y','base'),product('air-other','air'),product('base-other','base')],stores:['本店'],pairs:[{key:'pair:air-z|base-y',left:'air-z',right:'base-y'}]};
  const model=ctx.VisualReviewCore.create(data),empty=model.empty(),key=model.pairKey('air-x','base-y'),pair={key,left:'air-x',right:'base-y'};
  const otherKey=model.pairKey('air-other','base-other'),otherPair={key:otherKey,left:'air-other',right:'base-other'};
  const confirmed=model.append(empty,new Map([[otherKey,{relation:'same'}]]),[otherPair],info());
  const linked=model.append(confirmed.state,new Map([[key,{relation:'same'}],['solo:air-x',{mapping:'linked',target:'base-y'}]]),[otherPair,pair],info());
  const undone=model.undo(linked.state,{...linked,batchId:linked.events[0].batchId},info());
  const group=model.queues(undone.state).blocks.find(g=>g.members.length===3);assert(group);
  const done=model.batch(undone.state,[group],{},'same',info());assert.equal(model.queues(done.state).blocks.length,0);
  const delta=model.delta(done.state,undone.state);assert.equal(model.canonical(model.merge(undone.state,delta)),model.canonical(done.state));assert(!delta.events.some(e=>e.task===otherKey));assert(!delta.manualPairs.some(p=>p.key===otherKey));
  const p=ctx.window.ReviewPersistence.create(model,store);p.savePending(done.state,undone.state);assert.equal(model.canonical(model.merge(undone.state,p.loadPending())),model.canonical(done.state));
});
