const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
const core=vm.runInNewContext(fs.readFileSync(path.join(root,'core.js'),'utf8')+'\nVisualReviewCore;');
const info=()=>({uuid:randomUUID,batchId:randomUUID(),at:new Date().toISOString(),reviewer:'端末-abcdef',evidence:'mixed'});
const examples=[['air:0:10650','base:72180333'],['air:0:10303','base:72149266'],['air:0:10313','base:73214170'],['air:0:10494','base:72180508'],['air:1:10134','base:72149420'],['air:1:10231','base:72180381'],['air:1:10246','base:72180254'],['air:1:10655','base:72149222'],['air:1:10331','base:73214170'],['air:1:10462','base:72180508'],...['air:4:10299','air:4:10296','air:4:10300','air:4:10297'].map(a=>[a,'base:95873128'])];
test('each remaining registration can be manually matched despite different naming, without adding automatic candidates',()=>{
  const m=core.create(data);assert.equal(m.autoPairs.length,3023);
  for(const [air,base]of examples){
    const initial=m.empty(),key=m.pairKey(air,base);
    assert(m.canLink(air,base,initial),air);
    const pairs=m.originalPairs.has(key)?[]:[{key,left:air,right:base}];
    const result=m.append(initial,new Map([['solo:'+air,{mapping:'linked',target:base}],[key,{relation:'same'}]]),pairs,info());
    const q=m.queues(result.state);assert.equal(q.identity.root(air),q.identity.root(base));
    assert.equal(q.solos.find(p=>p.product.key===air).status,'done');
  }
  assert.equal(m.canLink('air:0:10313','base:73215018'),false);
  assert.equal(m.canLink('air:0:10494','base:72180509'),false);
});
