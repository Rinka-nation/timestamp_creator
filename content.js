console.log("Content script loaded!");
let textarea = null;
let timestampDisplayArea = null;
let mainContainer = null; // New main container for both areas
let charCountDisplay = null; // Element to display character count
let currentVideoId = null;
let currentClipTime = null; // Global variable to store time copied by 'u' key

// --- Initialization Observer ---
const observer = new MutationObserver((mutations, obs) => {
  const video = document.querySelector("video");
  if (video) {
    console.log("動画要素が見つかりました");
    if (video.readyState < 2) {
      console.log("動画のデータがまだロードされていません");
      return;
    } else {
      obs.disconnect(); // Stop observing once initialized
      initExtension();

      // Ensure the extension is ready when video data is loaded
      video.addEventListener("loadeddata", () => {
        console.log("動画のデータが完全にロードされました");
      });
    }
  }
});

// Observe `body` for `video` element to be added
observer.observe(document.body, { childList: true, subtree: true });

// If `video` already exists, initialize immediately
if (document.querySelector("video")) {
  initExtension();
}

// --- Helper to get YouTube Video ID ---
function getVideoIdFromUrl(url) {
  const urlParams = new URLSearchParams(new URL(url).search);
  return urlParams.get('v');
}

// --- Main Logic ---
function initExtension() {
  currentVideoId = getVideoIdFromUrl(window.location.href);
  if (!currentVideoId) {
    console.log("YouTube video ID not found on this page.");
    return; // Only initialize on YouTube video pages
  }

  // Add keydown listener for general shortcuts
  document.addEventListener('keydown', handleGeneralShortcuts);

  // Create main container and its children
  createMainContainer();

  // Load and apply visibility state for main container
  chrome.storage.sync.get('mainContainerHidden', (data) => {
    if (mainContainer) {
      mainContainer.hidden = data.mainContainerHidden || false; // Default to visible
    }
  });

  // Initial load of content for the current video
  loadTextareaContentForCurrentVideo();

  // Listen for YouTube's internal navigation events
  window.addEventListener('yt-navigate-finish', () => {
    const newVideoId = getVideoIdFromUrl(window.location.href);
    if (newVideoId && newVideoId !== currentVideoId) {
      console.log('Video ID changed, updating textarea content.');
      currentVideoId = newVideoId;
      loadTextareaContentForCurrentVideo();
    }
  });
}

function loadTextareaContentForCurrentVideo() {
  if (!currentVideoId || !textarea) return;

  chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, (response) => {
    if (response && response.text) {
      textarea.value = response.text;
    } else {
      // Set initial value if no saved text
      textarea.value = "タイムスタンプ（編集中）  ※ネタバレ注意\n\n";
      // Save initial value to storage
      chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: textarea.value });
    }
    updateTimestampDisplayArea(); // Update display area after loading textarea
    updateCharCount(); // Update character count after loading textarea
  });
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  var s = Math.floor(seconds % 60);

  // ref.js の s == "10" s = "09" のロジックを再現
  if (s == 10) s = 9; 
  
  return [
      String(h),
      String(m).padStart(2, '0'),
      String(s).padStart(2, '0')
  ].join(':');
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
      console.log("コピーしました: " + text);
  }).catch(err => {
      console.error("コピーに失敗しました", err);
  });
}

