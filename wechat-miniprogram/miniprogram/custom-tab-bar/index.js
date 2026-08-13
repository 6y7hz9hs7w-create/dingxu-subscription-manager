/* global Component, getCurrentPages, wx */
Component({
  data: {
    selected: 0,
    items: [
      { pagePath: "/pages/index/index", text: "总览" },
      { pagePath: "/pages/calendar/calendar", text: "日历" },
      { pagePath: "/pages/add/add", text: "", center: true },
      { pagePath: "/pages/insights/insights", text: "分析" },
      { pagePath: "/pages/settings/settings", text: "我的" },
    ],
  },

  lifetimes: {
    attached() {
      this.syncSelection();
    },
  },

  pageLifetimes: {
    show() {
      this.syncSelection();
    },
  },

  methods: {
    syncSelection() {
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      const current = pages[pages.length - 1];
      const route = current && current.route ? `/${current.route}` : "";
      const selected = this.data.items.findIndex((item) => item.pagePath === route);
      if (selected >= 0 && selected !== this.data.selected) this.setData({ selected });
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const pagePath = event.currentTarget.dataset.path;
      if (this._switching || index === this.data.selected) return;
      this._switching = true;
      this.setData({ selected: index });
      wx.switchTab({
        url: pagePath,
        complete: () => { this._switching = false; },
      });
    },
  },
});
