(function initContent() {
  const ARTICLE_SELECTOR = 'article[role="article"]';
  const TEXT_SELECTOR = '[data-testid="tweetText"]';
  const NAME_SELECTOR = '[data-testid="User-Name"]';
  const AVATAR_SELECTOR = '[data-testid="Tweet-User-Avatar"]';
  const NON_TEXT_SELECTORS = [
    '[data-testid="tweetPhoto"]',
    '[data-testid="card.wrapper"]',
    '[data-testid="videoComponent"]',
    '[data-testid="videoPlayer"]',
    '[data-testid="previewInterstitial"]',
    '[data-testid="attachments"]',
    '[data-testid="tweet-media"]',
    '[data-testid="media-tweet-card"]',
    '[data-testid="socialContext"]',
    '[role="blockquote"]',
    'article[role="article"] article[role="article"]'
  ];
  const PROCESSED_ATTR = "data-xhb-processed";
  const MASKED_ATTR = "data-xhb-masked";
  const REVEALED_ATTR = "data-xhb-revealed";
  const ACCOUNT_RECORDED_ATTR = "data-xhb-account-recorded";

  let settings = null;
  let observer = null;
  let refreshScheduled = false;
  let blockQueue = Promise.resolve();
  const autoBlockHandles = new Set();
  const MASKED_LABEL = "垃圾评论已屏蔽";

  function setRevealState(article, revealed) {
    const overlay = article.querySelector(".xhb-overlay");
    const button = overlay?.querySelector(".xhb-overlay__button");
    const meta = overlay?.querySelector(".xhb-overlay__meta");

    if (revealed) {
      article.setAttribute(REVEALED_ATTR, "true");
      if (button) {
        button.textContent = "重新屏蔽";
      }
      if (meta) {
        meta.textContent = "已恢复查看";
      }
    } else {
      article.removeAttribute(REVEALED_ATTR);
      if (button) {
        button.textContent = "恢复查看";
      }
      if (meta) {
        meta.textContent = overlay?.dataset.maskLabel || MASKED_LABEL;
      }
    }
  }

  function findTextNode(article) {
    return article.querySelector(TEXT_SELECTOR);
  }

  function extractNodeText(node) {
    if (!node) {
      return "";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (!(node instanceof HTMLElement)) {
      return "";
    }

    if (node.tagName === "IMG") {
      return node.getAttribute("alt") || "";
    }

    if (node.tagName === "BR") {
      return "\n";
    }

    return Array.from(node.childNodes).map((child) => extractNodeText(child)).join("");
  }

  function getNodeText(node) {
    if (!node) {
      return "";
    }

    return extractNodeText(node) || node.innerText || node.textContent || "";
  }

  function getArticleText(article) {
    const textNode = findTextNode(article);
    if (!textNode) {
      return "";
    }

    return getNodeText(textNode);
  }

  function isPureTextArticle(article) {
    const textNode = findTextNode(article);
    if (!textNode) {
      return false;
    }

    return !NON_TEXT_SELECTORS.some((selector) => {
      const matched = article.querySelector(selector);
      return matched && !textNode.contains(matched);
    });
  }

  function getProfileData(article) {
    const nameNode = article.querySelector(NAME_SELECTOR);
    const profileLink = article.querySelector('a[href^="/"][role="link"]');
    const rawText = getNodeText(nameNode);
    const normalized = rawText.replace(/\s+/g, " ").trim();
    const hasEmojiNode = Boolean(
      nameNode?.querySelector('img[alt], img[src*="emoji"], img[src*="twimg"], svg[aria-label*="emoji" i]')
    );

    if (!normalized) {
      return {
        displayName: "",
        handle: "",
        hasEmojiNode
      };
    }

    const linkHandleMatch = profileLink?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})(?:$|[/?#])/);
    const handleMatch = normalized.match(/@([A-Za-z0-9_]+)/);
    const handle = handleMatch ? `@${handleMatch[1]}` : linkHandleMatch ? `@${linkHandleMatch[1]}` : "";
    const displayName = handleMatch
      ? normalized.slice(0, handleMatch.index).trim()
      : normalized;

    return {
      displayName,
      handle,
      hasEmojiNode
    };
  }

  function ensureActionButton(article) {
    let action = article.querySelector(".xhb-manual-action");
    if (action) {
      return action;
    }

    action = document.createElement("button");
    action.type = "button";
    action.className = "xhb-manual-action";
    action.textContent = "屏蔽这条";
    action.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const text = getArticleText(article);
      const profile = getProfileData(article);
      if (!text) {
        return;
      }

      settings = await window.XHB.addCustomFullMatch(text);
      if (!settings) {
        return;
      }

      recordBlockedAccount(article, profile, {
        reason: "manual-block",
        keyword: "手动屏蔽",
        cleanedText: window.XHB.sanitizeForRule(text)
      }, "manual-block");
      applyMask(article, {
        reason: "manual-block",
        cleanedText: window.XHB.sanitizeForRule(text)
      });
    });

    article.appendChild(action);
    return action;
  }

  function ensureRevealOverlay(article, matchResult) {
    let overlay = article.querySelector(".xhb-overlay");
    if (overlay) {
      const label = overlay.querySelector(".xhb-overlay__meta");
      if (label) {
        label.textContent = MASKED_LABEL;
      }
      overlay.dataset.maskLabel = label?.textContent || MASKED_LABEL;
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.className = "xhb-overlay";

    const meta = document.createElement("div");
    meta.className = "xhb-overlay__meta";
    meta.textContent = MASKED_LABEL;
    overlay.dataset.maskLabel = meta.textContent;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "xhb-overlay__button";
    button.textContent = "恢复查看";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const revealed = article.getAttribute(REVEALED_ATTR) === "true";
      setRevealState(article, !revealed);
    });

    overlay.append(meta, button);
    article.appendChild(overlay);
    return overlay;
  }

  function markSensitiveNodes(article) {
    article.querySelectorAll(".xhb-sensitive").forEach((node) => {
      node.classList.remove("xhb-sensitive");
    });

    const selectors = [TEXT_SELECTOR, NAME_SELECTOR, AVATAR_SELECTOR];
    selectors.forEach((selector) => {
      article.querySelectorAll(selector).forEach((node) => {
        node.classList.add("xhb-sensitive");
      });
    });

    if (!article.querySelector(".xhb-sensitive")) {
      Array.from(article.children).forEach((node) => {
        if (!node.classList.contains("xhb-overlay") && !node.classList.contains("xhb-manual-action")) {
          node.classList.add("xhb-sensitive");
        }
      });
    }
  }

  function applyMask(article, matchResult) {
    const isRevealed = article.getAttribute(REVEALED_ATTR) === "true";
    markSensitiveNodes(article);
    ensureRevealOverlay(article, matchResult);
    article.setAttribute(MASKED_ATTR, "true");
    setRevealState(article, isRevealed);
    article.dataset.xhbReason = matchResult.reason;
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  async function recordBlockedAccount(article, profile, matchResult, source) {
    const handle = window.XHB.normalizeHandle(profile.handle);
    if (!handle || article.getAttribute(ACCOUNT_RECORDED_ATTR) === handle) {
      return;
    }

    article.setAttribute(ACCOUNT_RECORDED_ATTR, handle);
    await sendRuntimeMessage({
      type: "XHB_ADD_BLOCKED_ACCOUNT",
      account: {
        handle,
        displayName: profile.displayName,
        reason: matchResult.keyword || matchResult.reason,
        source,
        lastSeen: new Date().toISOString()
      }
    });

    if (settings?.autoBlockAccounts) {
      enqueueAutoBlock(article, handle);
    }
  }

  function enqueueAutoBlock(article, handle) {
    if (!handle || autoBlockHandles.has(handle)) {
      return;
    }

    autoBlockHandles.add(handle);
    blockQueue = blockQueue
      .then(() => autoBlockAccount(article, handle))
      .catch(() => null);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findMenuItem(pattern) {
    return Array.from(document.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"] [role="button"], [data-testid="block"], div[role="menuitem"]')).find((item) => {
      const text = (item.innerText || item.textContent || "").replace(/\s+/g, " ").trim();
      return pattern.test(text);
    });
  }

  function findDialogButton(pattern) {
    return Array.from(document.querySelectorAll('[role="dialog"] [role="button"], [data-testid="confirmationSheetConfirm"], [data-testid="confirmationSheetDialog"] [role="button"]')).find((item) => {
      const text = (item.innerText || item.textContent || "").replace(/\s+/g, " ").trim();
      return pattern.test(text);
    });
  }

  function closeMenu() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }

  async function autoBlockAccount(article, handle) {
    const cleanHandle = handle.replace(/^@/, "");
    const menuButton = article.querySelector('[data-testid="caret"], [aria-label="More"], [aria-label="更多"], [aria-label="もっと見る"], button[aria-label*="More" i]');
    if (!menuButton) {
      return false;
    }

    menuButton.click();
    await wait(500);

    const blockPatterns = [
      new RegExp(`(Block|屏蔽|封锁|ブロック).*@?${cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
      /^(Block|屏蔽|封锁|ブロック)$/i,
      /(Block|屏蔽|封锁|ブロック)/i
    ];

    let blockItem = null;
    for (const pattern of blockPatterns) {
      blockItem = findMenuItem(pattern);
      if (blockItem) break;
    }

    if (!blockItem) {
      closeMenu();
      return false;
    }

    blockItem.click();
    await wait(500);

    const confirmPatterns = [/^(Block|屏蔽|封锁|ブロック)$/i, /(Block|屏蔽|封锁|ブロック)/i];
    let confirmButton = null;
    for (const pattern of confirmPatterns) {
      confirmButton = findDialogButton(pattern);
      if (confirmButton) break;
    }

    if (!confirmButton) {
      closeMenu();
      return false;
    }

    confirmButton.click();

    article.dataset.xhbBlocked = "true";
    var badge = article.querySelector(".xhb-blocked-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "xhb-blocked-badge";
      badge.textContent = "已屏蔽";
      badge.title = handle + " 已自动屏蔽";
      article.style.position = article.style.position || "relative";
      article.appendChild(badge);
    }

    await sendRuntimeMessage({
      type: "XHB_MARK_ACCOUNT_BLOCKED",
      handle
    });
    return true;
  }

  function clearMask(article) {
    article.removeAttribute(MASKED_ATTR);
    article.removeAttribute(REVEALED_ATTR);
    article.removeAttribute("data-xhb-reason");
    article.querySelector(".xhb-overlay")?.remove();
  }

  function processArticle(article) {
    if (!(article instanceof HTMLElement)) {
      return;
    }

    article.setAttribute(PROCESSED_ATTR, "true");
    ensureActionButton(article);

    const text = getArticleText(article);
    const profile = getProfileData(article);
    if (!text && !profile.displayName && !profile.handle && !profile.hasEmojiNode) {
      clearMask(article);
      return;
    }

    if (!isPureTextArticle(article)) {
      clearMask(article);
      return;
    }

    const result = window.XHB.matchTweet(text, settings, profile);
    if (result.matched) {
      recordBlockedAccount(article, profile, result, "auto-detected");
      applyMask(article, result);
    } else {
      clearMask(article);
    }
  }

  function scanPage() {
    if (!settings) {
      return;
    }

    document.querySelectorAll(ARTICLE_SELECTOR).forEach((article) => {
      processArticle(article);
    });
  }

  function scheduleRefresh() {
    if (refreshScheduled) {
      return;
    }

    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      scanPage();
    });
  }

  async function loadSettings() {
    settings = await window.XHB.getSettings();
    scheduleRefresh();
  }

  function startObserver() {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length || mutation.removedNodes.length) {
          scheduleRefresh();
          break;
        }
        if (mutation.type === "characterData") {
          scheduleRefresh();
          break;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[window.XHB.STORAGE_KEY]) {
      return;
    }

    loadSettings();
  });

  loadSettings();
  startObserver();
})();
