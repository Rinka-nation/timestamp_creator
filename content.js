// --- Global State (Encapsulated) ---
const state = {
  mainContainer: null,
  editor: null,
  charCountDisplay: null,
  warningDisplay: null,
  currentVideoId: null,
  currentClipTime: null,
  isEditing: false,
  selectedTimestampSpan: null,
  shortcuts: {},
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
    if (state.isEditing || !state.editor) return;

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

function copyAllTextToClipboard(buttonElement) {
    const textToCopy = state.isEditing ? state.editor.value : state.editor.textContent;
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

// --- Main Logic ---
async function initExtension() {
  state.currentVideoId = getVideoIdFromUrl(window.location.href);
  if (!state.currentVideoId) {
    
    return;
  }

  const data = await chrome.storage.local.get('shortcuts');
  const defaultShortcuts = {
      addTimestamp: { key: 'Enter', shiftKey: true, ctrlKey: false, altKey: false, code: 'Enter' },
      addTimestampAlt: { key: 'p', shiftKey: false, ctrlKey: false, altKey: false, code: 'KeyP' },
      toggleVisibility: { key: 'g', shiftKey: false, ctrlKey: false, altKey: false, code: 'KeyG' },
      copyTimestamp: { key: 'u', shiftKey: false, ctrlKey: false, altKey: false, code: 'KeyU' },
      pasteTimestamp: { key: 'y', shiftKey: false, ctrlKey: false, altKey: false, code: 'KeyY' },
  };
  state.shortcuts = { ...defaultShortcuts, ...(data.shortcuts || {}) };

  document.addEventListener('keydown', handleGeneralShortcuts);
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
  switchToDisplayMode("");
  
  const footer = document.createElement('div');
  footer.style.flexShrink = '0';
  state.mainContainer.appendChild(footer);

  const buttonBar = document.createElement('div');
  Object.assign(buttonBar.style, {
      display: 'flex',
      justifyContent: 'space-around',
      padding: '5px',
      backgroundColor: '#282828'
  });

  const buttonStyle = {
      flex: '1',
      padding: '8px 5px',
      margin: '0 5px',
      border: '1px solid #505050',
      borderRadius: '4px',
      backgroundColor: '#3e3e3e',
      color: '#E0E0E0',
      cursor: 'pointer',
      fontSize: '12px',
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

  buttonBar.appendChild(addTimestampButton);
  buttonBar.appendChild(copyAllButton);

  const insertStampButton = document.createElement('button');
  insertStampButton.textContent = 'スタンプ挿入';
  Object.assign(insertStampButton.style, buttonStyle);
  insertStampButton.style.display = 'none'; // 初期状態では非表示
  insertStampButton.addEventListener('mousedown', (event) => {
    event.preventDefault(); // デフォルトの動作（フォーカス喪失）を防ぐ
    showStampSelectionOverlay();
    if (state.editor && state.editor.tagName === 'TEXTAREA') {
      state.editor.focus(); // 再度フォーカスを当てる
    }
  });
  insertStampButton.onmouseover = () => { insertStampButton.style.backgroundColor = '#555'; };
  insertStampButton.onmouseout = () => { insertStampButton.style.backgroundColor = '#3e3e3e'; };
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
    position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
    backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: '10002', display: 'none',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '10px', boxSizing: 'border-box'
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
}

function showStampSelectionOverlay() {
  if (state.stampSelectionOverlay) {
    // blurイベントリスナーを一時的に削除
    if (state.editor && state.editorBlurListener) {
      state.editor.removeEventListener('blur', state.editorBlurListener);
    }
    state.stampSelectionOverlay.style.display = 'flex';
    // メンバーシップスタンプデータを取得してレンダリング
    try {
      chrome.runtime.sendMessage({ action: "getMembershipStamps" }, (response) => {
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
  }
}

function renderStampsInOverlay(channelData) {
  state.stampListContainer.innerHTML = '';
  if (channelData.length === 0) {
    state.stampListContainer.innerHTML = '<p>保存されたメンバーシップスタンプはありません。</p>';
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
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
      gap: '10px'
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
        width: '50px', height: '50px', objectFit: 'contain', marginBottom: '5px'
      });
      img.src = stamp.url;
      img.alt = stamp.name;

      const nameSpan = document.createElement('span');
      Object.assign(nameSpan.style, {
        fontSize: '0.8em', display: 'block', color: '#E0E0E0'
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
    // blurイベントリスナーを再度追加
    if (state.editor && state.editorBlurListener) {
      state.editor.addEventListener('blur', state.editorBlurListener);
    }
  }
}

function insertStampIntoEditor(stampName) {
  console.log("insertStampIntoEditor called with:", stampName);
  if (!state.editor || state.editor.tagName !== 'TEXTAREA') {
    console.log("Editor is not a textarea or not available.", state.editor);
    return;
  }

  const currentText = state.editor.value;
  const start = state.editor.selectionStart;
  const end = state.editor.selectionEnd;

  const textToInsert = `${stampName}`; // スタンプ名を :name: 形式にする

  console.log(`Inserting "${textToInsert}" at position ${start}-${end} in text: "${currentText}"`);

  state.editor.value = currentText.substring(0, start) + textToInsert + currentText.substring(end);
  state.editor.selectionStart = state.editor.selectionEnd = start + textToInsert.length;

  console.log("New editor value:", state.editor.value);

  // inputイベントをディスパッチして、他のリスナーをトリガーする
  state.editor.dispatchEvent(new Event('input', { bubbles: true }));
  console.log("Input event dispatched.");

  hideStampSelectionOverlay(); // 挿入後にオーバーレイを閉じる
  console.log("Overlay hidden.");
}

// --- Mode Switching Logic ---
function switchToDisplayMode(text) {
    const insertStampButton = document.querySelector('#youtube-timestamp-main-container button:nth-child(3)'); // 3番目のボタンがスタンプ挿入ボタン
    if (insertStampButton) {
        insertStampButton.style.display = 'none';
    }
    const scrollPosition = state.editor ? state.editor.scrollTop : 0;
    state.selectedTimestampSpan = null;
    state.isEditing = false;
    const contentArea = state.mainContainer.querySelector('div:nth-of-type(2)');
    if (state.editor) contentArea.removeChild(state.editor);
    state.editor = document.createElement('div');
    state.editor.id = 'youtube-timestamp-display-area';
    Object.assign(state.editor.style, {
        flex: '1', padding: '10px', fontFamily: 'monospace', fontSize: '13px',
        color: '#E0E0E0', whiteSpace: 'pre-wrap', outline: 'none', overflowY: 'auto'
    });
    const formattedContent = text.replace(/(\d+:\d{2}:\d{2}|\d{1,2}:\d{2}(?!:))/g, '<span style="color: #3399FF; cursor: pointer; text-decoration: underline;">$&</span>');
    state.editor.innerHTML = formattedContent;
    state.editor.addEventListener('dblclick', (e) => {
        const currentFullText = state.editor.textContent;
        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(state.editor);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                const caretOffset = preCaretRange.toString().length;
                switchToEditMode(currentFullText, { caretPosition: caretOffset });
                return;
            }
        }
        switchToEditMode(currentFullText);
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
            } else {
                // Live stream, cannot seek
            }
        }
    });
    contentArea.appendChild(state.editor);
    state.editor.scrollTop = scrollPosition;
    updateCharCount(text);
    updateSpanStyles();
}

function switchToEditMode(currentText, options = {}) {
    const insertStampButton = document.querySelector('#youtube-timestamp-main-container button:nth-child(3)'); // 3番目のボタンがスタンプ挿入ボタン
    if (insertStampButton) {
        insertStampButton.style.display = 'block';
    }
    const scrollPosition = state.editor ? state.editor.scrollTop : 0;
    const { caretPosition = -1, scrollToBottom = false } = options;
    state.isEditing = true;
    const contentArea = state.mainContainer.querySelector('div:nth-of-type(2)');
    if (state.editor) contentArea.removeChild(state.editor);
    state.editor = document.createElement('textarea');
    state.editor.id = "youtube-timestamp-textarea";
    Object.assign(state.editor.style, {
        flex: '1', border: 'none', backgroundColor: 'transparent', color: '#E0E0E0',
        padding: '10px', fontFamily: 'monospace', fontSize: '13px', resize: 'none', outline: 'none'
    });
    state.editor.setAttribute("spellcheck", "false");
    state.editor.value = currentText;
    let isComposing = false;
    state.editor.addEventListener('compositionstart', () => { isComposing = true; });
    state.editor.addEventListener('compositionend', (event) => {
        isComposing = false;
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    state.editor.addEventListener('input', async () => {
        if (isComposing) return;
        const newText = state.editor.value;
        const replacedText = await replaceNgWords(newText);
        chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: replacedText });
        updateCharCount(replacedText);
        if (newText !== replacedText) {
            const cursorPos = state.editor.selectionStart;
            state.editor.value = replacedText;
            state.editor.selectionStart = state.editor.selectionEnd = cursorPos;
        }
        updateSpanStyles();
    });
    state.editor.addEventListener('blur', state.editorBlurListener = () => {
        switchToDisplayMode(state.editor.value);
    });
    state.editor.addEventListener('keydown', (event) => {
        if (event.shiftKey && event.key === "Enter") {
            event.preventDefault();
            addTimestamp({ stayInEditMode: true });
        }
    });
    contentArea.appendChild(state.editor);
    if (scrollToBottom) {
        state.editor.scrollTop = state.editor.scrollHeight;
    } else {
        state.editor.scrollTop = scrollPosition;
    }
    if (caretPosition !== -1) {
        state.editor.selectionStart = state.editor.selectionEnd = caretPosition;
    }
    state.editor.focus();
    updateCharCount(currentText);
    updateSpanStyles();
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

async function replaceNgWords(text) {
    const data = await chrome.storage.local.get('ngWords');
    const ngWords = data.ngWords || [];
    if (ngWords.length === 0) return text;
    let replacedText = text;
    for (const word of ngWords) {
        if (word) {
            const escapedWord = escapeRegExp(word);
            const regex = new RegExp(escapedWord, 'gi');
            replacedText = replacedText.replace(regex, '〇');
        }
    }
    return replacedText;
}

// --- Data and UI Update Functions ---
function loadAndDisplayText() {
  if (!state.currentVideoId) return;
  chrome.runtime.sendMessage({ action: "loadText", videoId: state.currentVideoId }, (response) => {
    const text = (response && response.text) ? response.text : "";
    if (!state.isEditing) {
        switchToDisplayMode(text);
    } else {
        state.editor.value = text;
    }
    if (!response || !response.text) {
        chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: text });
    }
  });
}

function updateCharCount(text) {
  if (state.charCountDisplay) {
    state.charCountDisplay.textContent = `現在の文字数: ${text.length}`;
  }
}

async function addTimestamp(options = {}) {
    const { stayInEditMode = false } = options;
    const video = document.querySelector('video');
    if (!video) return;

    const storedSettings = await chrome.storage.local.get(['timestampPrefix', 'timestampSuffix']);
    const prefix = storedSettings.timestampPrefix !== undefined ? storedSettings.timestampPrefix : ' - ';
    const suffix = storedSettings.timestampSuffix !== undefined ? storedSettings.timestampSuffix : '  ';

    const timestampText = `${prefix}${formatTime(video.currentTime)}${suffix}`;

    if (stayInEditMode && state.editor.tagName === 'TEXTAREA') {
        const currentText = state.editor.value;
        let newText = currentText + timestampText;
        newText = await replaceNgWords(newText);
        state.editor.value = newText;
        state.editor.scrollTop = state.editor.scrollHeight;
        state.editor.focus();
        state.editor.selectionStart = state.editor.selectionEnd = newText.length;
        updateCharCount(newText);
        chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: newText });
        updateSpanStyles();
    } else {
        chrome.runtime.sendMessage({ action: "loadText", videoId: state.currentVideoId }, async (response) => {
            const currentText = (response && response.text) ? response.text : "";
            let textToSave = currentText;
            if (textToSave.trim() === "") {
                const storedSettings = await chrome.storage.local.get(['defaultTimestampText']);
                textToSave = storedSettings.defaultTimestampText !== undefined ? storedSettings.defaultTimestampText + "\n\n" : "タイムスタンプ（編集中）  ※ネタバレ注意\n\n";
            }
            textToSave += timestampText;
            textToSave = await replaceNgWords(textToSave);
            chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: textToSave }, () => {
                switchToEditMode(textToSave, { scrollToBottom: true });
            });
        });
    }
}

