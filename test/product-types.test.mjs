import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const ctx=vm.createContext({});
vm.runInContext(readFileSync(new URL('../core.js',import.meta.url),'utf8'),ctx);
const D=JSON.parse(readFileSync(new URL('../data.json',import.meta.url)));
const m=ctx.VisualReviewCore.create(D);
const info=()=>({uuid:randomUUID,batchId:randomUUID(),at:new Date().toISOString(),reviewer:'端末-abcdef',evidence:'mixed'});

test('the reported jersey group separates upper garments from trousers and retains every sold registration',()=>{
  const q=m.queues(m.empty());
  const groups=q.blocks.filter(g=>g.school==='梅坪台中学校');
  const top=groups.find(g=>g.type==='ジャージ上衣');
  const bottom=groups.find(g=>g.type==='長ズボン');
  assert(top);assert(bottom);assert.equal(top.members.length,5);assert.equal(bottom.members.length,4);
  assert(top.members.every(k=>/上衣/.test(m.products.get(k).name)));
  assert(bottom.members.every(k=>/ズボン/.test(m.products.get(k).name)));
  assert(top.members.some(k=>m.products.get(k).source==='base'));
  for(const scope of [{},{salesOnly:false}]){
    const queue=m.queues(m.empty(),scope),covered=new Set([...queue.blocks.flatMap(g=>g.members),...queue.solos.map(s=>s.product.key)]);
    for(const p of D.products.filter(p=>p.source==='air'&&(scope.salesOnly===false||p.active)))assert(covered.has(p.key),p.key+' '+p.name);
    for(const g of queue.blocks){
      const names=g.members.map(k=>m.products.get(k).name);
      assert(!(names.some(n=>/ジャージ上衣/.test(n))&&names.some(n=>/ジャージ.*ズボン/.test(n))));
      assert(!(names.some(n=>/半袖(?:体操|Tシャツ)/.test(n))&&names.some(n=>/長袖(?:体操|Tシャツ)/.test(n))));
      assert(!(names.some(n=>/ニット.*ベスト/.test(n))&&names.some(n=>/ニット.*セーター/.test(n))));
    }
  }
});

test('product types distinguish accessories, swimwear parts and uniform trousers without treating parent terms as leaves',()=>{
  const kind=(name,cats=[])=>m.productType({key:'fixture:'+name+cats.join('|'),name,cats});
  assert.equal(kind('赤白帽子 校章入り'),'赤白帽子');
  assert.equal(kind('帽子校章マーク'),'帽子マーク');
  assert.equal(kind('女子水着 セパレート 上衣'),'水着上衣');
  assert.equal(kind('女子 半袖 ズボン',['水着']),'水着下衣');
  assert.equal(kind('ズボン ST7605',['学生ズボン']),'制服スラックス');
  assert.equal(kind('長ズボン 2952'),'長ズボン');
  assert.equal(kind('PUMA ジャージ上下セット'),'上下セット');assert.equal(kind('ジャージ上下'),'上下セット');assert.equal(kind('半袖体操服 校章刺繍'),'体操服・半袖');assert.equal(kind('詰襟学生服 ボタン付き'),'詰襟学生服');assert.equal(kind('ジャージズボン',['夏ズボン']),'長ズボン');
  assert.equal(kind('ジャージ'),null);assert.equal(kind('制服'),null);
});

test('unknown names cannot bridge upper and lower garments, including manual BASE links and stale-client writes',()=>{
  const products=[['air-top','air','ジャージ上衣'],['air-bottom','air','ジャージズボン'],['base-unknown','base','指定商品']].map(([key,source,name])=>({key,source,name,cats:['学校'],sizes:[],active:source==='air',store:source==='air'?'本店':'BASE'}));
  const edges=[['air-top','base-unknown'],['air-bottom','base-unknown'],['air-top','air-bottom']].map(([left,right])=>({left,right,key:'pair:'+[left,right].sort().join('|')}));
  const model=ctx.VisualReviewCore.create({datasetId:'types-fixture',products,pairs:edges,stores:['本店']}),empty=model.empty();
  assert.equal(model.queues(empty).blocks.length,2);assert(model.queues(empty).blocks.every(g=>!(g.members.includes('air-top')&&g.members.includes('air-bottom'))));
  const topKey=model.pairKey('air-top','base-unknown'),bottomKey=model.pairKey('air-bottom','base-unknown');
  const first=model.append(empty,new Map([[topKey,{relation:'same'}]]),[],info());
  assert.throws(()=>model.append(first.state,new Map([[bottomKey,{relation:'same'}]]),[],info()),/商品種別/);
  const wrongKey=model.pairKey('air-top','air-bottom');
  assert.throws(()=>model.append(empty,new Map([[wrongKey,{relation:'same'}]]),[],info()),/商品種別/);
  const event={id:randomUUID(),task:wrongKey,parents:[],reviewer:'端末-abcdef',at:new Date().toISOString(),batchId:randomUUID(),action:'answer',evidence:'mixed',value:{relation:'same'}};
  const legacy=model.validate({...empty,events:[event]}); // Raw history remains readable.
  assert.notEqual(model.queues(legacy).identity.root('air-top'),model.queues(legacy).identity.root('air-bottom'));
  assert.throws(()=>model.mergeIncoming(empty,legacy),/商品種別/);
  const second=model.append(empty,new Map([[bottomKey,{relation:'same'}]]),[],info());
  const merged=model.mergeIncoming(first.state,second.state);const reverse=model.mergeIncoming(second.state,first.state);assert.equal(model.canonical([...merged.events].sort((a,b)=>a.id.localeCompare(b.id))),model.canonical([...reverse.events].sort((a,b)=>a.id.localeCompare(b.id))));assert.equal(model.canonical(model.queues(merged).blocks),model.canonical(model.queues(reverse).blocks));assert(model.queues(merged).blocks.some(g=>g.status==='conflict'&&g.warnings.length));assert.notEqual(model.queues(merged).identity.root('air-top'),model.queues(merged).identity.root('air-bottom'));
  const fix=model.append(merged,new Map([[bottomKey,{relation:'different'}]]),[],info());assert(!model.queues(fix.state).blocks.some(g=>g.status==='conflict'));
  assert.equal(model.merge(empty,legacy).events.length,1);
});
