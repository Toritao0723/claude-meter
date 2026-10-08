const { test } = require('node:test');
const assert = require('node:assert/strict');
const TaskNavigation = require('./ui/task-nav.js');
const a = { id:'a', title:'任务 A', state:'working' };
const b = { id:'b', title:'任务 B', state:'working' };
test('polling, reorder and title changes preserve the selected task', () => {
  const nav = new TaskNavigation();
  nav.update([a, b]);
  assert.equal(nav.move(1).id, 'b');
  assert.equal(nav.update([{ ...b, title:'任务 B 更新' }, a]).id, 'b');
  assert.equal(nav.index(), 0);
  assert.equal(nav.current().title, '任务 B 更新');
});
test('navigation wraps in both directions and safely handles an empty list', () => {
  const nav = new TaskNavigation();
  assert.equal(nav.move(1), null);
  nav.update([a, b]);
  assert.equal(nav.move(-1).id, 'b');
  assert.equal(nav.move(1).id, 'a');
  assert.equal(nav.update([]), null);
});
test('a new reply request is prioritized once, while manual selection persists', () => {
  const nav = new TaskNavigation();
  nav.update([a, b]);
  const waiting = { ...b, attention:'reply' };
  assert.equal(nav.update([a, waiting]).id, 'b');
  nav.move(1);
  assert.equal(nav.update([a, waiting]).id, 'a');
  nav.update([a, b]);
  assert.equal(nav.update([a, waiting]).id, 'b');
});
test('a finished or removed task falls back to a remaining task', () => {
  const nav = new TaskNavigation();
  nav.update([a, b]);
  nav.move(1);
  assert.equal(nav.update([{ ...b, state:'done' }, a]).state, 'done');
  assert.equal(nav.update([a]).id, 'a');
});