function createMainContainer() {
  if (document.getElementById('youtube-timestamp-main-container')) return;

  mainContainer = document.createElement('div');
  mainContainer.id = 'youtube-timestamp-main-container';
  mainContainer.style.position = 'fixed';
  mainContainer.style.top = '80px';
  mainContainer.style.right = '20px';
  mainContainer.style.width = '400px'; // Smaller initial width
  mainContainer.style.height = '300px'; // Smaller initial height
  mainContainer.style.zIndex = '10001';
  mainContainer.style.backgroundColor = 'rgba(20, 20, 20, 0.95)';
  mainContainer.style.border = '1px solid #505050';
  mainContainer.style.borderRadius = '6px';
  mainContainer.style.resize = 'both';
  mainContainer.style.overflow = 'hidden';
  mainContainer.style.display = 'flex'; // Use flexbox for layout
  mainContainer.style.flexDirection = 'column'; // Stack header, then content

  // Header for dragging
  const header = document.createElement('div');
  header.style.backgroundColor = '#333';
  header.style.color = '#E0E0E0';
  header.style.padding = '5px 10px';
  header.style.cursor = 'grab';
  header.style.textAlign = 'center';
  header.textContent = 'Timestamp Helper';
  header.style.flexShrink = '0'; // Prevent header from shrinking
  mainContainer.appendChild(header);

  // Content area (flex row for panels)
  const contentArea = document.createElement('div');
  contentArea.style.display = 'flex';
  contentArea.style.flexGrow = '1'; // Take remaining vertical space
  contentArea.style.overflow = 'hidden'; // Hide scrollbars for content area
  mainContainer.appendChild(contentArea);

  // Textarea (Left Panel - now reversed)
  textarea = document.createElement('textarea');
  textarea.id = "youtube-timestamp-textarea";
  textarea.placeholder = "Press Shift+Enter to add a timestamp...";
  textarea.setAttribute("spellcheck", "false");
  textarea.style.flex = '1'; // Take equal space initially
  textarea.style.border = 'none';
  textarea.style.backgroundColor = 'transparent';
  textarea.style.color = '#E0E0E0';
  textarea.style.padding = '10px';
  textarea.style.fontFamily = 'monospace';
  textarea.style.fontSize = '13px';
  textarea.style.resize = 'none';
  textarea.style.outline = 'none';
  contentArea.appendChild(textarea);

  // Resizer
  const resizer = document.createElement('div');
  resizer.id = 'youtube-timestamp-resizer';
  resizer.style.width = '5px';
  resizer.style.cursor = 'ew-resize';
  resizer.style.backgroundColor = '#505050';
  resizer.style.flexShrink = '0';
  contentArea.appendChild(resizer);

  // Timestamp Display Area (Right Panel - now reversed)
  timestampDisplayArea = document.createElement('div');
  timestampDisplayArea.id = 'youtube-timestamp-display-area';
  timestampDisplayArea.className = 'custom-editor';
  timestampDisplayArea.setAttribute('contenteditable', 'true');
  timestampDisplayArea.setAttribute("spellcheck", "false");
  timestampDisplayArea.style.flex = '1'; // Take equal space initially
  timestampDisplayArea.style.backgroundColor = 'transparent';
  timestampDisplayArea.style.color = '#E0E0E0';
  timestampDisplayArea.style.padding = '10px';
  timestampDisplayArea.style.fontFamily = 'monospace';
  timestampDisplayArea.style.fontSize = '13px';
  timestampDisplayArea.style.overflowY = 'auto';
  timestampDisplayArea.style.whiteSpace = 'pre-wrap';
  timestampDisplayArea.style.outline = 'none';
  contentArea.appendChild(timestampDisplayArea);

  // Character count display
  charCountDisplay = document.createElement('div');
  charCountDisplay.id = 'youtube-timestamp-char-count';
  charCountDisplay.style.backgroundColor = '#333';
  charCountDisplay.style.color = '#E0E0E0';
  charCountDisplay.style.padding = '5px 10px';
  charCountDisplay.style.textAlign = 'right';
  charCountDisplay.style.fontSize = '11px';
  charCountDisplay.style.flexShrink = '0'; // Prevent from shrinking
  mainContainer.appendChild(charCountDisplay);

  document.body.appendChild(mainContainer);

  // Event Listeners
  makeDraggable(mainContainer, header);
  addResizerFunctionality(resizer, textarea, timestampDisplayArea); // Note: panels are reversed here

  // Load saved content for textarea
  chrome.runtime.sendMessage({ action: "loadText", videoId: currentVideoId }, (response) => {
    if (response && response.text) {
      textarea.value = response.text;
    } else {
      textarea.value = "タイムスタンプ（編集中）  ※ネタバレ注意\n\n";
      chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: textarea.value });
    }
    updateTimestampDisplayArea(); // Update display area after loading textarea
    updateCharCount(); // Update character count after loading textarea
  });

  // Save content on input via background script
  textarea.addEventListener('input', () => {
    chrome.runtime.sendMessage({ action: "saveText", videoId: currentVideoId, text: textarea.value });
    updateTimestampDisplayArea(); // Update display area when textarea changes
    updateCharCount(); // Update character count when textarea changes
  });

  // Add click listener for seeking on timestampDisplayArea
  timestampDisplayArea.addEventListener('click', (e) => {
    const video = document.querySelector('video');
    if (!video) return;

    const clickedText = e.target.textContent;
    const timeMatch = clickedText.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/);
    if (timeMatch) {
      const timeInSeconds = parseTime(timeMatch[0]);
      video.currentTime = timeInSeconds;
      console.log(`Seeking to: ${timeMatch[0]} (${timeInSeconds} seconds)`);
    }
  });
}

