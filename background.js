chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveText") {
    const key = `video_${request.videoId}`;
    chrome.storage.sync.set({ [key]: request.text }, () => {
      sendResponse({ status: "saved" });
    });
    return true; // Indicates that the response is sent asynchronously
  } else if (request.action === "loadText") {
    const key = `video_${request.videoId}`;
    chrome.storage.sync.get(key, (data) => {
      sendResponse({ text: data[key] });
    });
    return true; // Indicates that the response is sent asynchronously
  } else if (request.action === "clearText") {
    // This action is from popup, so it needs to know the current video ID
    // We'll get the video ID from the active tab in content.js and pass it here.
    // For now, let's assume content.js will send the videoId with clearText action.
    const key = `video_${request.videoId}`;
    chrome.storage.sync.set({ [key]: '' }, () => {
      // Relay message to content script to clear its textarea
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "clearTextInContent" });
        }
      });
      sendResponse({ status: "cleared" });
    });
    return true; // Indicates that the response is sent asynchronously
  }
});