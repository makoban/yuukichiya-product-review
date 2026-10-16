const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
const core=vm.runInNewContext(fs.readFileSync(path.join(root,'core.js'),'utf8')+'\nVisualReviewCore;');

test('Kosema new shirt finds the half-sleeve gym top while rejecting other product types',()=>{
  const m=core.create(data),air='air:0:10757';
  assert.equal(m.productType(m.products.get(air)),'体操服・半袖');
  const matches=data.products.filter(p=>p.source==='base'&&m.compatible(air,p.key)&&p.name.includes('古瀬間'));
  assert.deepEqual(matches.map(p=>p.key),['base:77776833']);
  for(const other of ['base:72180291','base:77777218','base:80563699'])assert.equal(m.compatible(air,other),false);
  assert.equal(m.productType({key:'ordinary-shirt',source:'air',store:'本店',name:'半袖シャツ',cats:['古瀬間小学校']}),'シャツ・半袖');
  assert.equal(m.productType({key:'other-school',source:'air',store:'本店',name:'新 半袖シャツ',cats:['西保見小学校']}),'シャツ・半袖');
});
