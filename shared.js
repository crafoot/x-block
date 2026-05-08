(function initShared(global) {
  const STORAGE_KEY = "xhb-settings";
  const ACCOUNT_DATABASE_KEY = "xhb-account-database";
  const DEFAULT_REMOTE_DATABASE_URL = "https://raw.githubusercontent.com/crafoot/x-block/main/data/accounts.json";
  const DEFAULT_EXTERNAL_SOURCES = [
    "https://raw.githubusercontent.com/ammar-faifi/xblocker/main/data.json",
    "https://raw.githubusercontent.com/ammar-faifi/xblocker/main/data.txt"
  ];
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
    "快来领我",
    "约p",
    "同城",
    "骚货",
    "打✈️",
    "好涩",
    "她骚",
    "她sao",
    "sao货",
    "真人",
    "谁来"
  ];
  const PROFILE_BLOCK_KEYWORDS = ["约炮", "同城", "免费", "破处", "约p", "主页", "附近"];

  const ENGLISH_SPAM_KEYWORDS = [
    "i miss your",
    "i miss the",
    "warmth of your love",
    "kept me safe",
    "my everything",
    "more than i deserved",
    "world feels empty",
    "without you by my side",
    "always love you",
    "no matter what happens",
    "you were my home",
    "lost without you",
    "stars remind me",
    "night we met",
    "dream of you",
    "every night",
    "search for you",
    "i miss your laugh",
    "your love that",
    "feel your touch"
  ];

  const SPAM_DECORATIVE_UNICODE = /[\u2B1C-\u2BFF\u27C0-\u27EF\u2900-\u297F\u2980-\u29FF\u24EA-\u24FF\u2776-\u2793\u2B50\u2726\u2727\u2730\u2736\u2737\u2738\u2739\u273A\u273B\u273C\u273D\u273E\u273F\u2740\u2741\u2742\u2743\u2744\u2745\u2746\u2747\u2748\u2749\u274A\u274B]/u;

  function isRandomBotName(text) {
    const cleaned = (text || "").toLowerCase().replace(/[^a-z]/g, "");
    if (cleaned.length < 4 || cleaned.length > 8) return false;

    // Exclude names containing common English consonant digraphs
    if (/ck|th|sh|ch|ph|wh|qu|ng|gh|dg|mb|bb|cc|dd|ff|gg|ll|mm|nn|pp|rr|ss|tt|zz/.test(cleaned)) return false;

    // 3+ consecutive consonants = strong bot signal
    if (/[^aeiou]{3,}/.test(cleaned)) return true;

    const vowels = (cleaned.match(/[aeiou]/g) || []).length;
    const consonants = cleaned.length - vowels;

    // Very few vowels (0-1) with 4+ consonants
    if (vowels <= 1 && consonants >= 4) return true;

    // High consonant density
    if (vowels === 0) return consonants >= 4;
    return consonants / vowels >= 3.0;
  }

  function containsEnglishSpam(text) {
    const lower = (text || "").toLowerCase();
    return ENGLISH_SPAM_KEYWORDS.some(function (kw) { return lower.includes(kw); });
  }

  function containsSpamDecorative(text) {
    return SPAM_DECORATIVE_UNICODE.test(text || "");
  }

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function containsEmoji(text) {
    return /[\p{Extended_Pictographic}\uFE0F]/u.test(text || "");
  }

  function containsBlockedProfileEmoji(text) {
    return (text || "").includes("🌸");
  }

  function findBlockedProfileKeyword(text) {
    const normalized = normalizeWhitespace(text || "");
    return PROFILE_BLOCK_KEYWORDS.find((keyword) => normalized.includes(keyword)) || "";
  }

  function sanitizeForRule(text) {
    return normalizeWhitespace(text || "").replace(/[^\p{Script=Han}\p{Letter}\p{Number}\p{Symbol}\p{Extended_Pictographic}\uFE0F\u200D ]/gu, "");
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
      customFullMatches: [],
      autoBlockAccounts: true,
      autoSyncEnabled: true,
      remoteDatabaseUrl: DEFAULT_REMOTE_DATABASE_URL,
      lastRemoteSyncAt: "",
      externalSources: [...DEFAULT_EXTERNAL_SOURCES]
    };
  }

  function createDefaultAccountDatabase() {
    return {
      version: 1,
      updatedAt: "",
      accounts: {}
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
    merged.autoBlockAccounts = merged.autoBlockAccounts !== false;
    merged.autoSyncEnabled = merged.autoSyncEnabled !== false;
    merged.remoteDatabaseUrl = normalizeWhitespace(merged.remoteDatabaseUrl || DEFAULT_REMOTE_DATABASE_URL);
    merged.lastRemoteSyncAt = merged.lastRemoteSyncAt || "";
    merged.externalSources = Array.from(new Set((merged.externalSources || DEFAULT_EXTERNAL_SOURCES).filter(Boolean)));

    return merged;
  }

  async function saveSettings(settings) {
    const normalized = {
      shortKeywords: Array.from(new Set((settings.shortKeywords || []).map((item) => normalizeWhitespace(item)).filter(Boolean))),
      customShortKeywords: Array.from(new Set((settings.customShortKeywords || []).map((item) => normalizeWhitespace(item)).filter(Boolean))),
      customFullMatches: Array.from(new Set((settings.customFullMatches || []).map((item) => normalizeWhitespace(item)).filter(Boolean))),
      autoBlockAccounts: settings.autoBlockAccounts !== false,
      autoSyncEnabled: settings.autoSyncEnabled !== false,
      remoteDatabaseUrl: normalizeWhitespace(settings.remoteDatabaseUrl || DEFAULT_REMOTE_DATABASE_URL),
      lastRemoteSyncAt: settings.lastRemoteSyncAt || "",
      externalSources: Array.from(new Set((settings.externalSources || DEFAULT_EXTERNAL_SOURCES).filter(Boolean)))
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

  function normalizeHandle(handle) {
    const match = String(handle || "").match(/@?([A-Za-z0-9_]{1,15})/);
    return match ? `@${match[1].toLowerCase()}` : "";
  }

  function normalizeAccountInput(account = {}) {
    const handle = normalizeHandle(account.handle || account.screenName || account.username);
    if (!handle) {
      return null;
    }

    const now = new Date().toISOString();
    const reasons = Array.from(new Set([...(account.reasons || []), account.reason].filter(Boolean).map(String)));
    const sources = Array.from(new Set([...(account.sources || []), account.source].filter(Boolean).map(String)));

    return {
      handle,
      displayName: normalizeWhitespace(account.displayName || account.name || ""),
      reasons,
      sources,
      firstSeen: account.firstSeen || now,
      lastSeen: account.lastSeen || now,
      lastBlockedAt: account.lastBlockedAt || "",
      blocked: account.blocked === true,
      blockAttempts: Number(account.blockAttempts || 0)
    };
  }

  function normalizeAccountDatabase(database) {
    const normalized = createDefaultAccountDatabase();
    const sourceAccounts = database?.accounts || database || {};
    const entries = Array.isArray(sourceAccounts)
      ? sourceAccounts
      : Object.entries(sourceAccounts).map(([handle, value]) => ({
          handle,
          ...(typeof value === "object" && value ? value : {})
        }));

    entries.forEach((entry) => {
      const account = normalizeAccountInput(entry);
      if (account) {
        normalized.accounts[account.handle] = account;
      }
    });

    normalized.updatedAt = database?.updatedAt || "";
    return normalized;
  }

  function mergeAccountRecords(existing, incoming) {
    const left = normalizeAccountInput(existing) || {};
    const right = normalizeAccountInput(incoming);
    if (!right) {
      return left.handle ? left : null;
    }

    const now = new Date().toISOString();
    return {
      handle: right.handle,
      displayName: right.displayName || left.displayName || "",
      reasons: Array.from(new Set([...(left.reasons || []), ...(right.reasons || [])])),
      sources: Array.from(new Set([...(left.sources || []), ...(right.sources || [])])),
      firstSeen: [left.firstSeen, right.firstSeen].filter(Boolean).sort()[0] || now,
      lastSeen: [left.lastSeen, right.lastSeen, now].filter(Boolean).sort().at(-1),
      lastBlockedAt: [left.lastBlockedAt, right.lastBlockedAt].filter(Boolean).sort().at(-1) || "",
      blocked: Boolean(left.blocked || right.blocked),
      blockAttempts: Math.max(Number(left.blockAttempts || 0), Number(right.blockAttempts || 0))
    };
  }

  async function getAccountDatabase() {
    const stored = await chrome.storage.local.get(ACCOUNT_DATABASE_KEY);
    return normalizeAccountDatabase(stored[ACCOUNT_DATABASE_KEY] || createDefaultAccountDatabase());
  }

  async function saveAccountDatabase(database) {
    const normalized = normalizeAccountDatabase(database);
    normalized.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({
      [ACCOUNT_DATABASE_KEY]: normalized
    });
    return normalized;
  }

  async function addBlockedAccount(account) {
    const incoming = normalizeAccountInput(account);
    if (!incoming) {
      return null;
    }

    const database = await getAccountDatabase();
    database.accounts[incoming.handle] = mergeAccountRecords(database.accounts[incoming.handle], incoming);
    return saveAccountDatabase(database);
  }

  async function markAccountBlocked(handle) {
    const normalizedHandle = normalizeHandle(handle);
    if (!normalizedHandle) {
      return null;
    }

    const database = await getAccountDatabase();
    const record = mergeAccountRecords(database.accounts[normalizedHandle], {
      handle: normalizedHandle,
      blocked: true,
      lastBlockedAt: new Date().toISOString(),
      source: "x-auto-block"
    });
    record.blockAttempts = Number(record.blockAttempts || 0) + 1;
    record.blocked = true;
    record.lastBlockedAt = new Date().toISOString();
    database.accounts[normalizedHandle] = record;
    return saveAccountDatabase(database);
  }

  function parseAccountDatabase(text) {
    return normalizeAccountDatabase(JSON.parse(text));
  }

  async function mergeAccountDatabase(incomingDatabase, source = "import") {
    const current = await getAccountDatabase();
    const incoming = normalizeAccountDatabase(incomingDatabase);
    Object.values(incoming.accounts).forEach((account) => {
      current.accounts[account.handle] = mergeAccountRecords(current.accounts[account.handle], {
        ...account,
        source
      });
    });
    return saveAccountDatabase(current);
  }

  function exportAccountDatabase(database) {
    const normalized = normalizeAccountDatabase(database);
    return JSON.stringify(
      {
        version: normalized.version,
        updatedAt: normalized.updatedAt,
        accounts: Object.values(normalized.accounts).sort((a, b) => a.handle.localeCompare(b.handle))
      },
      null,
      2
    );
  }

  function buildKeywordList(settings) {
    return [...settings.shortKeywords, ...settings.customShortKeywords]
      .map((item) => sanitizeForRule(item))
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

    if (countChineseAwareLength(normalized) > 40) {
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
    const matchedProfileKeyword = findBlockedProfileKeyword(normalizedName);

    if (matchedProfileKeyword) {
      return {
        matched: true,
        reason: "profile-keyword",
        keyword: `昵称命中:${matchedProfileKeyword}`,
        cleanedText: normalizedName
      };
    }

    if (!normalizedHandle) {
      return {
        matched: false,
        reason: "missing-profile"
      };
    }

    if (!containsBlockedProfileEmoji(normalizedName)) {
      if (isRandomBotName(normalizedName) && /\d{5,}$/.test(normalizedHandle)) {
        return {
          matched: true,
          reason: "random-name-number-id",
          keyword: "随机名字+5位数字ID",
          cleanedText: normalizedName
        };
      }
      return {
        matched: false,
        reason: "missing-blocked-profile-emoji"
      };
    }

    if (!/\d{5,}$/.test(normalizedHandle)) {
      return {
        matched: false,
        reason: "handle-not-numeric-tail"
      };
    }

    return {
      matched: true,
      reason: "flower-number-id",
      keyword: "昵称含🌸 + 5位数字ID",
      cleanedText: normalizedHandle
    };
  }

  function matchTweet(rawText, settings, profile = {}) {
    const profileMatch = matchProfile(profile.displayName, profile.handle, profile.hasEmojiNode);
    if (profileMatch.matched) {
      return profileMatch;
    }

    const textResult = matchText(rawText, settings);
    if (textResult.matched) {
      return textResult;
    }

    // English spam detection: short English text with spam patterns
    const cleaned = sanitizeForRule(rawText);
    const normalized = normalizeWhitespace(cleaned);
    if (normalized && !hasChinese(normalized)) {
      const len = countChineseAwareLength(normalized);
      if (len <= 40 && (containsEnglishSpam(normalized) || containsSpamDecorative(normalized))) {
        return {
          matched: true,
          reason: "english-spam",
          keyword: "英文黄推",
          cleanedText: normalized
        };
      }
    }

    return textResult;
  }

  global.XHB = {
    DEFAULT_SHORT_KEYWORDS,
    STORAGE_KEY,
    ACCOUNT_DATABASE_KEY,
    DEFAULT_REMOTE_DATABASE_URL,
    containsEmoji,
    containsBlockedProfileEmoji,
    findBlockedProfileKeyword,
    createDefaultSettings,
    createDefaultAccountDatabase,
    getSettings,
    saveSettings,
    addCustomFullMatch,
    normalizeHandle,
    getAccountDatabase,
    saveAccountDatabase,
    addBlockedAccount,
    markAccountBlocked,
    parseAccountDatabase,
    mergeAccountDatabase,
    exportAccountDatabase,
    sanitizeForRule,
    matchProfile,
    matchText,
    matchTweet,
    isRandomBotName,
    containsEnglishSpam,
    containsSpamDecorative
  };
})(typeof window !== "undefined" ? window : globalThis);
