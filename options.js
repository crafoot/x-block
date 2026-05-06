(function initOptions() {
  const shortForm = document.getElementById("short-keyword-form");
  const shortInput = document.getElementById("short-keyword-input");

  const defaultTable = document.getElementById("default-table");
  const customShortTable = document.getElementById("custom-short-table");
  const customFullTable = document.getElementById("custom-full-table");
  const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  const defaultCount = document.getElementById("default-count");
  const customShortCount = document.getElementById("custom-short-count");
  const customFullCount = document.getElementById("custom-full-count");

  function createEmptyRow(colspan, text) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = colspan;
    cell.className = "empty-row";
    cell.textContent = text;
    row.appendChild(cell);
    return row;
  }

  function createTypePill(text) {
    const pill = document.createElement("span");
    pill.className = "type-pill";
    pill.textContent = text;
    return pill;
  }

  function createRow(index, text, typeText, onRemove) {
    const row = document.createElement("tr");
    row.id = `row-${index + 1}-${encodeURIComponent(text).slice(0, 12)}`;

    const indexCell = document.createElement("td");
    indexCell.textContent = String(index + 1);

    const wordCell = document.createElement("td");
    wordCell.className = "word-cell";
    wordCell.textContent = text;

    const typeCell = document.createElement("td");
    typeCell.appendChild(createTypePill(typeText));

    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-action";
    button.textContent = "删除";
    button.addEventListener("click", onRemove);
    actionCell.appendChild(button);

    row.append(indexCell, wordCell, typeCell, actionCell);
    return row;
  }

  async function updateSettings(mutator) {
    const settings = await window.XHB.getSettings();
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

    items.forEach((item, index) => {
      root.appendChild(createRow(index, item, typeText, () => onRemove(item)));
    });
  }

  async function render() {
    const settings = await window.XHB.getSettings();

    defaultCount.textContent = String(settings.shortKeywords.length);
    customShortCount.textContent = String(settings.customShortKeywords.length);
    customFullCount.textContent = String(settings.customFullMatches.length);

    renderTable(
      defaultTable,
      settings.shortKeywords,
      "内置短词",
      async (keyword) => {
        await updateSettings((draft) => {
          draft.shortKeywords = draft.shortKeywords.filter((item) => item !== keyword);
        });
      },
      "暂无内置短词"
    );

    renderTable(
      customShortTable,
      settings.customShortKeywords,
      "自定义短词",
      async (keyword) => {
        await updateSettings((draft) => {
          draft.customShortKeywords = draft.customShortKeywords.filter((item) => item !== keyword);
        });
      },
      "暂无自定义短词"
    );

    renderTable(
      customFullTable,
      settings.customFullMatches,
      "整句词库",
      async (sentence) => {
        await updateSettings((draft) => {
          draft.customFullMatches = draft.customFullMatches.filter((item) => item !== sentence);
        });
      },
      "暂无整句词库"
    );
  }

  function activateTab(group) {
    tabButtons.forEach((button) => {
      const active = button.dataset.group === group;
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });

    tabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.groupPanel !== group;
    });
  }

  shortForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cleaned = window.XHB.sanitizeForRule(shortInput.value.trim());
    if (!cleaned) {
      return;
    }

    await updateSettings((draft) => {
      draft.customShortKeywords = Array.from(new Set([...draft.customShortKeywords, cleaned]));
    });
    shortInput.value = "";
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[window.XHB.STORAGE_KEY]) {
      render();
    }
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.group);
    });
  });

  render().then(() => {
    const group = new URLSearchParams(window.location.search).get("group");
    activateTab(group || "default");
  });
})();
