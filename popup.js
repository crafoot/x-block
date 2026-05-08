(function initPopup() {
  const PREVIEW_LIMIT = 10;
  const shortForm = document.getElementById("short-keyword-form");
  const shortInput = document.getElementById("short-keyword-input");

  const defaultKeywordsRoot = document.getElementById("default-keywords");
  const customShortRoot = document.getElementById("custom-short-keywords");
  const customFullRoot = document.getElementById("custom-full-matches");

  const defaultCount = document.getElementById("default-count");
  const customShortCount = document.getElementById("custom-short-count");
  const customFullCount = document.getElementById("custom-full-count");

  const defaultOpenMore = document.getElementById("default-open-more");
  const customShortOpenMore = document.getElementById("custom-short-open-more");
  const customFullOpenMore = document.getElementById("custom-full-open-more");

  const accountTotalCount = document.getElementById("account-total-count");
  const accountBlockedCount = document.getElementById("account-blocked-count");
  const accountSyncTime = document.getElementById("account-sync-time");
  const btnExport = document.getElementById("btn-export");
  const btnImport = document.getElementById("btn-import");
  const btnSync = document.getElementById("btn-sync");
  const importFileInput = document.getElementById("import-file-input");

  function openOptions(group) {
    const url = chrome.runtime.getURL("options.html" + (group ? "?group=" + encodeURIComponent(group) : ""));
    window.open(url, "_blank");
  }

  function bindOpenMore(button, count) {
    if (count > PREVIEW_LIMIT) {
      button.hidden = false;
      button.onclick = function () { openOptions(button.dataset.group); };
    } else {
      button.hidden = true;
      button.onclick = null;
    }
  }

  function createChip(text, onRemove) {
    const chip = document.createElement("div");
    chip.className = "chip";
    var label = document.createElement("span");
    label.className = "chip__label";
    label.textContent = text;
    chip.appendChild(label);
    var button = document.createElement("button");
    button.type = "button";
    button.className = "chip__remove";
    button.setAttribute("aria-label", "删除 " + text);
    button.textContent = "×";
    button.addEventListener("click", onRemove);
    chip.appendChild(button);
    return chip;
  }

  function createEmptyState(text) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = text;
    return empty;
  }

  function renderPreview(root, items, onRemove, emptyText) {
    root.innerHTML = "";
    if (items.length === 0) {
      root.appendChild(createEmptyState(emptyText));
      return;
    }
    items.slice(0, PREVIEW_LIMIT).forEach(function (item) {
      root.appendChild(createChip(item, function () { onRemove(item); }));
    });
  }

  async function updateSettings(mutator) {
    var settings = await window.XHB.getSettings();
    mutator(settings);
    await window.XHB.saveSettings(settings);
    await render();
  }

  function formatTime(isoString) {
    if (!isoString) return "-";
    var d = new Date(isoString);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return diffMin + "分钟前";
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + "小时前";
    var diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return diffDay + "天前";
    return d.toLocaleDateString("zh-CN");
  }

  async function renderAccountStats() {
    try {
      var resp = await new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: "XHB_GET_ACCOUNT_DATABASE" }, function (r) { resolve(r); });
      });
      if (!resp || !resp.ok) {
        accountTotalCount.textContent = "0";
        accountBlockedCount.textContent = "0";
        accountSyncTime.textContent = "-";
        return;
      }
      var accounts = resp.database.accounts || {};
      var total = Object.keys(accounts).length;
      var blocked = Object.values(accounts).filter(function (a) { return a.blocked; }).length;
      accountTotalCount.textContent = String(total);
      accountBlockedCount.textContent = String(blocked);
      var settings = await window.XHB.getSettings();
      accountSyncTime.textContent = formatTime(settings.lastRemoteSyncAt);
    } catch (e) {
      accountTotalCount.textContent = "-";
      accountBlockedCount.textContent = "-";
    }
  }

  async function handleExport() {
    var resp = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: "XHB_EXPORT_DATABASE" }, function (r) { resolve(r); });
    });
    if (!resp || !resp.ok) {
      alert("导出失败: " + (resp && resp.error ? resp.error : "未知错误"));
      return;
    }
    var blob = new Blob([resp.data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "x-block-accounts-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file) {
    var text = await file.text();
    var resp = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: "XHB_IMPORT_DATABASE",
        data: text,
        source: "import-" + file.name
      }, function (r) { resolve(r); });
    });
    if (!resp || !resp.ok) {
      alert("导入失败: " + (resp && resp.error ? resp.error : "未知错误"));
      return;
    }
    alert("导入成功！合并了 " + resp.count + " 个账号。\n已导入的账号在浏览时遇到评论会自动屏蔽。");
    await renderAccountStats();
  }

  async function handleSync() {
    btnSync.disabled = true;
    btnSync.textContent = "⏳ 同步中...";
    try {
      var resp = await new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: "XHB_SYNC_REMOTE_DATABASE" }, function (r) { resolve(r); });
      });
      if (resp && resp.ok) {
        var results = resp.result || [];
        var msgs = results.map(function (r) {
          if (r.error) return r.source + ": " + r.error;
          if (r.count !== undefined) return r.source + ": " + r.count + " 个账号";
          return r.source + ": " + (r.synced ? "已同步" : r.reason);
        });
        alert("同步完成！\n" + msgs.join("\n"));
      } else {
        alert("同步失败: " + (resp && resp.error ? resp.error : "未知错误"));
      }
    } catch (e) {
      alert("同步出错: " + e.message);
    }
    btnSync.disabled = false;
    btnSync.textContent = "🔄 立即同步";
    await renderAccountStats();
  }

  async function render() {
    var settings = await window.XHB.getSettings();

    defaultCount.textContent = String(settings.shortKeywords.length);
    customShortCount.textContent = String(settings.customShortKeywords.length);
    customFullCount.textContent = String(settings.customFullMatches.length);

    bindOpenMore(defaultOpenMore, settings.shortKeywords.length);
    bindOpenMore(customShortOpenMore, settings.customShortKeywords.length);
    bindOpenMore(customFullOpenMore, settings.customFullMatches.length);

    renderPreview(defaultKeywordsRoot, settings.shortKeywords, async function (keyword) {
      await updateSettings(function (draft) {
        draft.shortKeywords = draft.shortKeywords.filter(function (item) { return item !== keyword; });
      });
    }, "还没有内置短词。");

    renderPreview(customShortRoot, settings.customShortKeywords, async function (keyword) {
      await updateSettings(function (draft) {
        draft.customShortKeywords = draft.customShortKeywords.filter(function (item) { return item !== keyword; });
      });
    }, "还没有自定义短词。");

    renderPreview(customFullRoot, settings.customFullMatches, async function (sentence) {
      await updateSettings(function (draft) {
        draft.customFullMatches = draft.customFullMatches.filter(function (item) { return item !== sentence; });
      });
    }, "还没有整句词库。页面上手动点屏蔽这条后，会自动把整句写到这里。");

    await renderAccountStats();
  }

  shortForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var cleaned = window.XHB.sanitizeForRule(shortInput.value.trim());
    if (!cleaned) return;
    await updateSettings(function (draft) {
      draft.customShortKeywords = Array.from(new Set(draft.customShortKeywords.concat([cleaned])));
    });
    shortInput.value = "";
  });

  btnExport.addEventListener("click", handleExport);
  btnImport.addEventListener("click", function () { importFileInput.click(); });
  btnSync.addEventListener("click", handleSync);

  importFileInput.addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (file) {
      handleImport(file);
      importFileInput.value = "";
    }
  });

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === "local" && (changes[window.XHB.STORAGE_KEY] || changes[window.XHB.ACCOUNT_DATABASE_KEY])) {
      render();
    }
  });

  render();
})();
