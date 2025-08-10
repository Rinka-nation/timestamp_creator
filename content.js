// --- Global State (Encapsulated) ---
const state = {
  mainContainer: null,
  editor: null,
  charCountDisplay: null,
  warningDisplay: null,
  currentVideoId: null,
  currentClipTime: null,
  selectedTimestampSpan: null,
  shortcuts: {},
  selectedStampImage: null,
  savedCursorPosition: null, // Add savedCursorPosition to state
  currentRawText: "", // Add currentRawText
};

// --- Constants ---
const HIGHLIGHT_YELLOW = 'rgba(255, 255, 0, 0.3)';
const HIGHLIGHT_RED = 'rgba(255, 99, 71, 0.4)';
const HIGHLIGHT_NONE = 'transparent';

// --- Initialization Observer ---
const observer = new MutationObserver((mutations, obs) => {
  if (document.querySelector("#info-contents")) {
    
    obs.disconnect();
    initExtension();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
if (document.querySelector("#info-contents")) {
  
  initExtension();
}

// --- Helper Functions ---
function getVideoIdFromUrl(url) {
  const urlObj = new URL(url);
  const urlParams = new URLSearchParams(urlObj.search);
  const vParam = urlParams.get('v');
  if (vParam) {
    return vParam;
  }
  const pathSegments = urlObj.pathname.split('/').filter(Boolean);
  if ((pathSegments[0] === 'live' || pathSegments[0] === 'shorts') && pathSegments[1]) {
    return pathSegments[1];
  }
  return null;
}

function formatTime(seconds, forceHours = false) {
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0 || forceHours) {
    return `${String(h)}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else {
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}

function parseTime(timeString) {
  const parts = timeString.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  }
  return seconds;
}

function isPotentiallyBanned(formattedTimeString) {
    // Rule 1: Starts with "1:10:" (e.g., "1:10:05", "1:10:59")
    if (formattedTimeString.startsWith("1:10:")) {
        return true;
    }

    // Rule 2: Ends with "1:10" (e.g., "x1:10", "x:x1:10")
    const parts = formattedTimeString.split(':').map(Number);
    let m, s;
    if (parts.length === 3) {
        m = parts[1];
        s = parts[2];
    } else if (parts.length === 2) {
        m = parts[0];
        s = parts[1];
    } else {
        return false; // Invalid format, not banned by these rules
    }

    if (m % 10 === 1 && s === 10) {
        return true;
    }

    return false;
}

function updateSpanStyles() {
    if (!state.editor) return;

    let hasBannedTimestamp = false;

    state.editor.querySelectorAll('span').forEach(span => {
        const formattedText = span.textContent; // Get the formatted string directly
        const isBanned = isPotentiallyBanned(formattedText);

        if (isBanned) {
            hasBannedTimestamp = true;
        }

        // Apply styles based on priority: Selected > Banned > Normal
        if (span === state.selectedTimestampSpan) {
            span.style.backgroundColor = HIGHLIGHT_YELLOW;
        } else if (isBanned) {
            span.style.backgroundColor = HIGHLIGHT_RED;
        } else {
            span.style.backgroundColor = HIGHLIGHT_NONE;
        }
    });

    if (state.warningDisplay) {
        if (hasBannedTimestamp) {
            state.warningDisplay.textContent = "警告: シャドウバンの可能性があるタイムスタンプが含まれています。";
            state.warningDisplay.style.display = 'block';
        } else {
            state.warningDisplay.style.display = 'none';
        }
    }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    
  }).catch(() => {
    
  });
}

async function copyAllTextToClipboard(buttonElement) {
    await renderEditor(state.currentRawText);
    const textToCopy = getRawTextFromDisplayEditor();
    copyToClipboard(textToCopy);

    // Provide user feedback
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'コピーしました！';
    buttonElement.disabled = true;
    
    setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.disabled = false;
    }, 1500);
}

function isYouTubeLive() {
  const durationDisplay = document.querySelector('.ytp-time-duration');
  if (durationDisplay && durationDisplay.textContent.trim() !== '' && durationDisplay.offsetWidth > 0 && durationDisplay.offsetHeight > 0) {
      return false;
  }
  const playerLiveBadge = document.querySelector('.ytp-live-badge');
  if (playerLiveBadge && !playerLiveBadge.hidden) {
    return true;
  }
  const infoBadges = document.querySelectorAll('#info .ytd-badge-supported-renderer');
  for (const badge of infoBadges) {
    const badgeText = (badge.textContent || '').trim().toUpperCase();
    if (badgeText === 'LIVE' || (badgeText.includes('PREMIERES') && !badgeText.includes('PREMIERED'))) {
      return true;
    }
  }
  const watchingNow = document.querySelector('#info-strings .yt-formatted-string');
  if(watchingNow && watchingNow.textContent.includes('watching now')){
      return true;
  }
  return false;
}

function getCurrentChannelId() {
  console.log("getCurrentChannelId: Attempting to get channel ID.");

  // Try to get from video page meta tag
  const channelIdMeta = document.querySelector('meta[itemprop="channelId"]');
  if (channelIdMeta && channelIdMeta.content) {
    console.log("getCurrentChannelId: Found via meta tag:", channelIdMeta.content);
    return channelIdMeta.content;
  }
  console.log("getCurrentChannelId: Meta tag not found.");

  // Try to get from channel page URL (e.g., /channel/UC...)
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  if (pathSegments[0] === 'channel' && pathSegments[1]) {
    console.log("getCurrentChannelId: Found via channel URL path:", pathSegments[1]);
    return pathSegments[1];
  }
  console.log("getCurrentChannelId: Channel URL path not found.");

  // Try to get from channel page URL (e.g., /user/username or /@handle)
  const channelLink = document.querySelector('link[rel="canonical"][href*="/channel/"]');
  if (channelLink && channelLink.href) {
    const match = channelLink.href.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      console.log("getCurrentChannelId: Found via canonical link:", match[1]);
      return match[1];
    }
  }
  console.log("getCurrentChannelId: Canonical link not found.");

  // --- NEW: Try to get from Membership Perks button ---
  const membershipButton = document.querySelector('a[href*="/membership"].yt-spec-button-shape-next');
  if (membershipButton && membershipButton.href) {
    const match = membershipButton.href.match(/\/channel\/([a-zA-Z0-9_-]+)\/membership/);
    if (match && match[1]) {
      console.log("getCurrentChannelId: Found via Membership button:", match[1]);
      return match[1];
    }
  }
  console.log("getCurrentChannelId: Membership button not found or missing channel ID.");
  // --- END NEW ---

  // --- NEW: Try to get from ytInitialPlayerResponse or ytInitialData ---
  if (typeof ytInitialPlayerResponse !== 'undefined' && ytInitialPlayerResponse.videoDetails && ytInitialPlayerResponse.videoDetails.channelId) {
    console.log("getCurrentChannelId: Found via ytInitialPlayerResponse:", ytInitialPlayerResponse.videoDetails.channelId);
    return ytInitialPlayerResponse.videoDetails.channelId;
  }
  if (typeof ytInitialData !== 'undefined' && ytInitialData.metadata && ytInitialData.metadata.channelMetadataRenderer && ytInitialData.metadata.channelMetadataRenderer.externalId) {
    console.log("getCurrentChannelId: Found via ytInitialData (channel page):", ytInitialData.metadata.channelMetadataRenderer.externalId);
    return ytInitialData.metadata.channelMetadataRenderer.externalId;
  }
  // For video pages, ytInitialData might have it deeper
  if (typeof ytInitialData !== 'undefined' && ytInitialData.contents && ytInitialData.contents.twoColumnWatchNextResults && ytInitialData.contents.twoColumnWatchNextResults.results && ytInitialData.contents.twoColumnWatchNextResults.results.results && ytInitialData.contents.twoColumnWatchNextResults.results.results.contents) {
    const videoDetails = ytInitialData.contents.twoColumnWatchNextResults.results.results.contents.find(item => item.videoPrimaryInfoRenderer);
    if (videoDetails && videoDetails.videoPrimaryInfoRenderer && videoDetails.videoPrimaryInfoRenderer.owner && videoDetails.videoPrimaryInfoRenderer.owner.videoOwnerRenderer && videoDetails.videoPrimaryInfoRenderer.owner.videoOwnerRenderer.channelId) {
      console.log("getCurrentChannelId: Found via ytInitialData (video page deeper):", videoDetails.videoPrimaryInfoRenderer.owner.videoOwnerRenderer.channelId);
      return videoDetails.videoPrimaryInfoRenderer.owner.videoOwnerRenderer.channelId;
    }
  }
  console.log("getCurrentChannelId: ytInitialPlayerResponse or ytInitialData not found or missing channelId.");
  // --- END NEW ---

  // Fallback: If on a video page, try to find the channel link in the DOM
  const channelLinkElement = document.querySelector('#top-row #channel-name a, #owner-container #channel-name a');
  if (channelLinkElement && channelLinkElement.href) {
    const match = channelLinkElement.href.match(/\/channel\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      console.log("getCurrentChannelId: Found via DOM channel link:", match[1]);
      return match[1];
    }
  }
  console.log("getCurrentChannelId: DOM channel link not found.");

  console.log("getCurrentChannelId: No channel ID found. Returning null.");
  return null;
}

// --- Main Logic ---
async function initExtension() {
  

  state.currentVideoId = getVideoIdFromUrl(window.location.href);
  if (!state.currentVideoId) {
    
    return;
  }

  const data = await chrome.storage.local.get('shortcuts');
  const defaultShortcuts = {
      addTimestamp: { key: 'Enter', shiftKey: true, ctrlKey: false, altKey: false, code: 'Enter' },
      addTimestampAlt: { key: 'P', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyP' },
      toggleVisibility: { key: 'G', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyG' },
      copyTimestamp: { key: 'U', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyU' },
      pasteTimestamp: { key: 'Y', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyY' },
  };
  state.shortcuts = { ...defaultShortcuts, ...(data.shortcuts || {}) };

  
  window.addEventListener('keydown', handleGeneralShortcuts, true);

  createMainContainer();
  loadAndDisplayText();
  chrome.storage.local.get('mainContainerHidden', (data) => {
    if (state.mainContainer) {
      state.mainContainer.hidden = data.mainContainerHidden || false;
    }
  });
  window.addEventListener('yt-navigate-finish', () => {
    const newVideoId = getVideoIdFromUrl(window.location.href);
    if (newVideoId && newVideoId !== state.currentVideoId) {
      state.currentVideoId = newVideoId;
      loadAndDisplayText();
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.shortcuts) {
      state.shortcuts = { ...state.shortcuts, ...changes.shortcuts.newValue };
    }
  });
}

function createMainContainer() {
  if (document.getElementById('youtube-timestamp-main-container')) return;
  state.mainContainer = document.createElement('div');
  Object.assign(state.mainContainer.style, {
    position: 'fixed', top: '80px', right: '20px', width: '400px', height: '300px',
    zIndex: '10001', backgroundColor: 'rgba(20, 20, 20, 0.95)', border: '1px solid #505050',
    borderRadius: '6px', resize: 'both', overflow: 'hidden', display: 'flex', flexDirection: 'column'
  });
  state.mainContainer.id = 'youtube-timestamp-main-container';
  const header = document.createElement('div');
  Object.assign(header.style, {
    backgroundColor: '#333', color: '#E0E0E0', padding: '5px 10px',
    cursor: 'grab', textAlign: 'center', flexShrink: '0'
  });
  header.textContent = 'Timestamp Helper';
  state.mainContainer.appendChild(header);
  const contentArea = document.createElement('div');
  Object.assign(contentArea.style, {
      display: 'flex', flexGrow: '1', overflow: 'auto'
  });
  state.mainContainer.appendChild(contentArea);

  // Move editor creation here
  state.editor = document.createElement('div');
  state.editor.id = 'youtube-timestamp-display-area';
  state.editor.contentEditable = 'true';
  state.editor.setAttribute("spellcheck", "false");
  Object.assign(state.editor.style, {
      flex: '1',
      padding: '10px',
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#E0E0E0',
      whiteSpace: 'pre-wrap',
      outline: 'none',
      overflowY: 'auto',
      wordBreak: 'break-word'
  });
  contentArea.appendChild(state.editor); // Append here once

  // Add event listeners to the editor once
  state.editor.addEventListener('input', async (event) => {
      const newRawText = getRawTextFromDisplayEditor();
      const replacedText = await replaceNgWords(newRawText);

      state.currentRawText = replacedText; // Always update with the potentially replaced text

      // Always save and update char count
      chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: state.currentRawText }, () => {
          updateCharCount(state.currentRawText);
      });
  });

  state.editor.addEventListener('click', (e) => {
      if (e.target.tagName === 'SPAN') {
          state.selectedTimestampSpan = e.target;
          updateSpanStyles();
          if (!isYouTubeLive()) {
              const video = document.querySelector('video');
              if (video) {
                  video.currentTime = parseTime(e.target.textContent);
              }
          }
      }
  });

  state.editor.addEventListener('keyup', handleEditorKeyUp, true);
  state.editor.addEventListener('blur', () => {
      renderEditor(state.currentRawText);
  });

  renderEditor("");
  
  const footer = document.createElement('div');
  footer.style.flexShrink = '0';
  state.mainContainer.appendChild(footer);

  const buttonBar = document.createElement('div');
  Object.assign(buttonBar.style, {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px',
      backgroundColor: '#282828',
      flexWrap: 'nowrap'
  });

  const buttonStyle = {
      flex: '1',
      padding: '4px 2px', // Reduced padding
      margin: '0 1px', // Further reduced margin
      border: '1px solid #505050',
      borderRadius: '4px',
      backgroundColor: '#3e3e3e',
      color: '#E0E0E0',
      cursor: 'pointer',
      fontSize: '10px', // Reduced font size
      outline: 'none'
  };

  const addTimestampButton = document.createElement('button');
  addTimestampButton.textContent = 'タイムスタンプ追加';
  Object.assign(addTimestampButton.style, buttonStyle);
  addTimestampButton.addEventListener('click', () => addTimestamp());
  addTimestampButton.onmouseover = () => { addTimestampButton.style.backgroundColor = '#555'; };
  addTimestampButton.onmouseout = () => { addTimestampButton.style.backgroundColor = '#3e3e3e'; };

  const copyAllButton = document.createElement('button');
  copyAllButton.textContent = '全文コピー';
  Object.assign(copyAllButton.style, buttonStyle);
  copyAllButton.addEventListener('click', () => copyAllTextToClipboard(copyAllButton));
  copyAllButton.onmouseover = () => { if (!copyAllButton.disabled) copyAllButton.style.backgroundColor = '#555'; };
  copyAllButton.onmouseout = () => { if (!copyAllButton.disabled) copyAllButton.style.backgroundColor = '#3e3e3e'; };

  const insertStampButton = document.createElement('button');
  insertStampButton.textContent = 'スタンプ挿入';
  Object.assign(insertStampButton.style, buttonStyle);
  insertStampButton.addEventListener('mouseover', (event) => {
    event.preventDefault();
    state.savedCursorPosition = saveSelection(state.editor); // Save cursor position here
    showStampSelectionOverlay();
  });
  insertStampButton.onmouseover = () => { insertStampButton.style.backgroundColor = '#555'; };
  insertStampButton.onmouseout = () => { insertStampButton.style.backgroundColor = '#3e3e3e'; };

  buttonBar.appendChild(addTimestampButton);
  buttonBar.appendChild(copyAllButton);
  buttonBar.appendChild(insertStampButton);

  footer.appendChild(buttonBar);

  state.warningDisplay = document.createElement('div');
  Object.assign(state.warningDisplay.style, {
      backgroundColor: '#5a3d3d', color: '#ffcccc', padding: '5px 10px',
      textAlign: 'center', fontSize: '12px', display: 'none'
  });
  footer.appendChild(state.warningDisplay);

  state.charCountDisplay = document.createElement('div');
  Object.assign(state.charCountDisplay.style, {
    backgroundColor: '#333', color: '#E0E0E0', padding: '5px 10px',
    textAlign: 'right', fontSize: '11px'
  });
  footer.appendChild(state.charCountDisplay);

  document.body.appendChild(state.mainContainer);
  makeDraggable(state.mainContainer, header);

  // スタンプ選択オーバーレイの作成
  state.stampSelectionOverlay = document.createElement('div');
  Object.assign(state.stampSelectionOverlay.style, {
    position: 'absolute', bottom: '45px', right: '10px', width: '280px', height: '200px',
    backgroundColor: 'rgba(0, 0, 0, 0.95)', zIndex: '10002', display: 'none',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '10px', boxSizing: 'border-box',
    border: '1px solid #888', boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
  });
  state.mainContainer.appendChild(state.stampSelectionOverlay);

  const overlayHeader = document.createElement('div');
  Object.assign(overlayHeader.style, {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: '10px', borderBottom: '1px solid #505050', marginBottom: '10px'
  });
  state.stampSelectionOverlay.appendChild(overlayHeader);

  const overlayTitle = document.createElement('h3');
  Object.assign(overlayTitle.style, {
    color: '#E0E0E0', margin: '0'
  });
  overlayTitle.textContent = 'メンバーシップスタンプを選択';
  overlayHeader.appendChild(overlayTitle);

  const closeOverlayButton = document.createElement('button');
  Object.assign(closeOverlayButton.style, {
    backgroundColor: '#5a3d3d', color: '#E0E0E0', border: 'none', borderRadius: '4px',
    padding: '5px 10px', cursor: 'pointer', fontSize: '14px'
  });
  closeOverlayButton.textContent = '閉じる';
  closeOverlayButton.addEventListener('click', hideStampSelectionOverlay);
  overlayHeader.appendChild(closeOverlayButton);

  state.stampListContainer = document.createElement('div');
  Object.assign(state.stampListContainer.style, {
    flexGrow: '1', width: '100%', overflowY: 'auto', color: '#E0E0E0'
  });
  state.stampSelectionOverlay.appendChild(state.stampListContainer);
  state.stampSelectionOverlay.addEventListener('mouseleave', hideStampSelectionOverlay);
}

function showStampSelectionOverlay() {
  if (state.stampSelectionOverlay) {
    state.stampSelectionOverlay.style.display = 'flex';
    const currentChannelId = getCurrentChannelId();

    if (currentChannelId) {
      // チャンネルIDが取得できた場合
      try {
        chrome.runtime.sendMessage({ action: "getMembershipStamps", channelId: currentChannelId }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error getting membership stamps:", chrome.runtime.lastError);
            state.stampListContainer.innerHTML = '<p style="color: red;">スタンプの読み込みに失敗しました。</p>';
          } else {
            renderStampsInOverlay(response);
          }
        });
      } catch (e) {
        console.error("Error sending message to background:", e);
        state.stampListContainer.innerHTML = '<p style="color: red;">スタンプの読み込みに失敗しました。</p>';
      }
    } else {
      // チャンネルIDが取得できなかった場合
      state.stampListContainer.innerHTML = '<p>このページのチャンネルIDが取得できませんでした。</p>';
    }
  }
}

function renderStampsInOverlay(channelData) {
  state.stampListContainer.innerHTML = '';
  if (channelData.length === 0) {
    state.stampListContainer.innerHTML = '<p>このチャンネルのスタンプは見つかりませんでした。<br>ポップアップからスタンプ情報を更新してください。</p>';
    return;
  }

  channelData.forEach(channel => {
    const channelDiv = document.createElement('div');
    Object.assign(channelDiv.style, {
      marginBottom: '15px', border: '1px solid #505050', padding: '10px',
      borderRadius: '5px', backgroundColor: '#333'
    });

    const channelTitle = document.createElement('h4');
    Object.assign(channelTitle.style, {
      marginTop: '0', marginBottom: '10px', color: '#E0E0E0'
    });
    channelTitle.textContent = channel.channelName;
    channelDiv.appendChild(channelTitle);

    const stampsGrid = document.createElement('div');
    Object.assign(stampsGrid.style, {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
      gap: '5px'
    });

    channel.stamps.forEach(stamp => {
      const stampDiv = document.createElement('div');
      Object.assign(stampDiv.style, {
        textAlign: 'center', wordBreak: 'break-all', cursor: 'pointer',
        padding: '5px', borderRadius: '3px', transition: 'background-color 0.2s'
      });
      stampDiv.addEventListener('mouseover', () => { stampDiv.style.backgroundColor = '#555'; });
      stampDiv.addEventListener('mouseout', () => { stampDiv.style.backgroundColor = 'transparent'; });
      stampDiv.addEventListener('click', () => insertStampIntoEditor(stamp.name));

      const img = document.createElement('img');
      Object.assign(img.style, {
        width: '30px', height: '30px', objectFit: 'contain', marginBottom: '5px'
      });
      img.src = stamp.url;
      img.alt = stamp.name;

      const nameSpan = document.createElement('span');
      Object.assign(nameSpan.style, {
        fontSize: '0.7em', display: 'block', color: '#E0E0E0'
      });
      nameSpan.textContent = stamp.name;

      stampDiv.appendChild(img);
      stampDiv.appendChild(nameSpan);
      stampsGrid.appendChild(stampDiv);
    });
    channelDiv.appendChild(stampsGrid);
    state.stampListContainer.appendChild(channelDiv);
  });
}

function hideStampSelectionOverlay() {
  if (state.stampSelectionOverlay) {
    state.stampSelectionOverlay.style.display = 'none';
    // Removed state.editor.focus();
  }
}

async function insertStampIntoEditor(stampName) { // Make it async
  if (!state.editor) return;

  // Restore the saved cursor position before getting the current selection
  if (state.savedCursorPosition) {
    restoreSelection(state.editor, state.savedCursorPosition);
  }

  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const currentSavedSelection = saveSelection(state.editor); // Save current selection for post-render restore

  range.deleteContents();
  const textNode = document.createTextNode(stampName);
  range.insertNode(textNode);

  state.currentRawText = getRawTextFromDisplayEditor();
  await renderEditor(state.currentRawText);

  // Explicitly save the updated text to storage
  chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: state.currentRawText }, () => {
      updateCharCount(state.currentRawText);
  });

  // Calculate the new desired cursor position (after the inserted stamp)
  const newCursorPosition = {
      start: currentSavedSelection.start + stampName.length,
      end: currentSavedSelection.start + stampName.length
  };

  restoreSelection(state.editor, newCursorPosition); // Use newCursorPosition here
  hideStampSelectionOverlay();

  // Clear savedCursorPosition after use
  state.savedCursorPosition = null;
}

// --- Mode Switching Logic ---


async function renderEditor(text) {
    // 状態リセット
    state.selectedTimestampSpan = null;
    

    

    // タイムスタンプのリンク化
    let formattedContent = text.replace(
        /(\d+:\d{2}:\d{2}|\d{1,2}:\d{2}(?!:))/g,
        '<span style="color: #3399FF; cursor: pointer; text-decoration: underline;">$&</span>'
    );

    // スタンプデータの取得
    const stampData = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "getMembershipStamps" }, resolve);
    });

    if (stampData && stampData.length > 0) {
        const stampMap = new Map();
        stampData.forEach(channel => {
            channel.stamps.forEach(stamp => {
                stampMap.set(stamp.name, stamp.url);
            });
        });

        if (stampMap.size > 0) {
            const stampNames = Array.from(stampMap.keys()).map(name =>
                name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            );
            const regex = new RegExp(`(${stampNames.join('|')})`, 'g');
            formattedContent = formattedContent.replace(regex, (match, stampName) => {
                const imgUrl = stampMap.get(stampName);
                return `<img src="${imgUrl}" alt="${stampName}" title="${stampName}" style="width: 20px; height: 20px; vertical-align: middle; margin: 0 1px;"/>`;
            });
        }
    }

    state.editor.innerHTML = formattedContent;

    

    

    
    

    
    updateCharCount(text);
    updateSpanStyles();
}



function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

async function replaceNgWords(text) {
    const data = await chrome.storage.local.get('ngWords');
    const ngWords = data.ngWords || [];
    if (ngWords.length === 0) return text;

    const lines = text.split('\n');
    let processedLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let originalLine = line; // Keep original to check if replacement happened

        for (const word of ngWords) {
            if (word) {
                const escapedWord = escapeRegExp(word);
                const regex = new RegExp(escapedWord, 'gi');
                line = line.replace(regex, '〇');
            }
        }

        processedLines.push(line);
    }

    // Join the processed lines. The `\n` from split will be added back.
    // If a line was modified, it will now have `\n\n` after it.
    return processedLines.join('\n');
}

// --- Data and UI Update Functions ---
function loadAndDisplayText() {
  if (!state.currentVideoId) return;
  chrome.runtime.sendMessage({ action: "loadText", videoId: state.currentVideoId }, (response) => {
    state.currentRawText = (response && response.text) ? response.text : "";
    renderEditor(state.currentRawText);
    if (!response || !response.text) {
        chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: state.currentRawText });
    }
  });
}

function updateCharCount(text) {
  if (state.charCountDisplay) {
    state.charCountDisplay.textContent = `現在の文字数: ${text.length}`;
  }
}

async function addTimestamp() {
    const video = document.querySelector('video');
    if (!video) return;

    const storedSettings = await chrome.storage.local.get(['timestampPrefix', 'timestampSuffix', 'defaultTimestampText']);
    const prefix = storedSettings.timestampPrefix !== undefined ? storedSettings.timestampPrefix : ' - ';
    const suffix = storedSettings.timestampSuffix !== undefined ? storedSettings.timestampSuffix : '  ';
    const defaultTimestampText = storedSettings.defaultTimestampText !== undefined ? storedSettings.defaultTimestampText : "タイムスタンプ（編集中）  ※ネタバレ注意";

    const timestampText = `${prefix}${formatTime(video.currentTime)}${suffix}`;

    let textToSave = state.currentRawText;
    if (textToSave.trim() === "") {
        textToSave = defaultTimestampText + "\n\n";
    }
    textToSave += timestampText;
    textToSave = await replaceNgWords(textToSave);

    state.currentRawText = textToSave; // Update currentRawText

    await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: state.currentRawText }, () => {
            resolve();
        });
    });
    await renderEditor(state.currentRawText);

    // Set focus to the editor
    state.editor.focus();

    // Place cursor at the end of the text
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(state.editor, state.editor.childNodes.length);
    range.collapse(true); // true for collapse to start, which is the end of content here
    selection.removeAllRanges();
    selection.addRange(range);

    // Scroll to the bottom
    state.editor.scrollTop = state.editor.scrollHeight;
}

// --- Event Handlers ---
function adjustSelectedTimestamp(delta) {
    if (!state.selectedTimestampSpan) return;
    const oldFormattedTime = state.selectedTimestampSpan.textContent;
    let seconds = parseTime(oldFormattedTime);
    seconds += delta;
    if (seconds < 0) seconds = 0;
    const newFormattedTime = formatTime(seconds);

    // Directly update the text content of the selected span
    state.selectedTimestampSpan.textContent = newFormattedTime;

    // Reconstruct state.currentRawText from the updated display editor
    state.currentRawText = getRawTextFromDisplayEditor();

    chrome.runtime.sendMessage({
        action: "saveText",
        videoId: state.currentVideoId,
        text: state.currentRawText
    });
    updateCharCount(state.currentRawText);
    updateSpanStyles(); // Re-apply styles to maintain selection highlight
}

function handleEditorKeyUp(event) {
    event.stopPropagation();
}

async function handleGeneralShortcuts(event) {
  // Removed: event.stopPropagation();

  const video = document.querySelector('video');
  if (!video) return;

  // Check if the editor is currently focused for editor-specific shortcuts
  const isEditorFocused = state.editor && state.editor.contains(document.activeElement);

  // Stop propagation only if the editor is focused
  if (isEditorFocused) {
    event.stopPropagation();
  }

  if (isEditorFocused && state.selectedTimestampSpan) {
      if (event.key === 'ArrowUp') {
          event.preventDefault();
          adjustSelectedTimestamp(1);
      } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          adjustSelectedTimestamp(-1);
      }
  }

  // New: Video seek shortcuts (only when editor is NOT focused)
  if (!isEditorFocused) {
      if (event.key === 'ArrowLeft') {
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          video.currentTime = video.currentTime + 5;
      }
  }

  // Shortcut key matching logic (applies globally)
  function isMatch(event, shortcut) {
      if (!shortcut) return false;
      return event.key === shortcut.key &&
             event.shiftKey === shortcut.shiftKey &&
             event.ctrlKey === shortcut.ctrlKey &&
             event.altKey === shortcut.altKey;
  }

  // Global shortcuts
  if (isMatch(event, state.shortcuts.toggleVisibility)) {
      event.preventDefault();
      if (state.mainContainer) {
          state.mainContainer.hidden = !state.mainContainer.hidden;
          chrome.storage.local.set({ mainContainerHidden: state.mainContainer.hidden });
      }
  } else if (isMatch(event, state.shortcuts.addTimestamp)) {
      event.preventDefault();
      addTimestamp();
  } else if (isMatch(event, state.shortcuts.addTimestampAlt)) {
      event.preventDefault();
      addTimestamp();
  } else if (isMatch(event, state.shortcuts.copyTimestamp)) {
      event.preventDefault();
      const time = formatTime(video.currentTime);
      copyToClipboard(time);
      state.currentClipTime = time;
  } else if (isMatch(event, state.shortcuts.pasteTimestamp)) {
      event.preventDefault();
      if (state.currentClipTime) {
          const storedSettings = await chrome.storage.local.get(['timestampPrefix', 'timestampSuffix']);
          const prefix = storedSettings.timestampPrefix !== undefined ? storedSettings.timestampPrefix : ' - ';
          const suffix = storedSettings.timestampSuffix !== undefined ? storedSettings.timestampSuffix : '  ';
          const textToAppend = `${prefix}${state.currentClipTime}${suffix}`;

          let newText = state.currentRawText + textToAppend;
          newText = await replaceNgWords(newText);
          state.currentRawText = newText;

          chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: state.currentRawText }, () => {
              renderEditor(state.currentRawText);
          });
      }
  }
}

function makeDraggable(element, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    dragHandle.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}



function getRawTextFromDisplayEditor() {
    if (!state.editor || state.editor.tagName !== 'DIV') return "";

    const clonedEditor = state.editor.cloneNode(true);

    // クローンしたDOM上で<img>タグと<span>タグの置換を行う
    clonedEditor.querySelectorAll('img[alt]').forEach(img => {
        if (img.alt) {
            img.parentNode.replaceChild(document.createTextNode(img.alt), img);
        }
    });

    clonedEditor.querySelectorAll('span').forEach(span => {
        span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
    });

    return extractRawTextFromElement(clonedEditor);
}

// New helper function to extract raw text from any element
function extractRawTextFromElement(element) {
    let rawText = '';
    const nodes = element.childNodes;

    function traverse(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            rawText += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR') {
                rawText += '\n';
            } else if (node.tagName === 'IMG' && node.alt) { // Handle IMG tags
                rawText += node.alt;
            } else if (node.tagName === 'SPAN') { // Handle SPAN tags
                rawText += node.textContent;
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    traverse(node.childNodes[i]);
                }
            }
        }
    }

    for (let i = 0; i < nodes.length; i++) {
        traverse(nodes[i]);
    }
    return rawText;
}

// Helper to save selection in a contenteditable div
function saveSelection(editorEl) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorEl);
    preCaretRange.setEnd(range.startContainer, range.startOffset);

    // Get the text content of the range before the caret
    const start = extractRawTextFromElement(preCaretRange.cloneContents()).length;

    // Get the text content of the selected range (if any)
    const selectedTextLength = extractRawTextFromElement(range.cloneContents()).length;
    const end = start + selectedTextLength;

    return { start: start, end: end };
}

// Helper to restore selection in a contenteditable div
function restoreSelection(editorEl, savedSelection) {
    if (!savedSelection) return;

    const range = document.createRange();
    const selection = window.getSelection();

    let charCount = 0;
    let foundStart = false;
    let foundEnd = false;

    function traverseNodes(node) {
        if (foundStart && foundEnd) return;

        if (node.nodeType === Node.TEXT_NODE) {
            const nextCharCount = charCount + node.length;

            if (!foundStart && savedSelection.start >= charCount && savedSelection.start <= nextCharCount) {
                range.setStart(node, savedSelection.start - charCount);
                foundStart = true;
            }
            if (!foundEnd && savedSelection.end >= charCount && savedSelection.end <= nextCharCount) {
                range.setEnd(node, savedSelection.end - charCount);
                foundEnd = true;
            }
            charCount = nextCharCount;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR') {
                charCount += 1; // For newline
            } else if (node.tagName === 'IMG' && node.alt) { // Handle IMG tags
                charCount += node.alt.length;
            } else if (node.tagName === 'SPAN') { // Handle SPAN tags
                charCount += node.textContent.length;
                // SPANタグの子ノードは、textContentで既にカウントされているため、再帰的に走査しない
            } else { // BR, IMG, SPAN以外のELEMENT_NODEタイプの場合、子ノードを再帰的に走査
                for (let i = 0; i < node.childNodes.length; i++) {
                    traverseNodes(node.childNodes[i]);
                }
            }
        } else { // その他のノードタイプの場合、子ノードを再帰的に走査
            for (let i = 0; i < node.childNodes.length; i++) {
                traverseNodes(node.childNodes[i]);
            }
        }
    }

    traverseNodes(editorEl);

    if (foundStart) {
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        // Fallback: if start not found, place cursor at end
        editorEl.focus();
        selection.selectAllChildren(editorEl);
        selection.collapseToEnd();
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clearTextInContent") {
    state.currentRawText = ""; // Clear currentRawText
    chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: state.currentRawText }, () => {
        renderEditor(state.currentRawText);
        updateCharCount(state.currentRawText);
    });
  }
  if (request.action === "reloadExtension") {
    console.log("Reloading extension via popup button.");
    initExtension();
    sendResponse({ status: "reloaded" });
    return true; // 非同期レスポンスのためにtrueを返す
  }
  if (request.action === "toggleVisibility") {
    if (state.mainContainer) {
        state.mainContainer.hidden = !state.mainContainer.hidden;
        chrome.storage.local.set({ mainContainerHidden: state.mainContainer.hidden });
        sendResponse({status: "visibility toggled", hidden: state.mainContainer.hidden});
    }
    return true;
  }
  if (request.action === "checkUIExists") {
    const uiExists = !!document.getElementById('youtube-timestamp-main-container');
    sendResponse({ exists: uiExists });
    return true;
  }

  if (request.action === "getChannelIdForDebug") {
    (async () => {
      const channelId = getCurrentChannelId();
      sendResponse({ channelId: channelId });
    })();
    return true;
  }
});