function updateTimestampDisplayArea() {
  if (textarea && timestampDisplayArea) {
    const textContent = textarea.value;
    // Replace timestamps with clickable spans
    const formattedContent = textContent.replace(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/g, '<span style="color: #3399FF; cursor: pointer; text-decoration: underline;">$&</span>');
    timestampDisplayArea.innerHTML = formattedContent;
  }
}

function updateCharCount() {
  if (textarea && charCountDisplay) {
    charCountDisplay.textContent = `現在の文字数: ${textarea.value.length}`;
  }
}

function handleGeneralShortcuts(event) {
  const video = document.querySelector('video');
  if (!video) return;

  const activeElement = document.activeElement;

  // ref.js の ] キーの動作を再現
  if (event.key === ']') {
    if (!mainContainer) {
      console.log("メインコンテナが無いので配置");
      createMainContainer();
    } else {
      console.log("メインコンテナある");
      // メインコンテナをデフォルト位置に再配置
      mainContainer.style.top = '80px';
      mainContainer.style.right = '20px';
    }
    console.log("saiyomikomi");
  }

  // ref.js の g キーの動作を再現 (表示/非表示切り替え)
  if (event.key === 'g') {
    event.preventDefault();
    if (mainContainer) {
      mainContainer.hidden = !mainContainer.hidden;
      chrome.storage.sync.set({ mainContainerHidden: mainContainer.hidden });
    }
  }

  // Shift+Enter: テキストエリアがアクティブでも動作するように変更
  if (event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    appendToTextarea(` - ${formatTime(video.currentTime)}  `);
    return; // Prevent further processing for Shift+Enter
  }

  // textarea にフォーカス中なら無視する (ref.js のロジック)
  if (activeElement.tagName === 'TEXTAREA') return;

  // 'p' キーによるタイムスタンプ入力
  if (event.key === "p") {
    event.preventDefault();
    appendToTextarea(` - ${formatTime(video.currentTime)}  `);
  }

  // 'u' キーによるタイムスタンプコピー
  if (event.key === "u") {
    event.preventDefault();
    const time = formatTime(video.currentTime);
    console.log("konotoki=", time);
    copyToClipboard(time);
    currentClipTime = time;
  }

  // 'y' キーによるクリップボードからのタイムスタンプ追記
  if (event.key === "y") {
    event.preventDefault();
    if (currentClipTime) {
      appendToTextarea(` - ${currentClipTime}  `);
    }
  }
}

function appendToTextarea(text) {
  if (!textarea) return;
  
  textarea.value += text;
  textarea.focus();
  const val = textarea.value;
  textarea.selectionStart = textarea.selectionEnd = val.length;

  // Manually dispatch input event to trigger saving via background script
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// Make the element draggable by its handle
function makeDraggable(element, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    dragHandle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
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

// Add resizer functionality
function addResizerFunctionality(resizer, leftPanel, rightPanel) {
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', resizePanels);
    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.removeEventListener('mousemove', resizePanels);
    });
  });

  function resizePanels(e) {
    if (!isResizing) return;

    const containerRect = mainContainer.getBoundingClientRect();
    const newLeftPanelWidth = e.clientX - containerRect.left;
    const totalWidth = containerRect.width;

    // Ensure minimum width for both panels
    const minWidth = 50; 
    if (newLeftPanelWidth < minWidth || (totalWidth - newLeftPanelWidth) < minWidth) {
      return;
    }

    leftPanel.style.flex = 'none';
    leftPanel.style.width = `${newLeftPanelWidth}px`;
    rightPanel.style.flex = '1'; // Right panel takes remaining space
  }
}

// Listen for messages from the background script (for clearing text)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "clearTextInContent") {
    if (textarea) {
      textarea.value = '';
      // Also trigger input event to save the cleared state via background script
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});