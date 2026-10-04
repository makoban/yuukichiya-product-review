'use strict';
globalThis.VisualReviewCore = { create(D) {
  const schema = 'yuukichiya-visual-review-answers-v1';
  const P = new Map(D.products.map(p => [p.key,p]));
  const originalPairs = new Map(D.pairs.map(p => [p.key,p]));
  const canonical = value => JSON.stringify(value, (_k,v) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
  const pairKey = (a,b) => 'pair:' + [a,b].sort().join('|');
  const norm = s => String(s||'').normalize('NFKC').toLowerCase().replace(/ヶ/g,'ケ').replace(/\s/g,'');
  const empty = () => ({schema,datasetId:D.datasetId,events:[],manualPairs:[]});
  const cache = new WeakMap();
  function heads(task,s) {
    if (!cache.has(s)) {
      const used=new Set(s.events.flatMap(e=>e.parents)), by=new Map();
      for(const e of s.events) if(!used.has(e.id)){const a=by.get(e.task)||[];a.push(e);by.set(e.task,a);}
      cache.set(s,by);
    }
    return cache.get(s).get(task)||[];
  }
  function validate(obj) {
    if(!obj||obj.schema!==schema||obj.datasetId!==D.datasetId||!Array.isArray(obj.events)||!Array.isArray(obj.manualPairs)||obj.events.length>30000||obj.manualPairs.length>15000)throw Error('回答データの形式が違います。');
    const pairs=new Map(originalPairs), ids=new Map(),allowed=union();for(const p of D.pairs)allowed.join(p.left,p.right);
    for(const p of obj.manualPairs){if(!p||!P.has(p.left)||!P.has(p.right)||p.left===p.right||p.key!==pairKey(p.left,p.right)||Object.keys(p).some(k=>!['key','left','right'].includes(k)))throw Error('商品候補が不正です。');if(P.get(p.left).source!==P.get(p.right).source)allowed.join(p.left,p.right);pairs.set(p.key,p);}
    for(const p of obj.manualPairs)if(P.get(p.left).source===P.get(p.right).source&&allowed.root(p.left)!==allowed.root(p.right))throw Error('既存候補のない登録同士です。');
    for(const e of obj.events){
      if(!e||typeof e.id!=='string'||!/^[a-z0-9-]{1,100}$/.test(e.id)||typeof e.task!=='string'||!Array.isArray(e.parents)||e.parents.length>200||e.parents.some(p=>typeof p!=='string')||e.parents.includes(e.id)||typeof e.reviewer!=='string'||!/^端末-[a-z0-9]{6}$/.test(e.reviewer)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||!e.value||typeof e.value!=='object'||typeof e.batchId!=='string'||!/^[a-z0-9-]{1,100}$/.test(e.batchId)||!['answer','undo'].includes(e.action)||!['image','text','mixed'].includes(e.evidence))throw Error('回答履歴が不正です。');
      if(Object.keys(e).some(k=>!['id','task','parents','reviewer','at','value','batchId','action','evidence'].includes(k)))throw Error('回答に不明な項目があります。');
      if(e.task.startsWith('solo:')){
        const p=P.get(e.task.slice(5));if(p?.source!=='air'||!['unmatched','linked','hold','reset'].includes(e.value.mapping)||Object.keys(e.value).some(k=>!['mapping','target'].includes(k)))throw Error('対応先の回答が不正です。');
        if(e.value.mapping==='linked'&&P.get(e.value.target)?.source!=='base')throw Error('BASEの商品を選んでください。');
        if(e.value.mapping!=='linked'&&e.value.target!==undefined)throw Error('不要な対応先があります。');
      }else if(!pairs.has(e.task)||!['same','family','different','hold','reset'].includes(e.value.relation)||Object.keys(e.value).some(k=>k!=='relation'))throw Error('商品対応の回答が不正です。');
      if(ids.has(e.id)&&canonical(ids.get(e.id))!==canonical(e))throw Error('回答番号に違う内容があります。');ids.set(e.id,e);
    }
    const referenced=new Set(obj.events.map(e=>e.task));if(obj.manualPairs.some(p=>!referenced.has(p.key)))throw Error('回答のない追加候補があります。');
    const done=new Set(),visiting=new Set();
    function visit(id){if(done.has(id))return;if(visiting.has(id))throw Error('回答履歴が循環しています。');visiting.add(id);for(const parent of ids.get(id).parents){if(!ids.has(parent)||ids.get(parent).task!==ids.get(id).task)throw Error('回答の参照先が不正です。');visit(parent);}visiting.delete(id);done.add(id);}
    for(const id of ids.keys())visit(id);
    return JSON.parse(canonical({schema,datasetId:D.datasetId,events:[...ids.values()],manualPairs:[...new Map(obj.manualPairs.map(p=>[p.key,p])).values()]}));
  }
  function merge(a,b){a=validate(a);b=validate(b);const ev=new Map(a.events.map(e=>[e.id,e]));for(const e of b.events){if(ev.has(e.id)&&canonical(ev.get(e.id))!==canonical(e))throw Error('回答番号が食い違っています。');ev.set(e.id,e);}const mp=new Map([...a.manualPairs,...b.manualPairs].map(p=>[p.key,p]));return validate({...empty(),events:[...ev.values()],manualPairs:[...mp.values()]});}
  function union(){const parent=new Map(D.products.map(p=>[p.key,p.key]));function root(k){while(parent.get(k)!==k){parent.set(k,parent.get(parent.get(k)));k=parent.get(k);}return k;}return {root,join(a,b){parent.set(root(a),root(b));}};}
  const initial=union();for(const p of D.pairs)initial.join(p.left,p.right);
  const activeInitial=new Set(D.products.filter(p=>p.active).map(p=>initial.root(p.key)));
  const hasInitial=new Set(D.pairs.flatMap(p=>[p.left,p.right]));
  const catKey=p=>p.cats.map(norm).sort().join('|');
  const rank=p=>p.source==='base'?6:Math.max(0,D.stores.indexOf(p.store));
  const productSort=(a,b)=>rank(P.get(a))-rank(P.get(b))||P.get(a).name.localeCompare(P.get(b).name,'ja')||a.localeCompare(b);
  const featureCache=new Map();
  function features(p){if(featureCache.has(p.key))return featureCache.get(p.key);const s=norm(p.name);const result={
    色:['ネイビー','コバルト','グリーン','レッド','ブルー','ワイン','ピンク','ホワイト','ブラック','イエロー','濃紺'].filter(x=>s.includes(x)),
    性別:['男子','女子','男女兼用'].filter(x=>s.includes(x)),袖:['半袖','長袖'].filter(x=>s.includes(x)),
    新旧:['従来品','旧タイプ','旧型','新製品','新タイプ','新型'].filter(x=>s.includes(x)),
    品番:(s.match(/(?:[a-z]{1,5}-?)?\d{3,5}[a-z]{0,5}/g)||[]).filter(x=>!/^1\d{2}(?:[ab]|cm)?$/.test(x)&&!p.sizes.some(v=>norm(v)===x))};featureCache.set(p.key,result);return result;}
  function warnings(members,s){const flags=new Set();const fs=members.map(k=>features(P.get(k)));for(let i=0;i<fs.length;i++)for(let j=i+1;j<fs.length;j++)for(const k of Object.keys(fs[i]))if(fs[i][k].length&&fs[j][k].length&&canonical(fs[i][k].slice().sort())!==canonical(fs[j][k].slice().sort()))flags.add(k+'の記載が違います');
    const schools=new Set(members.flatMap(k=>P.get(k).cats).filter(c=>/学校/.test(c)&&c!=='学校指定なし').map(norm));if(schools.size>1)flags.add('学校が違います');
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const h=heads(pairKey(members[i],members[j]),s);if(h.length>1)flags.add('他の回答との確認が必要です');else if(h.length===1&&['different','family'].includes(h[0].value.relation))flags.add('以前に別の商品・仕様と回答されています');}
    return [...flags];}
  function queues(s,options={}){
    const pairs=new Map([...D.pairs,...s.manualPairs].map(p=>[p.key,p])), identity=union(),eligible=union();
    for(const p of pairs.values())eligible.join(p.left,p.right);
    const activeEligible=new Set(D.products.filter(p=>p.active).map(p=>eligible.root(p.key)));
    for(const p of pairs.values()){const h=heads(p.key,s);if(h.length===1&&h[0].value.relation==='same')identity.join(p.left,p.right);}
    const rows=[];
    for(const p of pairs.values()){
      if(options.salesOnly!==false&&!activeEligible.has(eligible.root(p.left)))continue;
      const h=heads(p.key,s),v=h.length===1?h[0].value.relation:null;
      const contradictory=h.length===1&&['different','family'].includes(v)&&identity.root(p.left)===identity.root(p.right);
      const status=h.length>1||contradictory?'conflict':identity.root(p.left)===identity.root(p.right)?'derived':v==='hold'?'hold':v&&v!=='reset'?'done':'todo';
      if(status==='done'||status==='derived')continue;
      const cats=[catKey(P.get(p.left)),catKey(P.get(p.right))].sort();
      rows.push({...p,status,bucket:cats.join('~~')});
    }
    const buckets=new Map();for(const e of rows){const a=buckets.get(e.bucket)||[];a.push(e);buckets.set(e.bucket,a);}
    const blocks=[];
    for(const edges of buckets.values()){
      const graph=union();for(const e of edges)graph.join(e.left,e.right);
      const components=new Map();for(const e of edges){const root=graph.root(e.left);const a=components.get(root)||[];a.push(e);components.set(root,a);}
      for(const es of components.values()){
        const members=[...new Set(es.flatMap(e=>[e.left,e.right]))].sort(productSort);
        if(options.store&&!members.some(k=>P.get(k).store===options.store))continue;
        if(options.school&&!members.some(k=>P.get(k).cats.some(c=>norm(c)===norm(options.school))))continue;
        const status=es.some(e=>e.status==='conflict')?'conflict':es.some(e=>e.status==='todo')?'todo':'hold';
        blocks.push({id:members.join('|'),members,edges:es,status,warnings:warnings(members,s),school:[...new Set(members.flatMap(k=>P.get(k).cats))].join(' / ')});
      }
    }
    blocks.sort((a,b)=>a.school.localeCompare(b.school,'ja')||Number(b.members.some(k=>P.get(k).source==='base'))-Number(a.members.some(k=>P.get(k).source==='base'))||Number(b.members.some(k=>P.get(k).image))-Number(a.members.some(k=>P.get(k).image))||a.id.localeCompare(b.id));
    const solos=D.products.filter(p=>p.source==='air'&&!hasInitial.has(p.key)&&(options.salesOnly===false||p.active)&&(!options.store||p.store===options.store)&&(!options.school||p.cats.some(c=>norm(c)===norm(options.school)))).map(p=>{
      const task='solo:'+p.key,h=heads(task,s),a=h.length===1?h[0]:null;let status=h.length>1?'conflict':!a||a.value.mapping==='reset'?'todo':a.value.mapping==='hold'?'hold':'done';
      if(a?.value.mapping==='linked'){const t=pairKey(p.key,a.value.target),ph=heads(t,s);if(ph.length!==1||ph[0].value.relation!=='same')status='todo';}
      if(status==='todo'&&D.products.some(b=>b.source==='base'&&identity.root(b.key)===identity.root(p.key)))status='done';
      return {task,product:p,status};
    });
    return {blocks,solos,pairs,identity};
  }
  function batch(s,blocks,selection,relation,info){
    const wanted=new Map(),manual=new Map(s.manualPairs.map(p=>[p.key,p]));
    function add(a,b,rel){if(a===b)return;const key=pairKey(a,b);wanted.set(key,{relation:rel});if(!originalPairs.has(key))manual.set(key,{key,left:[a,b].sort()[0],right:[a,b].sort()[1]});}
    for(const block of blocks){
      const excluded=new Set(relation==='same'?[]:selection[block.id]||[]), kept=block.members.filter(k=>!excluded.has(k));
      if(relation==='same'){for(let i=1;i<kept.length;i++)add(kept[0],kept[i],'same');for(const p of block.edges)add(p.left,p.right,'same');}
      else if(relation==='hold'){for(const p of block.edges)add(p.left,p.right,'hold');}
      else{
        if(kept.length<1||!excluded.size)throw Error('同じ商品側と違う商品側を選んでください。');
        for(let i=1;i<kept.length;i++)add(kept[0],kept[i],'same');
        for(const p of block.edges){if(excluded.has(p.left)&&excluded.has(p.right))continue;add(p.left,p.right,excluded.has(p.left)!==excluded.has(p.right)?relation:'same');}
        for(const x of excluded)add(kept[0],x,relation);
      }
    }
    return append(s,wanted,[...manual.values()],info);
  }
  function append(s,wanted,manualPairs,info){const before=[],events=[];for(const [task,value]of wanted){const h=heads(task,s);before.push({task,heads:h.map(e=>e.id),value:h.length===1?h[0].value:null});events.push({id:info.uuid(),task,parents:h.map(e=>e.id),at:info.at,reviewer:info.reviewer,value,batchId:info.batchId,action:info.action||'answer',evidence:info.evidence||'mixed'});}return {state:validate({...s,manualPairs,events:[...s.events,...events]}),events,before};}
  function undo(s,record,info){const wanted=new Map();for(const b of record.before){const h=heads(b.task,s);if(h.some(e=>e.batchId!==record.batchId))throw Error('別の端末で回答が更新されています。先に内容を確認してください。');wanted.set(b.task,b.value||(b.task.startsWith('solo:')?{mapping:'reset'}:{relation:'reset'}));}return append(s,wanted,s.manualPairs,{...info,action:'undo'});}
  function delta(next,confirmed){const known=new Map(confirmed.events.map(e=>[e.id,canonical(e)])),byId=new Map(next.events.map(e=>[e.id,e])),included=new Set(),fresh=next.events.filter(e=>known.get(e.id)!==canonical(e)),queue=fresh.map(e=>e.id);const freshTasks=new Set(fresh.map(e=>e.task));if(next.manualPairs.some(p=>freshTasks.has(p.key)&&P.get(p.left).source===P.get(p.right).source))for(const p of next.manualPairs)if(P.get(p.left).source!==P.get(p.right).source){const event=next.events.find(e=>e.task===p.key);if(event)queue.push(event.id);}while(queue.length){const id=queue.pop();if(included.has(id))continue;included.add(id);queue.push(...byId.get(id).parents);}const events=next.events.filter(e=>included.has(e.id)),tasks=new Set(events.map(e=>e.task));return validate({...empty(),events,manualPairs:next.manualPairs.filter(p=>tasks.has(p.key))});}
  return {schema,datasetId:D.datasetId,products:P,originalPairs,canonical,pairKey,empty,validate,merge,heads,queues,batch,append,undo,warnings,delta};
}};
