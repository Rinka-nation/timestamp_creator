const STORAGE = chrome.storage.local;
const QUOTA_BYTES = STORAGE.QUOTA_BYTES;
const THRESHOLD = 0.8; // 80%

// --- Storage Management ---

async function manageStorage() {
    const items = await STORAGE.get(null);
    const usage = await STORAGE.getBytesInUse(null);

    if (usage / QUOTA_BYTES > THRESHOLD) {
        

        // Filter for video timestamp items and find the oldest one
        const videoItems = Object.entries(items).filter(([key, value]) => key.startsWith('video_') && value.timestamp);
        
        if (videoItems.length === 0) return;

        videoItems.sort(([, a], [, b]) => a.timestamp - b.timestamp);

        const oldestKey = videoItems[0][0];
        
        await STORAGE.remove(oldestKey);
        

        // Notify the user
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png', // You'll need to add an icon file to your extension
            title: 'ストレージ容量の警告',
            message: `容量が逼迫してきたため、最も古いタイムスタンプデータ（${oldestKey.replace('video_', '')}）を削除しました。`,
            priority: 2
        });
    }
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveText") {
    (async () => {
      await manageStorage(); // Check storage before saving
      const key = `video_${request.videoId}`;
      const value = {
        text: request.text,
        timestamp: Date.now()
      };
      await STORAGE.set({ [key]: value });
      sendResponse({ status: "saved" });
    })();
    return true;
  }

  if (request.action === "loadText") {
    (async () => {
      const key = `video_${request.videoId}`;
      const data = await STORAGE.get(key);
      if (data[key]) {
        // Update timestamp on access
        const updatedValue = { ...data[key], timestamp: Date.now() };
        await STORAGE.set({ [key]: updatedValue });
        sendResponse({ text: data[key].text });
      } else {
        sendResponse({ text: null });
      }
    })();
    return true;
  }

  if (request.action === "getStorage") {
    (async () => {
      const data = await STORAGE.get(request.keys);
      sendResponse(data);
    })();
    return true;
  }

  if (request.action === "setStorage") {
    (async () => {
      await STORAGE.set(request.items);
      sendResponse({ status: "saved" });
    })();
    return true;
  }

  if (request.action === "getNgWords") {
    (async () => {
      const data = await STORAGE.get('ngWords');
      sendResponse(data.ngWords || []);
    })();
    return true;
  }

  if (request.action === "getTimestampSettings") {
    (async () => {
      const data = await STORAGE.get(['timestampPrefix', 'timestampSuffix', 'defaultTimestampText']);
      sendResponse({
        timestampPrefix: data.timestampPrefix !== undefined ? data.timestampPrefix : ' - ',
        timestampSuffix: data.timestampSuffix !== undefined ? data.timestampSuffix : '  ',
        defaultTimestampText: data.defaultTimestampText !== undefined ? data.defaultTimestampText : "タイムスタンプ（編集中）  ※ネタバレ注意"
      });
    })();
    return true;
  }

  if (request.action === "getShortcuts") {
    (async () => {
      const data = await STORAGE.get('shortcuts');
      sendResponse(data.shortcuts || {});
    })();
    return true;
  }

  if (request.action === "getMainContainerHidden") {
    (async () => {
      const data = await STORAGE.get('mainContainerHidden');
      sendResponse(data.mainContainerHidden || false);
    })();
    return true;
  }

  if (request.action === "setMainContainerHidden") {
    (async () => {
      await STORAGE.set({ mainContainerHidden: request.hidden });
      sendResponse({ status: "saved" });
    })();
    return true;
  }

  if (request.action === "clearText") {
    (async () => {
      const key = `video_${request.videoId}`;
      // We keep the key but clear the text, and update the timestamp.
      // Or we could remove it entirely. Let's clear it.
      const value = {
        text: '',
        timestamp: Date.now()
      };
      await STORAGE.set({ [key]: value });

      // Relay message to content script to clear its textarea
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "clearTextInContent" });
      }
      sendResponse({ status: "cleared" });
    })();
    return true;
  }

  if (request.action === "deleteVideoData") {
    (async () => {
      const key = `video_${request.videoId}`;
      await STORAGE.remove(key);
      sendResponse({ status: "deleted", videoId: request.videoId });
    })();
    return true;
  }

  if (request.action === "executeScraper") {
    (async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['stamp_scraper.js']
                });
                sendResponse(results[0].result);
            } else {
                sendResponse([]);
            }
        } catch (e) {
            console.error('Error executing scraper:', e);
            sendResponse([]);
        }
    })();
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.shortcuts) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.startsWith("https://www.youtube.com/")) {
          chrome.tabs.sendMessage(tab.id, { action: "shortcutsUpdated", shortcuts: changes.shortcuts.newValue });
        }
      });
    });
  }
});
