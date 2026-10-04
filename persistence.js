'use strict';
window.ReviewPersistence = {
  create(model, storage) {
    const key = 'yuukichiya-product-review:' + model.datasetId;
    const backupKey = key + ':verified-backup';
    const pendingKey = key + ':pending-outbox-v1';
    function read() {
      let value = model.empty(), found = false, invalid = false, unavailable = false;
      for (const k of [key, backupKey, ...(window.REVIEW_DATA.compatibleDatasetIds || []).map(id => 'yuukichiya-product-review:' + id)]) {
        let raw;
        try { raw = storage.getItem(k); } catch (e) { unavailable = true; continue; }
        if (!raw) continue;
        try { value = model.merge(value, JSON.parse(raw)); found = true; } catch (e) { invalid = true; }
      }
      if (unavailable) throw Error('このブラウザでは保存を利用できません。回答ファイルの保存先を用意してください。');
      if (invalid) throw Error('保存された回答の一部を読み込めません。上書きせず、以前の回答ファイルを確認してください。');
      return { value, found };
    }
    function verify(k, value) {
      const raw = JSON.stringify(value);
      storage.setItem(k, raw);
      if (storage.getItem(k) !== raw) throw Error('保存した回答を読み戻せません。');
    }
    return {
      key, backupKey, pendingKey,
      loadPending() { const raw=storage.getItem(pendingKey);if(!raw)return null;try{return model.validate(JSON.parse(raw));}catch{const error=Error('保存待ちの回答を読み込めません。上書きせず控えを確認してください。');error.code='review_pending_corrupt';throw error;} },
      savePending(next,confirmed) {
        const known=new Map(confirmed.events.map(e=>[e.id,model.canonical(e)])),byId=new Map(next.events.map(e=>[e.id,e]));
        const included=new Set(),queue=next.events.filter(e=>known.get(e.id)!==model.canonical(e)).map(e=>e.id);
        while(queue.length){const id=queue.pop();if(included.has(id))continue;included.add(id);queue.push(...byId.get(id).parents);}
        const events=next.events.filter(e=>included.has(e.id)),tasks=new Set(events.map(e=>e.task));
        const compact=model.validate({...model.empty(),events,manualPairs:next.manualPairs.filter(p=>tasks.has(p.key))});
        verify(pendingKey,model.merge(this.loadPending()||model.empty(),compact));
      },
      clearPending(confirmed) { const pending=this.loadPending();if(!pending)return;const ids=new Map(confirmed.events.map(e=>[e.id,model.canonical(e)]));if(pending.events.every(e=>ids.get(e.id)===model.canonical(e))&&pending.manualPairs.every(p=>confirmed.manualPairs.some(c=>c.key===p.key&&c.left===p.left&&c.right===p.right)))storage.removeItem(pendingKey); },
      load() { return read().value; },
      commit(next) {
        const merged = model.merge(model.validate(next), read().value);
        verify(backupKey, merged);
        verify(key, merged);
        return merged;
      },
      sessionKey: key + ':one-question-session-v1',
      readSession() {
        const raw = storage.getItem(this.sessionKey);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || typeof s.reviewer !== 'string' || s.reviewer.length > 60 || !['match','retail','plan'].includes(s.mode) || typeof s.store !== 'string' || typeof s.school !== 'string' || !Array.isArray(s.history) || s.history.length > 15000) throw Error('再開位置のデータを確認してください。');
        return s;
      },
      saveSession(s) { verify(this.sessionKey, s); },
    };
  }
};
