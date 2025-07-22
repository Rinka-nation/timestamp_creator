console.log("Content script loaded!");

// --- Global State ---
let mainContainer = null;
let editor = null; // This will be our single, switchable editor element
let charCountDisplay = null;
let warningDisplay = null; // For shadowban warnings
let currentVideoId = null;
let currentClipTime = null;
let isEditing = false; // To track application mode (editing vs. display)
let selectedTimestampSpan = null; // To track the selected timestamp span

document.addEventListener('keydown', (event) => {
  if(event.key === ']'){ 
    initExtension();
    console.log("再読み込み");
  }
});

// --- Initialization Observer ---
const observer = new MutationObserver((mutations, obs) => {
  if (document.querySelector("#info-contents")) {
    console.log("Observer found #info-contents, initializing extension.");
    obs.disconnect();
    initExtension();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
if (document.querySelector("#info-contents")) {
  console.log("Element #info-contents already present, initializing extension.");
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
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
    if (isEditing || !editor) return;

    let hasBannedTimestamp = false;

    editor.querySelectorAll('span').forEach(span => {
        const formattedText = span.textContent; // Get the formatted string directly
        const isBanned = isPotentiallyBanned(formattedText);

        if (isBanned) {
            hasBannedTimestamp = true;
        }

        // Apply styles based on priority: Selected > Banned > Normal
        if (span === selectedTimestampSpan) {
            span.style.backgroundColor = 'rgba(255, 255, 0, 0.3)'; // Yellow for selected
        } else if (isBanned) {
            span.style.backgroundColor = 'rgba(255, 99, 71, 0.4)'; // Red for banned
        } else {
            span.style.backgroundColor = 'transparent'; // Normal
        }
    });

    if (warningDisplay) {
        if (hasBannedTimestamp) {
            warningDisplay.textContent = "警告: シャドウバンの可能性があるタイムスタンプが含まれています。";
            warningDisplay.style.display = 'block';
        } else {
            warningDisplay.style.display = 'none';
        }
    }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log("Copied to clipboard: " + text);
  }).catch(err => {
    console.error("Failed to copy", err);
  });
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
function initExtension() {
  currentVideoId = getVideoIdFromUrl(window.location.href);
  if (!currentVideoId) {
    console.error("Timestamp Helper: Could not find video ID. URL:", window.location.href);
    return;
  }
  document.addEventListener('keydown', handleGeneralShortcuts);
  createMainContainer();
  loadAndDisplayText();
  chrome.storage.local.get('mainContainerHidden', (data) => {
    if (mainContainer) {
      mainContainer.hidden = data.mainContainerHidden || false;
    }
  });
  window.addEventListener('yt-navigate-finish', () => {
    const newVideoId = getVideoIdFromUrl(window.location.href);
    if (newVideoId && newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;
      loadAndDisplayText();
    }
  });
}

function createMainContainer() {
  if (document.getElementById('youtube-timestamp-main-container')) return;
  mainContainer = document.createElement('div');
  Object.assign(mainContainer.style, {
    position: 'fixed', top: '80px', right: '20px', width: '400px', height: '300px',
    zIndex: '10001', backgroundColor: 'rgba(20, 20, 20, 0.95)', border: '1px solid #505050',
    borderRadius: '6px', resize: 'both', overflow: 'hidden', display: 'flex', flexDirection: 'column'
  });
  mainContainer.id = 'youtube-timestamp-main-container';
  const header = document.createElement('div');
  Object.assign(header.style, {
    backgroundColor: '#333', color: '#E0E0E0', padding: '5px 10px',
    cursor: 'grab', textAlign: 'center', flexShrink: '0'
  });
  header.textContent = 'Timestamp Helper';
  mainContainer.appendChild(header);
  const contentArea = document.createElement('div');
  Object.assign(contentArea.style, {
      display: 'flex', flexGrow: '1', overflow: 'auto'
  });
  mainContainer.appendChild(contentArea);
  switchToDisplayMode("");
  
  const footer = document.createElement('div');
  footer.style.flexShrink = '0';
  mainContainer.appendChild(footer);

  warningDisplay = document.createElement('div');
  Object.assign(warningDisplay.style, {
      backgroundColor: '#5a3d3d', color: '#ffcccc', padding: '5px 10px',
      textAlign: 'center', fontSize: '12px', display: 'none'
  });
  footer.appendChild(warningDisplay);

  charCountDisplay = document.createElement('div');
  Object.assign(charCountDisplay.style, {
    backgroundColor: '#333', color: '#E0E0E0', padding: '5px 10px',
    textAlign: 'right', fontSize: '11px'
  });
  footer.appendChild(charCountDisplay);

  document.body.appendChild(mainContainer);
  makeDraggable(mainContainer, header);
}

// --- Mode Switching Logic ---
function switchToDisplayMode(text) {
    selectedTimestampSpan = null;
    isEditing = false;
    const contentArea = mainContainer.querySelector('div:nth-of-type(2)');
    if (editor) contentArea.removeChild(editor);
    editor = document.createElement('div');
    editor.id = 'youtube-timestamp-display-area';
    Object.assign(editor.style, {
        flex: '1', padding: '10px', fontFamily: 'monospace', fontSize: '13px',
        color: '#E0E0E0', whiteSpace: 'pre-wrap', outline: 'none', overflowY: 'auto'
    });
    const formattedContent = text.replace(/(\d+:\d{2}:\d{2}|\d{1,2}:\d{2}(?!:))/g, '<span style="color: #3399FF; cursor: pointer; text-decoration: underline;">$&<\/span>');
    editor.innerHTML = formattedContent;
    editor.addEventListener('dblclick', (e) => {
        const currentFullText = editor.textContent;
        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(editor);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                const caretOffset = preCaretRange.toString().length;
                switchToEditMode(currentFullText, { caretPosition: caretOffset });
                return;
            }
        }
        switchToEditMode(currentFullText);
    });
    editor.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            selectedTimestampSpan = e.target;
            updateSpanStyles();
            if (!isYouTubeLive()) {
                const video = document.querySelector('video');
                if (video) {
                    video.currentTime = parseTime(e.target.textContent);
                }
            } else {
                console.log("Timestamp click disabled: Video is live.");
            }
        }
    });
    contentArea.appendChild(editor);
    updateCharCount(text);
    updateSpanStyles();
}

