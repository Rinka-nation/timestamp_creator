document.addEventListener('DOMContentLoaded', () => {
    // Page elements
    // const homePage = document.getElementById('home-page');
    // const timestampsPage = document.getElementById('timestamps-page');
    // const formatSettingsPage = document.getElementById('format-settings-page');
    // const ngWordsPage = document.getElementById('ng-words-page');
    // const helpPage = document.getElementById('help-page');
    // const shortcutsPage = document.getElementById('shortcuts-page');
    // const membershipStampsPage = document.getElementById('membership-stamps-page');

    // Navigation buttons
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetPageId = event.target.dataset.target;
            showPage(targetPageId);
        });
    });

    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            showPage('home-page');
        });
    });

    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');

        // Load data specific to the page being shown
        if (pageId === 'timestamps-page') {
            loadAndRenderTimestamps();
        } else if (pageId === 'format-settings-page') {
            loadFormatSettings();
        } else if (pageId === 'ng-words-page') {
            loadNgWords();
        } else if (pageId === 'shortcuts-page') {
            loadShortcutSettings();
        } else if (pageId === 'membership-stamps-page') {
            loadAndRenderMembershipStamps();
        }
    }

    // Initial page load
    showPage('home-page');

    // --- Debug: Display Current Channel ID ---
    const debugChannelIdDisplay = document.getElementById('debug-current-channel-id');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getChannelIdForDebug" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error getting channel ID for debug:", chrome.runtime.lastError);
                    debugChannelIdDisplay.textContent = "エラー";
                } else if (response && response.channelId) {
                    debugChannelIdDisplay.textContent = response.channelId;
                } else {
                    debugChannelIdDisplay.textContent = "取得できませんでした";
                }
            });
        } else {
            debugChannelIdDisplay.textContent = "タブが見つかりません";
        }
    });
    // --- End Debug ---

    const reloadButton = document.getElementById('reload-extension-button');
    reloadButton.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          // First, check if the UI exists
          chrome.tabs.sendMessage(tabs[0].id, { action: "checkUIExists" }, (response) => {
            if (chrome.runtime.lastError || !response) {
              // Content script isn't running or didn't respond, so we need to reload.
              console.log('Content script not running. Reloading...');
              // Try to execute the script and then reload the extension logic
              chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ['content.js']
              }).then(() => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "reloadExtension" });
              }).catch(err => console.error('Failed to inject content script:', err));
            } else {
              // Content script is running, decide what to do based on response
              if (response.exists) {
                // UI exists, so toggle visibility
                chrome.tabs.sendMessage(tabs[0].id, { action: "toggleVisibility" });
              } else {
                // UI doesn't exist, so reload
                chrome.tabs.sendMessage(tabs[0].id, { action: "reloadExtension" });
              }
            }
          });
        }
      });
    });

    const getMembershipStampsButton = document.getElementById('get-membership-stamps-button');
    if (getMembershipStampsButton) {
      getMembershipStampsButton.addEventListener('click', () => {
        showPage('membership-stamps-page');
        loadAndRenderMembershipStamps();
      });
    }


    // --- Timestamps List (timestamps-page) ---
    const listContainer = document.getElementById('timestamps-list');

    // --- NG Word Management (ng-words-page) ---
    const ngWordsTextarea = document.getElementById('ng-words-textarea');
    const saveNgWordsButton = document.getElementById('save-ng-words');
    const ngSaveStatus = document.getElementById('save-status');
    const currentNgWordsDiv = document.getElementById('current-ng-words');

    async function loadNgWords() {
        const data = await chrome.storage.local.get('ngWords');
        if (data.ngWords) {
            ngWordsTextarea.value = data.ngWords.join('\n');
            currentNgWordsDiv.textContent = data.ngWords.join(', ');
        }
    }

    async function saveNgWords() {
        const words = ngWordsTextarea.value.split('\n').map(w => w.trim()).filter(Boolean);
        await chrome.storage.local.set({ ngWords: words });
        ngSaveStatus.textContent = '保存しました！';
        setTimeout(() => ngSaveStatus.textContent = '', 2000);
        loadNgWords();
    }

    saveNgWordsButton.addEventListener('click', saveNgWords);


    // --- Shortcut Key Settings (shortcuts-page) ---
    const shortcutInputs = {
        addTimestamp: document.getElementById('shortcut-addTimestamp'),
        addTimestampAlt: document.getElementById('shortcut-addTimestampAlt'),
        toggleVisibility: document.getElementById('shortcut-toggleVisibility'),
        copyTimestamp: document.getElementById('shortcut-copyTimestamp'),
        pasteTimestamp: document.getElementById('shortcut-pasteTimestamp'),
    };
    const saveShortcutsButton = document.getElementById('save-shortcuts');
    const resetShortcutsButton = document.getElementById('reset-shortcuts');
    const shortcutSaveStatus = document.getElementById('shortcut-save-status');

    const defaultShortcuts = {
        addTimestamp: { key: 'Enter', shiftKey: true, ctrlKey: false, altKey: false, code: 'Enter' },
        addTimestampAlt: { key: 'P', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyP' },
        toggleVisibility: { key: 'G', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyG' },
        copyTimestamp: { key: 'U', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyU' },
        pasteTimestamp: { key: 'Y', shiftKey: true, ctrlKey: false, altKey: false, code: 'KeyY' },
    };

    let currentShortcuts = {};

    function keyEventToString(shortcut) {
        let parts = [];
        if (shortcut.ctrlKey) parts.push('Ctrl');
        if (shortcut.altKey) parts.push('Alt');
        if (shortcut.shiftKey) parts.push('Shift');
        parts.push(shortcut.key.toUpperCase());
        return parts.join(' + ');
    }

    function handleShortcutInput(event) {
        event.preventDefault();
        const inputId = event.target.id.replace('shortcut-', '');
        const newShortcut = {
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
        };
        event.target.value = keyEventToString(newShortcut);
        currentShortcuts[inputId] = newShortcut;
    }

    async function loadShortcutSettings() {
        const data = await chrome.storage.local.get('shortcuts');
        currentShortcuts = { ...defaultShortcuts, ...(data.shortcuts || {}) };
        for (const id in shortcutInputs) {
            if (shortcutInputs[id]) { // null check
                shortcutInputs[id].value = keyEventToString(currentShortcuts[id]);
            }
        }
    }

    async function saveShortcutSettings() {
        await chrome.storage.local.set({ shortcuts: currentShortcuts });
        shortcutSaveStatus.textContent = '保存しました！';
        setTimeout(() => shortcutSaveStatus.textContent = '', 2000);
    }

    function resetShortcutSettings() {
        currentShortcuts = { ...defaultShortcuts };
        for (const id in shortcutInputs) {
            if (shortcutInputs[id]) { // null check
                shortcutInputs[id].value = keyEventToString(currentShortcuts[id]);
            }
        }
    }

    for (const id in shortcutInputs) {
        shortcutInputs[id].addEventListener('keydown', handleShortcutInput);
    }
    saveShortcutsButton.addEventListener('click', saveShortcutSettings);
    resetShortcutsButton.addEventListener('click', resetShortcutSettings);


    // --- Timestamp Format Settings (format-settings-page) ---
    const prefixInput = document.getElementById('prefix-input');
    const suffixInput = document.getElementById('suffix-input');
    const defaultTimestampTextInput = document.getElementById('default-timestamp-text-input');
    const saveFormatSettingsButton = document.getElementById('save-format-settings');
    const formatSaveStatus = document.getElementById('format-save-status');
    const formatDemoDisplay = document.getElementById('format-demo-display');

    async function loadFormatSettings() {
        const data = await chrome.storage.local.get(['timestampPrefix', 'timestampSuffix', 'defaultTimestampText']);
        prefixInput.value = data.timestampPrefix !== undefined ? data.timestampPrefix : ' - ';
        suffixInput.value = data.timestampSuffix !== undefined ? data.timestampSuffix : '  ';
        defaultTimestampTextInput.value = data.defaultTimestampText !== undefined ? data.defaultTimestampText : 'タイムスタンプ（編集中）  ※ネタバレ注意';
        updateFormatDemo();
    }

    async function saveFormatSettings() {
        const prefix = prefixInput.value;
        const suffix = suffixInput.value;
        const defaultText = defaultTimestampTextInput.value;
        await chrome.storage.local.set({ timestampPrefix: prefix, timestampSuffix: suffix, defaultTimestampText: defaultText });
        formatSaveStatus.textContent = '保存しました！';
        setTimeout(() => formatSaveStatus.textContent = '', 2000);
        updateFormatDemo();
    }

    function updateFormatDemo() {
        const prefix = prefixInput.value;
        const suffix = suffixInput.value;
        const demoTime = "01:23"; // Example time
        const demoMemo = "ここ好き"
        formatDemoDisplay.textContent = `${prefix}${demoTime}${suffix}${demoMemo}`;
    }

    prefixInput.addEventListener('input', updateFormatDemo);
    suffixInput.addEventListener('input', updateFormatDemo);
    defaultTimestampTextInput.addEventListener('input', updateFormatDemo);
    saveFormatSettingsButton.addEventListener('click', saveFormatSettings);


    // --- API Helper ---
    async function fetchVideoTitle(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`);
            if (!response.ok) {
                
                return videoId;
            }
            const data = await response.json();
            return data.title || videoId;
        } catch (e) {
            console.log(e);
            return videoId;
        }
    }

    // --- Main Function to Load and Render Timestamps ---
    async function loadAndRenderTimestamps() {
        listContainer.innerHTML = '<p>Loading...</p>';
        try {
            const allData = await chrome.storage.local.get(null);
            let videoItems = Object.entries(allData)
                .filter(([key, value]) => key.startsWith('video_') && typeof value === 'object' && value.timestamp && value.text)
                .map(([key, value]) => ({
                    videoId: key.replace('video_', ''),
                    ...value
                }));
            videoItems.sort((a, b) => b.timestamp - a.timestamp);
            const itemsWithTitles = await Promise.all(videoItems.map(async (item) => {
                const title = await fetchVideoTitle(item.videoId);
                return { ...item, title };
            }));
            renderList(itemsWithTitles);
        } catch (e) {
            console.log(e);
            listContainer.innerHTML = '<p>Error loading data. See console.</p>';
        }
    }

    // --- UI Rendering ---
    function renderList(items) {
        listContainer.innerHTML = '';
        if (items.length === 0) {
            listContainer.innerHTML = '<p>No saved timestamps found.</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        items.forEach(item => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px 5px';
            li.style.borderBottom = '1px solid #eee';
            const textContainer = document.createElement('div');
            textContainer.style.textAlign = 'left';
            textContainer.style.overflow = 'hidden';
            textContainer.style.textOverflow = 'ellipsis';
            textContainer.style.whiteSpace = 'nowrap';
            textContainer.style.marginRight = '10px';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = item.title;
            titleSpan.style.fontWeight = 'bold';
            titleSpan.style.display = 'block';
            titleSpan.title = item.title;
            const dateSpan = document.createElement('span');
            dateSpan.textContent = `Updated: ${new Date(item.timestamp).toLocaleString()}`;
            dateSpan.style.fontSize = '0.8em';
            dateSpan.style.color = '#666';
            textContainer.appendChild(titleSpan);
            textContainer.appendChild(dateSpan);
            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<img src="icons/trash_can.png" class="button-icon" style="width: 16px; height: 16px; vertical-align: middle;"> Delete';
            deleteButton.dataset.videoId = item.videoId;
            deleteButton.style.flexShrink = '0';
            deleteButton.style.marginLeft = '10px';
            deleteButton.style.padding = '5px 10px';
            deleteButton.style.cursor = 'pointer';
            deleteButton.addEventListener('click', handleDelete);
            li.appendChild(textContainer);
            li.appendChild(deleteButton);
            ul.appendChild(li);
        });
        listContainer.appendChild(ul);
    }

    // --- Event Handlers ---
    function handleDelete(event) {
        event.stopPropagation();
        const videoId = event.target.dataset.videoId;
        if (confirm(`Are you sure you want to delete the data for video: ${videoId}?`)) {
            chrome.runtime.sendMessage({ action: "deleteVideoData", videoId: videoId }, (response) => {
                if (response && response.status === 'deleted') {
                    
                    loadAndRenderTimestamps();
                }
            });
        }
    }

    // --- Membership Stamps Display (membership-stamps-page) ---
    const membershipStampsList = document.getElementById('membership-stamps-list');
    const updateMembershipStampsButton = document.getElementById('update-membership-stamps-button');

    async function loadAndRenderMembershipStamps() {
        membershipStampsList.innerHTML = '<p>読み込み中...</p>';
        const data = await chrome.storage.local.get('membershipStamps');
        if (data.membershipStamps) {
            renderMembershipStamps(data.membershipStamps);
        } else {
            membershipStampsList.innerHTML = '<p>保存されたメンバーシップスタンプはありません。「スタンプを更新」ボタンを押して取得してください。</p>';
        }
    }

    updateMembershipStampsButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "executeScraper" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error executing scraper:", chrome.runtime.lastError);
                alert("スタンプの取得に失敗しました。YouTubeのページで再度お試しください。");
            } else {
                console.log("Scraped data:", response);
                if (response && response.length > 0) {
                    chrome.storage.local.set({ membershipStamps: response }, () => {
                        loadAndRenderMembershipStamps();
                        alert("スタンプの取得と保存が完了しました。");
                    });
                } else {
                    alert("スタンプが見つかりませんでした。YouTubeの動画ページで絵文字ピッカーを開いてから再度お試しください。");
                }
            }
        });
    });

    function renderMembershipStamps(channelData) {
        membershipStampsList.innerHTML = '';
        if (channelData.length === 0) {
            membershipStampsList.innerHTML = '<p>メンバーシップスタンプは見つかりませんでした。</p>';
            return;
        }

        channelData.forEach(channel => {
            const channelDiv = document.createElement('div');
            channelDiv.style.marginBottom = '15px';
            channelDiv.style.border = '1px solid #eee';
            channelDiv.style.padding = '10px';
            channelDiv.style.borderRadius = '5px';

            const channelTitle = document.createElement('h3');
            channelTitle.textContent = channel.channelName;
            channelTitle.style.marginTop = '0';
            channelTitle.style.marginBottom = '10px';
            channelDiv.appendChild(channelTitle);

            const stampsGrid = document.createElement('div');
            stampsGrid.style.display = 'grid';
            stampsGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
            stampsGrid.style.gap = '10px';

            channel.stamps.forEach(stamp => {
                const stampDiv = document.createElement('div');
                stampDiv.style.textAlign = 'center';
                stampDiv.style.wordBreak = 'break-all';

                const img = document.createElement('img');
                img.src = stamp.url;
                img.alt = stamp.name;
                img.style.width = '50px';
                img.style.height = '50px';
                img.style.objectFit = 'contain';
                img.style.marginBottom = '5px';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = stamp.name;
                nameSpan.style.fontSize = '0.8em';
                nameSpan.style.display = 'block';

                stampDiv.appendChild(img);
                stampDiv.appendChild(nameSpan);
                stampsGrid.appendChild(stampDiv);
            });
            channelDiv.appendChild(stampsGrid);
            membershipStampsList.appendChild(channelDiv);
        });
    }
});