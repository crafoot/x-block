importScripts("shared.js");

(function initBackground() {
  const SYNC_ALARM = "xhb-account-database-sync";
  const SYNC_PERIOD_MINUTES = 12 * 60;

  async function syncRemoteDatabase() {
    const settings = await globalThis.XHB.getSettings();
    if (!settings.autoSyncEnabled || !settings.remoteDatabaseUrl) {
      return { synced: false, reason: "disabled" };
    }

    const response = await fetch(settings.remoteDatabaseUrl, {
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) {
      throw new Error(`远端数据库同步失败：HTTP ${response.status}`);
    }

    const remoteDatabase = globalThis.XHB.parseAccountDatabase(await response.text());
    const merged = await globalThis.XHB.mergeAccountDatabase(remoteDatabase, "remote-github");
    settings.lastRemoteSyncAt = new Date().toISOString();
    await globalThis.XHB.saveSettings(settings);

    return {
      synced: true,
      count: Object.keys(merged.accounts).length,
      syncedAt: settings.lastRemoteSyncAt
    };
  }

  async function mergeExternalSources() {
    const settings = await globalThis.XHB.getSettings();
    if (!settings.autoSyncEnabled || !settings.externalSources.length) {
      return { merged: false, reason: "no-external-sources" };
    }

    const results = [];
    for (const url of settings.externalSources) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "omit"
        });
        if (!response.ok) {
          results.push({ url, error: `HTTP ${response.status}` });
          continue;
        }

        const text = await response.text();
        let database;
        try {
          database = globalThis.XHB.parseAccountDatabase(text);
        } catch (e) {
          results.push({ url, error: "parse-error" });
          continue;
        }

        const label = url.includes("xblocker") ? "xblocker" : "external";
        const merged = await globalThis.XHB.mergeAccountDatabase(database, label);
        results.push({
          url,
          ok: true,
          count: Object.keys(merged.accounts).length
        });
      } catch (e) {
        results.push({ url, error: e.message });
      }
    }

    return { merged: true, results };
  }

  async function fullSync() {
    const results = [];
    try {
      const remoteResult = await syncRemoteDatabase();
      results.push({ source: "remote-github", ...remoteResult });
    } catch (e) {
      results.push({ source: "remote-github", error: e.message });
    }
    try {
      const externalResult = await mergeExternalSources();
      results.push({ source: "external", ...externalResult });
    } catch (e) {
      results.push({ source: "external", error: e.message });
    }
    return results;
  }

  function ensureAlarm() {
    chrome.alarms.create(SYNC_ALARM, {
      periodInMinutes: SYNC_PERIOD_MINUTES
    });
  }

  chrome.runtime.onInstalled.addListener(() => {
    ensureAlarm();
    fullSync().catch(console.warn);
  });

  chrome.runtime.onStartup.addListener(() => {
    ensureAlarm();
    fullSync().catch(console.warn);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) {
      fullSync().catch(console.warn);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "XHB_ADD_BLOCKED_ACCOUNT") {
      globalThis.XHB.addBlockedAccount(message.account)
        .then((database) => sendResponse({
          ok: true,
          count: Object.keys(database.accounts).length
        }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "XHB_MARK_ACCOUNT_BLOCKED") {
      globalThis.XHB.markAccountBlocked(message.handle)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "XHB_SYNC_REMOTE_DATABASE") {
      fullSync()
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "XHB_GET_ACCOUNT_DATABASE") {
      globalThis.XHB.getAccountDatabase()
        .then((db) => sendResponse({ ok: true, database: db }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "XHB_EXPORT_DATABASE") {
      globalThis.XHB.getAccountDatabase()
        .then((db) => {
          const json = globalThis.XHB.exportAccountDatabase(db);
          sendResponse({ ok: true, data: json });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "XHB_IMPORT_DATABASE") {
      try {
        const database = globalThis.XHB.parseAccountDatabase(message.data);
        globalThis.XHB.mergeAccountDatabase(database, message.source || "import")
          .then((db) => sendResponse({
            ok: true,
            count: Object.keys(db.accounts).length
          }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
      } catch (e) {
        sendResponse({ ok: false, error: "Invalid JSON: " + e.message });
      }
      return true;
    }

    return false;
  });
})();