function switchToEditMode(currentText, options = {}) {
    const { caretPosition = -1, scrollToBottom = false } = options;
    isEditing = true;
    const contentArea = mainContainer.querySelector('div:nth-of-type(2)');
    if (editor) contentArea.removeChild(editor);
    editor = document.createElement('textarea');
    editor.id = "youtube-timestamp-textarea";
    Object.assign(editor.style, {
        flex: '1', border: 'none', backgroundColor: 'transparent', color: '#E0E0E0',
        padding: '10px', fontFamily: 'monospace', fontSize: '13px', resize: 'none', outline: 'none'
    });
    editor.setAttribute("spellcheck", "false");
    editor.value = currentText;
    let isComposing = false;
    editor.addEventListener('compositionstart', () => { isComposing = true; });
    editor.addEventListener('compositionend', (event) => {
        isComposing = false;
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    editor.addEventListener('input', async () => {
        if (isComposing) return;
        const newText = editor.value;
        const replacedText = await replaceNgWords(newText);
        chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: replacedText });
        updateCharCount(replacedText);
        if (newText !== replacedText) {
            const cursorPos = editor.selectionStart;
            editor.value = replacedText;
            editor.selectionStart = editor.selectionEnd = cursorPos;
        }
        updateSpanStyles();
    });
    editor.addEventListener('blur', () => {
        switchToDisplayMode(editor.value);
    });
    editor.addEventListener('keydown', (event) => {
        if (event.shiftKey && event.key === "Enter") {
            event.preventDefault();
            addTimestamp({ stayInEditMode: true });
        }
    });
    contentArea.appendChild(editor);
    if (caretPosition !== -1) {
        editor.selectionStart = editor.selectionEnd = caretPosition;
    }
    editor.focus();
    updateCharCount(currentText);
    updateSpanStyles();
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
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
  if (!currentVideoId) return;
  chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, (response) => {
    const text = (response && response.text) ? response.text : "";
    if (!isEditing) {
        switchToDisplayMode(text);
    } else {
        editor.value = text;
    }
    if (!response || !response.text) {
        chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: text });
    }
  });
}

function updateCharCount(text) {
  if (charCountDisplay) {
    charCountDisplay.textContent = `現在の文字数: ${text.length}`;
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

    if (stayInEditMode && editor.tagName === 'TEXTAREA') {
        const currentText = editor.value;
        let newText = currentText + timestampText;
        newText = await replaceNgWords(newText);
        editor.value = newText;
        editor.scrollTop = editor.scrollHeight;
        editor.focus();
        editor.selectionStart = editor.selectionEnd = newText.length;
        updateCharCount(newText);
        chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: newText });
        updateSpanStyles();
    } else {
        chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, async (response) => {
            const currentText = (response && response.text) ? response.text : "";
            let textToSave = currentText;
            if (textToSave.trim() === "") {
                textToSave = "タイムスタンプ（編集中）  ※ネタバレ注意\n\n";
            }
            textToSave += timestampText;
            textToSave = await replaceNgWords(textToSave);
            chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: textToSave }, () => {
                switchToEditMode(textToSave, { scrollToBottom: true });
            });
        });
    }
}

// --- Event Handlers ---
function adjustSelectedTimestamp(delta) {
    if (!selectedTimestampSpan) return;
    let seconds = parseTime(selectedTimestampSpan.textContent);
    seconds += delta;
    if (seconds < 0) seconds = 0;
    const newTime = formatTime(seconds);
    selectedTimestampSpan.textContent = newTime;
    const fullText = editor.textContent;
    chrome.runtime.sendMessage({
        action: "saveText",
        videoId: currentVideoId,
        text: fullText
    });
    updateCharCount(fullText);
    updateSpanStyles();
}

function handleGeneralShortcuts(event) {
  const video = document.querySelector('video');
  if (!video) return;
  if (isEditing) {
      return;
  }
    if (selectedTimestampSpan) {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            adjustSelectedTimestamp(1);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            adjustSelectedTimestamp(-1);
        }
    }
  if (event.key === 'g') {
    event.preventDefault();
    if (mainContainer) {
      mainContainer.hidden = !mainContainer.hidden;
            chrome.storage.local.set({ mainContainerHidden: mainContainer.hidden });
    }
  }
  if (event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    addTimestamp();
  }
  if (event.key === "p") {
    event.preventDefault();
    addTimestamp();
  }
  if (event.key === "u") {
    event.preventDefault();
    const time = formatTime(video.currentTime);
    copyToClipboard(time);
    currentClipTime = time;
  }
  if (event.key === "y") {
    event.preventDefault();
    if (currentClipTime) {
        const textToAppend = ` - ${currentClipTime}  `;
        chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, async (response) => {
            const currentText = (response && response.text) ? response.text : "";
            let newText = currentText + textToAppend;
            newText = await replaceNgWords(newText);
            chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: newText }, () => {
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
    chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: newText }, () => {
        if (isEditing) {
            editor.value = newText;
        }
        else {
            switchToDisplayMode(newText);
        }
        updateCharCount(newText);
    });
  }
});