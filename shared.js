(function initShared(global) {
  const STORAGE_KEY = "xhb-settings";
  const DEFAULT_SHORT_KEYWORDS = [
    "哥哥",
    "弟弟",
    "主人",
    "小狗",
    "抱抱",
    "单身哥哥",
    "单身弟弟",
    "求主人",
    "会疼人",
    "领我",
    "认识吗",
    "快来领我"
  ];

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function stripEmoji(text) {
    return text
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/[\u{2600}-\u{27BF}]/gu, "")
      .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "");
  }

  function containsEmoji(text) {
    return /[\p{Extended_Pictographic}\uFE0F]/u.test(text || "");
  }

  function sanitizeForRule(text) {
    return normalizeWhitespace(stripEmoji(text)).replace(/[^\p{Script=Han}\p{Letter}\p{Number} ]/gu, "");
  }

  function hasChinese(text) {
    return /[\u4e00-\u9fff]/.test(text);
  }

  function countChineseAwareLength(text) {
    return normalizeWhitespace(text).replace(/\s/g, "").length;
  }

  function createDefaultSettings() {
    return {
      shortKeywords: [...DEFAULT_SHORT_KEYWORDS],
      customShortKeywords: [],
      customFullMatches: []
    };
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const merged = {
      ...createDefaultSettings(),
      ...(stored[STORAGE_KEY] || {})
    };

    merged.shortKeywords = Array.from(new Set(merged.shortKeywords.filter(Boolean)));
    merged.customShortKeywords = Array.from(new Set(merged.customShortKeywords.filter(Boolean)));
    merged.customFullMatches = Array.from(new Set(merged.customFullMatches.filter(Boolean)));

    return merged;
  }

  async function saveSettings(settings) {
    const normalized = {
      shortKeywords: Array.from(new Set((settings.shortKeywords || []).map((item) => normalizeWhitespace(item)).filter(Boolean))),
      customShortKeywords: Array.from(new Set((settings.customShortKeywords || []).map((item) => normalizeWhitespace(item)).filter(Boolean))),
      customFullMatches: Array.from(new Set((settings.customFullMatches || []).map((item) => normalizeWhitespace(item)).filter(Boolean)))
    };

    await chrome.storage.local.set({
      [STORAGE_KEY]: normalized
    });

    return normalized;
  }

  async function addCustomFullMatch(text) {
    const cleaned = sanitizeForRule(text);
    if (!cleaned) {
      return null;
    }

    const settings = await getSettings();
    settings.customFullMatches = Array.from(new Set([...settings.customFullMatches, cleaned]));
    return saveSettings(settings);
  }

  function buildKeywordList(settings) {
    return [...settings.shortKeywords, ...settings.customShortKeywords]
      .map((item) => normalizeWhitespace(item))
      .filter(Boolean);
  }

  function matchText(rawText, settings) {
    const cleaned = sanitizeForRule(rawText);
    const normalized = normalizeWhitespace(cleaned);

    if (!normalized || !hasChinese(normalized)) {
      return {
        matched: false,
        reason: "not-chinese",
        cleanedText: normalized
      };
    }

    if (countChineseAwareLength(normalized) > 20) {
      return {
        matched: false,
        reason: "too-long",
        cleanedText: normalized
      };
    }

    const fullMatch = (settings.customFullMatches || []).find((entry) => normalized === entry);
    if (fullMatch) {
      return {
        matched: true,
        reason: "custom-full-match",
        keyword: fullMatch,
        cleanedText: normalized
      };
    }

    const keyword = buildKeywordList(settings).find((entry) => normalized.includes(entry));
    if (keyword) {
      return {
        matched: true,
        reason: "keyword",
        keyword,
        cleanedText: normalized
      };
    }

    return {
      matched: false,
      reason: "no-keyword",
      cleanedText: normalized
    };
  }

  function matchProfile(displayName, handle, hasEmojiNode = false) {
    const normalizedName = normalizeWhitespace(displayName || "");
    const normalizedHandle = normalizeWhitespace(handle || "").replace(/^@/, "");

    if (!normalizedHandle) {
      return {
        matched: false,
        reason: "missing-profile"
      };
    }

    if (!hasEmojiNode && !containsEmoji(normalizedName)) {
      return {
        matched: false,
        reason: "no-emoji-name"
      };
    }

    if (!/\d{4,}$/.test(normalizedHandle)) {
      return {
        matched: false,
        reason: "handle-not-numeric-tail"
      };
    }

    return {
      matched: true,
      reason: "emoji-number-id",
      keyword: "昵称含 emoji + 数字ID",
      cleanedText: normalizedHandle
    };
  }

  function matchTweet(rawText, settings, profile = {}) {
    const profileMatch = matchProfile(profile.displayName, profile.handle, profile.hasEmojiNode);
    if (profileMatch.matched) {
      return profileMatch;
    }

    return matchText(rawText, settings);
  }

  global.XHB = {
    DEFAULT_SHORT_KEYWORDS,
    STORAGE_KEY,
    containsEmoji,
    createDefaultSettings,
    getSettings,
    saveSettings,
    addCustomFullMatch,
    sanitizeForRule,
    matchProfile,
    matchText,
    matchTweet
  };
})(window);
