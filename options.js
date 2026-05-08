(function initOptions() {
  var shortForm = document.getElementById("short-keyword-form");
  var shortInput = document.getElementById("short-keyword-input");

  var defaultTable = document.getElementById("default-table");
  var customShortTable = document.getElementById("custom-short-table");
  var customFullTable = document.getElementById("custom-full-table");
  var accountsTable = document.getElementById("accounts-table");
  var tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  var tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  var defaultCount = document.getElementById("default-count");
  var customShortCount = document.getElementById("custom-short-count");
  var customFullCount = document.getElementById("custom-full-count");
  var accountCount = document.getElementById("account-count");

  var accountsTotal = document.getElementById("accounts-total");
  var accountsBlocked = document.getElementById("accounts-blocked");
  var accountsSynced = document.getElementById("accounts-synced");
  var btnSync = document.getElementById("btn-sync");
  var btnExport = document.getElementById("btn-export");
  var btnImport = document.getElementById("btn-import");
  var importFileInput = document.getElementById("import-file-input");
  var autoSyncToggle = document.getElementById("auto-sync-toggle");
  var autoBlockToggle = document.getElementById("auto-block-toggle");
  var externalSourceForm = document.getElementById("external-source-form");
  var externalSourceInput = document.getElementById("external-source-input");
  var externalSourcesList = document.getElementById("external-sources-list");

  function createEmptyRow(colspan, text) {
    var row = document.createElement("tr");
    var cell = document.createElement("td");
    cell.colSpan = colspan;
    cell.className = "empty-row";
    cell.textContent = text;
    row.appendChild(cell);
    return row;
  }

  function createTypePill(text) {
    var pill = document.createElement("span");
    pill.className = "type-pill";
    pill.textContent = text;
    return pill;
  }

  function createRow(index, text, typeText, onRemove) {
    var row = document.createElement("tr");
    row.id = "row-" + (index + 1) + "-" + encodeURIComponent(text).slice(0, 12);
    var indexCell = document.createElement("td");
    indexCell.textContent = String(index + 1);
    var wordCell = document.createElement("td");
    wordCell.className = "word-cell";
    wordCell.textContent = text;
    var typeCell = document.createElement("td");
    typeCell.appendChild(createTypePill(typeText));
    var actionCell = document.createElement("td");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "row-action";
    button.textContent = "删除";
    button.addEventListener("click", onRemove);
    actionCell.appendChild(button);
    row.append(indexCell, wordCell, typeCell, actionCell);
    return row;
  }

  function createAccountRow(account, index) {
    var row = document.createElement("tr");
    var handleCell = document.createElement("td");
    handleCell.className = "word-cell";
    handleCell.textContent = account.handle;
    var nameCell = document.createElement("td");
    nameCell.textContent = account.displayName || "-";
    nameCell.style.maxWidth = "120px";
    nameCell.style.overflow = "hidden";
    nameCell.style.textOverflow = "ellipsis";
    nameCell.style.whiteSpace = "nowrap";
    var reasonsCell = document.createElement("td");
    reasonsCell.textContent = (account.reasons || []).join(", ") || "-";
    reasonsCell.style.maxWidth = "140px";
    reasonsCell.style.overflow = "hidden";
    reasonsCell.style.textOverflow = "ellipsis";
    reasonsCell.style.whiteSpace = "nowrap";
    reasonsCell.style.fontSize = "12px";
    var sourcesCell = document.createElement("td");
    sourcesCell.textContent = (account.sources || []).join(", ") || "-";
    sourcesCell.style.fontSize = "12px";
    var statusCell = document.createElement("td");
    if (account.blocked) {
      statusCell.appendChild(createTypePill("已屏蔽"));
    } else {
      var pill = document.createElement("span");
      pill.className = "type-pill";
      pill.style.background = "rgba(83, 100, 113, 0.1)";
      pill.style.color = "#536471";
      pill.textContent = "未屏蔽";
      statusCell.appendChild(pill);
    }
    var seenCell = document.createElement("td");
    seenCell.textContent = formatShortDate(account.lastSeen || account.firstSeen);
    seenCell.style.fontSize = "12px";
    seenCell.style.color = "var(--ink-2)";
    row.append(handleCell, nameCell, reasonsCell, sourcesCell, statusCell, seenCell);
    return row;
  }

  function formatShortDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    return d.toLocaleDateString("zh-CN") + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function createExternalSourceRow(url, onRemove) {
    var div = document.createElement("div");
    div.className = "external-source-row";
    var span = document.createElement("span");
    span.textContent = url;
    span.className = "external-source-url";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-action";
    btn.textContent = "删除";
    btn.addEventListener("click", function () { onRemove(url); });
    div.append(span, btn);
    return div;
  }

  async function updateSettings(mutator) {
    var settings = await window.XHB.getSettings();
    mutator(settings);
    await window.XHB.saveSettings(settings);
    await render();
  }

  function renderTable(root, items, typeText, onRemove, emptyText) {
    root.innerHTML = "";
    if (items.length === 0) {
      root.appendChild(createEmptyRow(4, emptyText));
      return;
    }
    items.forEach(function (item, index) {
      root.appendChild(createRow(index, item, typeText, function () { onRemove(item); }));
    });
  }

  async function renderAccountTable() {
    accountsTable.innerHTML = "";
    var resp = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: "XHB_GET_ACCOUNT_DATABASE" }, function (r) { resolve(r); });
    });
    if (!resp || !resp.ok) {
      accountsTable.appendChild(createEmptyRow(6, "暂无账号数据"));
      accountsTotal.textContent = "0";
      accountsBlocked.textContent = "0";
      return;
    }
    var db = resp.database;
    var accounts = db.accounts || {};
    var entries = Array.isArray(accounts) ? accounts : Object.values(accounts);
    entries.sort(function (a, b) { return (b.lastSeen || b.firstSeen || "").localeCompare(a.lastSeen || a.firstSeen || ""); });

    accountsTotal.textContent = String(entries.length);
    var blockedCount = entries.filter(function (a) { return a.blocked; }).length;
    accountsBlocked.textContent = String(blockedCount);
    accountCount.textContent = String(entries.length);

    var settings = await window.XHB.getSettings();
    accountsSynced.textContent = settings.lastRemoteSyncAt ? formatShortDate(settings.lastRemoteSyncAt) : "从未同步";

    if (entries.length === 0) {
      accountsTable.appendChild(createEmptyRow(6, "暂无账号数据。浏览 X 时检测到黄评会自动登记。"));
      return;
    }
    entries.forEach(function (acc, index) {
      accountsTable.appendChild(createAccountRow(acc, index));
    });
  }

  function renderExternalSources(settings) {
    externalSourcesList.innerHTML = "";
    if (!settings.externalSources || settings.externalSources.length === 0) {
      externalSourcesList.innerHTML = "<div class='empty-state'>暂无外部数据源</div>";
      return;
    }
    settings.externalSources.forEach(function (url) {
      externalSourcesList.appendChild(createExternalSourceRow(url, async function (urlToRemove) {
        await updateSettings(function (draft) {
          draft.externalSources = draft.externalSources.filter(function (u) { return u !== urlToRemove; });
        });
      }));
    });
  }

  async function render() {
    var settings = await window.XHB.getSettings();

    defaultCount.textContent = String(settings.shortKeywords.length);
    customShortCount.textContent = String(settings.customShortKeywords.length);
    customFullCount.textContent = String(settings.customFullMatches.length);

    autoSyncToggle.checked = settings.autoSyncEnabled !== false;
    autoBlockToggle.checked = settings.autoBlockAccounts !== false;

    renderTable(defaultTable, settings.shortKeywords, "内置短词", async function (keyword) {
      await updateSettings(function (draft) {
        draft.shortKeywords = draft.shortKeywords.filter(function (item) { return item !== keyword; });
      });
    }, "暂无内置短词");

    renderTable(customShortTable, settings.customShortKeywords, "自定义短词", async function (keyword) {
      await updateSettings(function (draft) {
        draft.customShortKeywords = draft.customShortKeywords.filter(function (item) { return item !== keyword; });
      });
    }, "暂无自定义短词");

    renderTable(customFullTable, settings.customFullMatches, "整句词库", async function (sentence) {
      await updateSettings(function (draft) {
        draft.customFullMatches = draft.customFullMatches.filter(function (item) { return item !== sentence; });
      });
    }, "暂无整句词库");

    await renderAccountTable();
    renderExternalSources(settings);
  }

  function activateTab(group) {
    tabButtons.forEach(function (button) {
      var active = button.dataset.group === group;
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    tabPanels.forEach(function (panel) {
      panel.hidden = panel.dataset.groupPanel !== group;
    });
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

  externalSourceForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var url = externalSourceInput.value.trim();
    if (!url) return;
    await updateSettings(function (draft) {
      draft.externalSources = Array.from(new Set((draft.externalSources || []).concat([url])));
    });
    externalSourceInput.value = "";
  });

  autoSyncToggle.addEventListener("change", async function () {
    await updateSettings(function (draft) {
      draft.autoSyncEnabled = autoSyncToggle.checked;
    });
  });

  autoBlockToggle.addEventListener("change", async function () {
    await updateSettings(function (draft) {
      draft.autoBlockAccounts = autoBlockToggle.checked;
    });
  });

  btnExport.addEventListener("click", async function () {
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
  });

  btnImport.addEventListener("click", function () { importFileInput.click(); });

  importFileInput.addEventListener("change", async function (event) {
    var file = event.target.files[0];
    if (!file) return;
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
    } else {
      alert("导入成功！合并了 " + resp.count + " 个账号。");
    }
    importFileInput.value = "";
    await render();
  });

  btnSync.addEventListener("click", async function () {
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
    btnSync.textContent = "🔄 同步";
    await render();
  });

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === "local" && changes[window.XHB.STORAGE_KEY]) {
      render();
    }
  });

  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      activateTab(button.dataset.group);
      if (button.dataset.group === "accounts") {
        renderAccountTable();
      }
    });
  });

  render().then(function () {
    var group = new URLSearchParams(window.location.search).get("group");
    activateTab(group || "default");
    if (group === "accounts") {
      renderAccountTable();
    }
  });
})();
