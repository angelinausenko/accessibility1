/**
 * AccessLens – Background Service Worker
 * Handles communication between popup and content script.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_AUDIT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return sendResponse({ error: "No active tab" });

      // Ensure the content script is present, then ask it to run the audit.
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        })
        .then(() => {
          chrome.tabs.sendMessage(tab.id, { type: "RUN_AUDIT" }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
            }
            if (!response || !response.result) {
              sendResponse({ error: "Audit did not return results." });
              return;
            }

            chrome.storage.local.set({ auditResult: response.result }, () => {
              sendResponse({ result: response.result });
            });
          });
        })
        .catch((err) => sendResponse({ error: err.message }));
    });
    return true; // keep message channel open for async response
  }
});
