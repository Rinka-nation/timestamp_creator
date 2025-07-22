document.addEventListener('DOMContentLoaded', () => {
    // Page elements
    const homePage = document.getElementById('home-page');
    const timestampsPage = document.getElementById('timestamps-page');
    const formatSettingsPage = document.getElementById('format-settings-page');
    const ngWordsPage = document.getElementById('ng-words-page');
    const helpPage = document.getElementById('help-page');

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
        }
    }

    // Initial page load
    showPage('home-page');


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
        defaultTimestampTextInput.value = data.defaultTimestampText !== undefined ? data.defaultTimestampText : 'タイムスタンプ（編集中）  ※ネタバレ注意\n\n';
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
        const defaultText = defaultTimestampTextInput.value;
        const demoTime = "01:23"; // Example time
        const demoMemo = "ここ好き"
        formatDemoDisplay.textContent = `${defaultText.replace(/\\n/g, '\n')}${prefix}${demoTime}${suffix}${demoMemo}`;
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
        } catch (error) {
            
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
        } catch (error) {
            
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
});