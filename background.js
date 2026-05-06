/**
 * AccessLens – Background Service Worker
 * Handles communication between popup and content script.
 */

function hasExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch (_) {
    return false;
  }
}

function safeSend(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch (_) {}
}

try {
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!hasExtensionContext()) {
        safeSend(sendResponse, { error: "Extension context invalidated. Reload extension and page." });
        return true;
      }

      if (message.type === "RUN_AUDIT") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (!tab || !tab.id) {
            safeSend(sendResponse, { error: "No active tab" });
            return;
          }

          // Ensure the content script is present, then ask it to run the audit.
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ["content.js"],
            })
            .then(() => {
              chrome.tabs.sendMessage(tab.id, { type: "RUN_AUDIT" }, (response) => {
                if (chrome.runtime.lastError) {
                  safeSend(sendResponse, { error: chrome.runtime.lastError.message });
                  return;
                }
                if (!response || !response.result) {
                  safeSend(sendResponse, { error: "Audit did not return results." });
                  return;
                }

                chrome.storage.local.set({ auditResult: response.result }, () => {
                  safeSend(sendResponse, { result: response.result });
                });
              });
            })
            .catch((err) => safeSend(sendResponse, { error: err.message }));
        });
        return true; // keep message channel open for async response
      }

      return false;
    });
  }
} catch (_) {
  // Ignore extension API lifecycle errors during reload.
}
