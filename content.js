console.log("Content script loaded!");

// --- Global State ---
let mainContainer = null;
let editor = null; // This will be our single, switchable editor element
let charCountDisplay = null;
let currentVideoId = null;
let currentClipTime = null;
let isEditing = false; // To track application mode (editing vs. display)

// --- Initialization Observer ---
const observer = new MutationObserver((mutations, obs) => {
  const video = document.querySelector("video");
  if (video) {
    obs.disconnect();
    initExtension();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
if (document.querySelector("video")) {
  initExtension();
}

// --- Helper Functions ---
function getVideoIdFromUrl(url) {
  const urlParams = new URLSearchParams(new URL(url).search);
  return urlParams.get('v');
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  let s = Math.floor(seconds % 60);
  if (s === 10) s = 9; // Keep original logic
  return [String(h), String(m).padStart(2, '0'), String(s).padStart(2, '0')].join(':');
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

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log("Copied to clipboard: " + text);
  }).catch(err => {
    console.error("Failed to copy", err);
  });
}

// --- Main Logic ---
function initExtension() {
  currentVideoId = getVideoIdFromUrl(window.location.href);
  if (!currentVideoId) return;

  document.addEventListener('keydown', handleGeneralShortcuts);
  createMainContainer();
  loadAndDisplayText();

  chrome.storage.sync.get('mainContainerHidden', (data) => {
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

  charCountDisplay = document.createElement('div');
  Object.assign(charCountDisplay.style, {
    backgroundColor: '#333', color: '#E0E0E0', padding: '5px 10px',
    textAlign: 'right', fontSize: '11px', flexShrink: '0'
  });
  mainContainer.appendChild(charCountDisplay);

  document.body.appendChild(mainContainer);
  makeDraggable(mainContainer, header);
}

// --- Mode Switching Logic ---

function switchToDisplayMode(text) {
    const scrollableHeight = editor ? editor.scrollHeight - editor.clientHeight : 0;
    const scrollRatio = (editor && scrollableHeight > 0) 
        ? editor.scrollTop / scrollableHeight
        : 0;

    isEditing = false;
    const contentArea = mainContainer.querySelector('div:nth-of-type(2)');
    if (editor) contentArea.removeChild(editor);

    editor = document.createElement('div');
    editor.id = 'youtube-timestamp-display-area';
    Object.assign(editor.style, {
        flex: '1', padding: '10px', fontFamily: 'monospace', fontSize: '13px',
        color: '#E0E0E0', whiteSpace: 'pre-wrap', outline: 'none', overflowY: 'auto'
    });

    const formattedContent = text.replace(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/g, '<span style="color: #3399FF; cursor: pointer; text-decoration: underline;">$&</span>');
    editor.innerHTML = formattedContent;

    editor.addEventListener('dblclick', (e) => {
        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(editor);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                const caretOffset = preCaretRange.toString().length;
                switchToEditMode(text, { caretPosition: caretOffset });
                return;
            }
        }
        switchToEditMode(text);
    });

    editor.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            const video = document.querySelector('video');
            if (video) video.currentTime = parseTime(e.target.textContent);
        }
    });
    
    contentArea.appendChild(editor);
    const newScrollableHeight = editor.scrollHeight - editor.clientHeight;
    if (newScrollableHeight > 0) {
        editor.scrollTop = scrollRatio * newScrollableHeight;
    }
    updateCharCount(text);
}

function switchToEditMode(currentText, options = {}) {
    const { caretPosition = -1, scrollToBottom = false } = options;

    const maintainScroll = caretPosition === -1 && !scrollToBottom;
    const scrollableHeight = editor ? editor.scrollHeight - editor.clientHeight : 0;
    const scrollRatio = (maintainScroll && editor && scrollableHeight > 0) 
        ? editor.scrollTop / scrollableHeight 
        : 0;

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

    editor.addEventListener('input', () => {
        const newText = editor.value;
        chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: newText });
        updateCharCount(newText);
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
    } else if (scrollToBottom) {
        editor.scrollTop = editor.scrollHeight;
    } else if (maintainScroll) {
        const newScrollableHeight = editor.scrollHeight - editor.clientHeight;
        if (newScrollableHeight > 0) {
            editor.scrollTop = scrollRatio * newScrollableHeight;
        }
    }
    
    editor.focus();
    updateCharCount(currentText);
}

// --- Data and UI Update Functions ---

function loadAndDisplayText() {
  if (!currentVideoId) return;
  chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, (response) => {
    const text = (response && response.text) ? response.text : "タイムスタンプ（編集中）  ※ネタバレ注意\n\n";
    if (!isEditing) {
        switchToDisplayMode(text);
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

function addTimestamp(options = {}) {
    const { stayInEditMode = false } = options;
    const video = document.querySelector('video');
    if (!video) return;
    const timestampText = ` - ${formatTime(video.currentTime)}  `;

    if (stayInEditMode && editor.tagName === 'TEXTAREA') {
        const currentText = editor.value;
        const newText = currentText + timestampText;
        editor.value = newText;
        editor.scrollTop = editor.scrollHeight;
        editor.focus();
        editor.selectionStart = editor.selectionEnd = newText.length;
        updateCharCount(newText);
        chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: newText });
    } else {
        chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, (response) => {
            const currentText = (response && response.text) ? response.text : "";
            const newText = currentText + timestampText;
            
            chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: newText }, () => {
                switchToEditMode(newText, { scrollToBottom: true });
            });
        });
    }
}


// --- Event Handlers ---

function handleGeneralShortcuts(event) {
  const video = document.querySelector('video');
  if (!video) return;

  if (isEditing) {
      return;
  }

  if (event.key === ']') {
    if (!mainContainer) createMainContainer();
    else {
        mainContainer.style.top = '80px';
        mainContainer.style.right = '20px';
    }
  }

  if (event.key === 'g') {
    event.preventDefault();
    if (mainContainer) {
      mainContainer.hidden = !mainContainer.hidden;
      chrome.storage.sync.set({ mainContainerHidden: mainContainer.hidden });
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
        chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, (response) => {
            const currentText = (response && response.text) ? response.text : "";
            const newText = currentText + textToAppend;
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
        } else {
            switchToDisplayMode(newText);
        }
        updateCharCount(newText);
    });
  }
});