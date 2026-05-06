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

  function openOptions(group) {
    const url = chrome.runtime.getURL(`options.html?group=${encodeURIComponent(group)}`);
    window.open(url, "_blank");
  }

  function bindOpenMore(button, count) {
    if (count > PREVIEW_LIMIT) {
      button.hidden = false;
      button.onclick = () => openOptions(button.dataset.group);
    } else {
      button.hidden = true;
      button.onclick = null;
    }
  }

  function createChip(text, onRemove) {
    const chip = document.createElement("div");
    chip.className = "chip";

    const label = document.createElement("span");
    label.className = "chip__label";
    label.textContent = text;
    chip.appendChild(label);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip__remove";
    button.setAttribute("aria-label", `删除 ${text}`);
    button.textContent = "×";
    button.addEventListener("click", onRemove);
    chip.appendChild(button);

    return chip;
  }

  function createEmptyState(text) {
    const empty = document.createElement("div");
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

    items.slice(0, PREVIEW_LIMIT).forEach((item) => {
      root.appendChild(createChip(item, () => onRemove(item)));
    });
  }

  async function updateSettings(mutator) {
    const settings = await window.XHB.getSettings();
    mutator(settings);
    await window.XHB.saveSettings(settings);
    await render();
  }

  async function render() {
    const settings = await window.XHB.getSettings();

    defaultCount.textContent = String(settings.shortKeywords.length);
    customShortCount.textContent = String(settings.customShortKeywords.length);
    customFullCount.textContent = String(settings.customFullMatches.length);

    bindOpenMore(defaultOpenMore, settings.shortKeywords.length);
    bindOpenMore(customShortOpenMore, settings.customShortKeywords.length);
    bindOpenMore(customFullOpenMore, settings.customFullMatches.length);

    renderPreview(
      defaultKeywordsRoot,
      settings.shortKeywords,
      async (keyword) => {
        await updateSettings((draft) => {
          draft.shortKeywords = draft.shortKeywords.filter((item) => item !== keyword);
        });
      },
      "还没有内置短词。"
    );

    renderPreview(
      customShortRoot,
      settings.customShortKeywords,
      async (keyword) => {
        await updateSettings((draft) => {
          draft.customShortKeywords = draft.customShortKeywords.filter((item) => item !== keyword);
        });
      },
      "还没有自定义短词。"
    );

    renderPreview(
      customFullRoot,
      settings.customFullMatches,
      async (sentence) => {
        await updateSettings((draft) => {
          draft.customFullMatches = draft.customFullMatches.filter((item) => item !== sentence);
        });
      },
      "还没有整句词库。页面上手动点“屏蔽这条”后，会自动把整句写到这里。"
    );
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

  render();
})();
