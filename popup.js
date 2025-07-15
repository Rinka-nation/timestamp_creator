document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');

  // Helper to get YouTube Video ID from URL
  function getVideoIdFromUrl(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v');
  }

  copyBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const videoId = getVideoIdFromUrl(tabs[0].url);
        if (videoId) {
          chrome.runtime.sendMessage({ action: "loadText", videoId: videoId }, (response) => {
            if (response && response.text) {
              navigator.clipboard.writeText(response.text)
                .then(() => alert('Copied to clipboard!'))
                .catch(err => console.error('Failed to copy: ', err));
            }
          });
        } else {
          alert('Not on a YouTube video page.');
        }
      }
    });
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all timestamps for this video?')) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          const videoId = getVideoIdFromUrl(tabs[0].url);
          if (videoId) {
            chrome.runtime.sendMessage({ action: "clearText", videoId: videoId }, (response) => {
              if (response && response.status === "cleared") {
                alert('All timestamps cleared for this video.');
              }
            });
          } else {
            alert('Not on a YouTube video page.');
          }
        }
      });
    }
  });
});