// --- Event Handlers ---
function adjustSelectedTimestamp(delta) {
    if (!state.selectedTimestampSpan) return;
    let seconds = parseTime(state.selectedTimestampSpan.textContent);
    seconds += delta;
    if (seconds < 0) seconds = 0;
    const newTime = formatTime(seconds);
    state.selectedTimestampSpan.textContent = newTime;
    const fullText = state.editor.textContent;
    chrome.runtime.sendMessage({
        action: "saveText",
        videoId: state.currentVideoId,
        text: fullText
    });
    updateCharCount(fullText);
    updateSpanStyles();
}

async function handleGeneralShortcuts(event) {
  const video = document.querySelector('video');
  if (!video) return;

  if (state.isEditing) {
      // 編集モード中はaddTimestampのみをハンドル
      if (isMatch(event, state.shortcuts.addTimestamp)) {
          event.preventDefault();
          addTimestamp({ stayInEditMode: true });
      }
      return;
  }

  if (state.selectedTimestampSpan) {
      if (event.key === 'ArrowUp') {
          event.preventDefault();
          adjustSelectedTimestamp(1);
      } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          adjustSelectedTimestamp(-1);
      }
  }

  // ショートカットキーの判定ヘルパー関数
  function isMatch(event, shortcut) {
      if (!shortcut) return false; // ショートカットが未定義の場合
      return event.key === shortcut.key &&
             event.shiftKey === shortcut.shiftKey &&
             event.ctrlKey === shortcut.ctrlKey &&
             event.altKey === shortcut.altKey;
  }

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
          chrome.runtime.sendMessage({ action: "loadText", videoId: state.currentVideoId }, async (response) => {
              const currentText = (response && response.text) ? response.text : "";
              let newText = currentText + textToAppend;
              newText = await replaceNgWords(newText);
              chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: newText }, () => {
                  switchToEditMode(newText, { scrollToBottom: true });
              });
          });
      }
  }
}

// --- Utility Functions ---
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

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clearTextInContent") {
    const newText = "";
    chrome.runtime.sendMessage({ action: "saveText", videoId: state.currentVideoId, text: newText }, () => {
        if (state.isEditing) {
            state.editor.value = newText;
        }
        else {
            switchToDisplayMode(newText);
        }
        updateCharCount(newText);
    });
  }
  if (request.action === "reloadExtension") {
    console.log("Reloading extension via popup button.");
    initExtension();
    sendResponse({ status: "reloaded" });
    return true; // 非同期レスポンスのためにtrueを返す
  }
});