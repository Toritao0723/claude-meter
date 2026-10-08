// Keep the user's selected task stable across polling and activity reordering.
(function (root) {
  class TaskNavigation {
    constructor() { this.items = []; this.selectedKey = null; this.attention = new Set(); }
    key(item) { return item.id || `${item.state}:${item.title}`; }
    needsReply(item) { return !!item.attention || item.state === 'waiting'; }
    update(items) {
      const fresh = items.find(item => this.needsReply(item) && !this.attention.has(this.key(item)));
      this.items = items;
      this.attention = new Set(items.filter(item => this.needsReply(item)).map(item => this.key(item)));
      if (fresh) this.selectedKey = this.key(fresh);
      if (!items.some(item => this.key(item) === this.selectedKey)) this.selectedKey = items[0] ? this.key(items[0]) : null;
      return this.current();
    }
    current() { return this.items.find(item => this.key(item) === this.selectedKey) || null; }
    index() { return this.items.findIndex(item => this.key(item) === this.selectedKey); }
    move(delta) {
      if (!this.items.length) return null;
      const index = (this.index() + delta + this.items.length) % this.items.length;
      this.selectedKey = this.key(this.items[index]);
      return this.current();
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = TaskNavigation;
  else root.TaskNavigation = TaskNavigation;
})(globalThis);
