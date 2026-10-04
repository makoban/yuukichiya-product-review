'use strict';
// Product/task anchors survive answered rows disappearing or groups being split.
window.ReviewUI = {
  tasks(item, mode) {
    return mode === 'single' ? ['solo:' + item.product.key] : item.edges.map(e => e.key);
  },
  position(items, session, explicit) {
    let index = explicit;
    if (index === undefined) {
      if (session.resume?.mode === session.mode) {
        const positions = new Map();
        items.forEach((item, i) => this.tasks(item, session.mode).forEach(task => positions.set(task, i)));
        const task = session.resume.tasks.find(task => positions.has(task));
        index = task === undefined ? 0 : positions.get(task);
      } else index = session.mode === 'single' ? session.page * 10 : session.cursor ?? session.page * 3;
    }
    return Math.max(0, Math.min(index, Math.max(0, items.length - 1)));
  },
  capture(items, mode, cursor) {
    // Keep the earlier pending rows too: once this tail is complete, revisit them.
    const ordered = [...items.slice(cursor), ...items.slice(0, cursor)];
    return {mode, tasks: [...new Set(ordered.flatMap(item => this.tasks(item, mode)))]};
  },
  next(items, session, visible) {
    const shown = new Set(visible.flatMap(item => this.tasks(item, session.mode)));
    const positions = new Map();
    items.forEach((item, i) => this.tasks(item, session.mode).forEach(task => positions.set(task, i)));
    const task = session.resume?.tasks.find(task => !shown.has(task) && positions.has(task));
    return task === undefined ? this.position(items, session) : positions.get(task);
  },
  label(value) {
    return value.mapping ? ({unmatched:'対応先なし', linked:'BASEの商品に対応', hold:'保留', reset:'確認前に戻しました'}[value.mapping]) : ({same:'同じ商品', different:'別の商品', family:'同じ型の別仕様', hold:'保留', reset:'確認前に戻しました'}[value.relation]);
  },
  batchEvents(events) {
    const superseded = new Set(events.flatMap(e => e.parents || []));
    return events.filter(e => !superseded.has(e.id));
  },
  summary(events) {
    const values = [...new Set(events.map(e => this.label(e.value)))];
    if (values.length === 1 && events.every(e => e.value.relation === 'same')) return '全部同じ';
    if (values.length > 1 && events.some(e => e.value.mapping === 'linked') && events.every(e => e.value.mapping === 'linked' || e.value.relation === 'same')) return 'BASEの商品に対応';
    return values.join(' ／ ');
  },
  current(events, model, state, conflicts = new Set()) {
    const statuses = events.map(e => {
      const heads = model.heads(e.task, state);
      return heads.length > 1 || (heads[0]?.id === e.id && conflicts.has(e.task)) ? 'conflict' : heads[0]?.id === e.id ? 'current' : 'changed';
    });
    if (statuses.includes('conflict')) return 'ほかの回答との確認が必要';
    if (statuses.every(s => s === 'current')) return '現在もこの回答です';
    return 'あとから訂正された回答があります';
  },
};
