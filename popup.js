document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements --- 
  const dom = {
    pages: {
      home: document.getElementById('home-page'),
      timestamps: document.getElementById('timestamps-page'),
      timestampDetail: document.getElementById('timestamp-detail-page'),
      formatSettings: document.getElementById('format-settings-page'),
      ngWords: document.getElementById('ng-words-page'),
      membershipStamps: document.getElementById('membership-stamps-page'),
      shortcuts: document.getElementById('shortcuts-page'),
      help: document.getElementById('help-page'),
    },
    navButtons: document.querySelectorAll('.nav-button'),
    backButtons: document.querySelectorAll('.back-button'),
    reloadButton: document.getElementById('reload-extension-button'),
    debug: {
      channelIdDisplay: document.getElementById('debug-current-channel-id'),
    },
    timestamps: {
      listContainer: document.getElementById('timestamps-list'),
      searchInput: document.getElementById('timestamp-search-input'),
    },
    detail: {
      title: document.getElementById('detail-video-title'),
      text: document.getElementById('detail-timestamp-text'),
      gotoButton: document.getElementById('detail-goto-button'),
      deleteButton: document.getElementById('detail-delete-button'),
    },
    ngWords: {
      textarea: document.getElementById('ng-words-textarea'),
      saveButton: document.getElementById('save-ng-words'),
      status: document.getElementById('save-status'),
      currentWords: document.getElementById('current-ng-words'),
    },
    formatSettings: {
      prefixInput: document.getElementById('prefix-input'),
      suffixInput: document.getElementById('suffix-input'),
      defaultTextInput: document.getElementById('default-timestamp-text-input'),
      saveButton: document.getElementById('save-format-settings'),
      status: document.getElementById('format-save-status'),
      demo: document.getElementById('format-demo-display'),
    },
    shortcuts: {
      inputs: {
        addTimestamp: document.getElementById('shortcut-addTimestamp'),
        addTimestampAlt: document.getElementById('shortcut-addTimestampAlt'),
        toggleVisibility: document.getElementById('shortcut-toggleVisibility'),
        copyTimestamp: document.getElementById('shortcut-copyTimestamp'),
        pasteTimestamp: document.getElementById('shortcut-pasteTimestamp'),
      },
      saveButton: document.getElementById('save-shortcuts'),
      resetButton: document.getElementById('reset-shortcuts'),
      status: document.getElementById('shortcut-save-status'),
    },
    membershipStamps: {
      list: document.getElementById('membership-stamps-list'),
      updateButton: document.getElementById('update-membership-stamps-button'),
    },
  };

  let allTimestampItems = [];

  // --- Page Initializers ---
  const pageInitializers = {
    'home-page': initHomePage,
    'timestamps-page': initTimestampsPage,
    'format-settings-page': initFormatSettingsPage,
    'ng-words-page': initNgWordsPage,
    'shortcuts-page': initShortcutsPage,
    'membership-stamps-page': initMembershipStampsPage,
  };

  // --- Navigation ---
  function showPage(pageId) {
    Object.values(dom.pages).forEach(page => page.classList.remove('active'));
    const pageKey = pageId.replace('-page', '').replace(/-([a-z])/g, g => g[1].toUpperCase());
    const targetPage = dom.pages[pageKey];
    if (targetPage) {
      targetPage.classList.add('active');
      if (pageInitializers[pageId]) {
        pageInitializers[pageId]();
      }
    }
  }

  function setupNavigation() {
    dom.navButtons.forEach(button => {
      button.addEventListener('click', (event) => showPage(event.currentTarget.dataset.target));
    });
    dom.backButtons.forEach(button => {
      button.addEventListener('click', (event) => showPage(event.currentTarget.dataset.target));
    });
  }

  // --- Page Logic ---
  function initHomePage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) {
        dom.debug.channelIdDisplay.textContent = "タブが見つかりません";
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "getChannelIdForDebug" }, (response) => {
        if (chrome.runtime.lastError) {
          dom.debug.channelIdDisplay.textContent = "エラー";
        } else {
          dom.debug.channelIdDisplay.textContent = response?.channelId || "取得できませんでした";
        }
      });
    });
  }

  async function initTimestampsPage() {
    const listContainer = dom.timestamps.listContainer;
    listContainer.innerHTML = '<p>Loading...</p>';
    
    dom.timestamps.searchInput.removeEventListener('input', handleSearch);
    dom.timestamps.searchInput.addEventListener('input', handleSearch);
    dom.timestamps.searchInput.value = '';

    try {
      const allData = await chrome.storage.local.get(null);
      const videoItems = Object.entries(allData)
        .filter(([key, value]) => key.startsWith('video_') && typeof value === 'object' && value.timestamp && value.text)
        .map(([key, value]) => ({ videoId: key.replace('video_', ''), ...value }))
        .sort((a, b) => b.timestamp - a.timestamp);

      allTimestampItems = await Promise.all(videoItems.map(async (item) => {
        const title = await fetchVideoTitle(item.videoId);
        return { ...item, title };
      }));
      
      renderList(allTimestampItems);
    } catch (e) {
      listContainer.innerHTML = '<p>Error loading data.</p>';
    }
  }

  function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    if (!query) {
      renderList(allTimestampItems);
      return;
    }
    const filteredItems = allTimestampItems.filter(item => 
      item.title.toLowerCase().includes(query) || 
      item.text.toLowerCase().includes(query)
    );
    renderList(filteredItems, true);
  }
  
  function renderList(items, isSearchResult = false) {
    const listContainer = dom.timestamps.listContainer;
    listContainer.innerHTML = '';
    if (items.length === 0) {
        listContainer.innerHTML = isSearchResult 
            ? '<p>該当するタイムスタンプは見つかりませんでした。</p>' 
            : '<p>保存されているタイムスタンプはありません。</p>';
        return;
    }
    const ul = document.createElement('ul');
    items.forEach(item => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        
        const textContainer = document.createElement('div');
        textContainer.style.cssText = 'flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; margin-right: 10px;';
        textContainer.innerHTML = `
            <strong title="${item.title}">${item.title}</strong>
            <small style="display: block; color: #666;">Updated: ${new Date(item.timestamp).toLocaleString()}</small>
        `;
        textContainer.addEventListener('click', () => showDetailPage(item.videoId, item.title));

        const deleteButton = document.createElement('button');
        deleteButton.dataset.videoId = item.videoId;
        deleteButton.dataset.videoTitle = item.title;
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', handleDeleteTimestamp);

        li.appendChild(textContainer);
        li.appendChild(deleteButton);
        ul.appendChild(li);
    });
    listContainer.appendChild(ul);
  }

  function handleDeleteTimestamp(event) {
    const videoId = event.currentTarget.dataset.videoId;
    const videoTitle = event.currentTarget.dataset.videoTitle;
    if (confirm(`'${videoTitle}' のデータを削除しますか？`)) {
      chrome.runtime.sendMessage({ action: "deleteVideoData", videoId }, (response) => {
        if (response?.status === 'deleted') {
          initTimestampsPage();
        }
      });
    }
  }

  async function showDetailPage(videoId, videoTitle) {
    const key = `video_${videoId}`;
    const data = await chrome.storage.local.get(key);
    const text = data[key]?.text ?? '保存されたテキストはありません。';

    dom.detail.title.textContent = videoTitle;
    dom.detail.text.value = text;

    dom.detail.gotoButton.onclick = () => {
      chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}` });
    };

    dom.detail.deleteButton.onclick = () => {
      if (confirm(`'${videoTitle}' のタイムスタンプを本当に削除しますか？`)) {
        chrome.runtime.sendMessage({ action: "deleteVideoData", videoId }, (response) => {
          if (response?.status === 'deleted') {
            showPage('timestamps-page');
          }
        });
      }
    };
    
    showPage('timestamp-detail-page');
  }

  async function fetchVideoTitle(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`);
        if (!response.ok) return videoId;
        const data = await response.json();
        return data.title || videoId;
    } catch (e) {
        return videoId;
    }
  }

  async function initNgWordsPage() {
    const { ngWords } = await chrome.storage.local.get('ngWords');
    if (ngWords) {
      dom.ngWords.textarea.value = ngWords.join('\n');
      dom.ngWords.currentWords.textContent = ngWords.join(', ');
    }
    dom.ngWords.saveButton.onclick = async () => {
      const words = dom.ngWords.textarea.value.split('\n').map(w => w.trim()).filter(Boolean);
      await chrome.storage.local.set({ ngWords: words });
      dom.ngWords.status.textContent = '保存しました！';
      setTimeout(() => dom.ngWords.status.textContent = '', 2000);
      initNgWordsPage();
    };
  }

  async function initFormatSettingsPage() {
    const settings = await chrome.storage.local.get(['timestampPrefix', 'timestampSuffix', 'defaultTimestampText']);
    dom.formatSettings.prefixInput.value = settings.timestampPrefix ?? ' - ';
    dom.formatSettings.suffixInput.value = settings.timestampSuffix ?? '  ';
    dom.formatSettings.defaultTextInput.value = settings.defaultTimestampText ?? 'タイムスタンプ（編集中）  ※ネタバレ注意';
    
    const updateDemo = () => {
      const prefix = dom.formatSettings.prefixInput.value;
      const suffix = dom.formatSettings.suffixInput.value;
      dom.formatSettings.demo.textContent = `${prefix}01:23${suffix}ここ好き`;
    };

    ['input', 'change'].forEach(evt => {
        dom.formatSettings.prefixInput.addEventListener(evt, updateDemo);
        dom.formatSettings.suffixInput.addEventListener(evt, updateDemo);
    });

    dom.formatSettings.saveButton.onclick = async () => {
      await chrome.storage.local.set({
        timestampPrefix: dom.formatSettings.prefixInput.value,
        timestampSuffix: dom.formatSettings.suffixInput.value,
        defaultTimestampText: dom.formatSettings.defaultTextInput.value,
      });
      dom.formatSettings.status.textContent = '保存しました！';
      setTimeout(() => dom.formatSettings.status.textContent = '', 2000);
      updateDemo();
    };
    updateDemo();
  }

  async function initShortcutsPage() {
    const defaultShortcuts = {
        addTimestamp: { key: 'Enter', shiftKey: true, ctrlKey: false, altKey: false },
        addTimestampAlt: { key: 'P', shiftKey: true, ctrlKey: false, altKey: false },
        toggleVisibility: { key: 'G', shiftKey: true, ctrlKey: false, altKey: false },
        copyTimestamp: { key: 'U', shiftKey: true, ctrlKey: false, altKey: false },
        pasteTimestamp: { key: 'Y', shiftKey: true, ctrlKey: false, altKey: false },
    };
    let currentShortcuts = {};

    const keyEventToString = (sc) => [
        sc.ctrlKey && 'Ctrl',
        sc.altKey && 'Alt',
        sc.shiftKey && 'Shift',
        sc.key.toUpperCase(),
    ].filter(Boolean).join(' + ');

    const data = await chrome.storage.local.get('shortcuts');
    currentShortcuts = { ...defaultShortcuts, ...(data.shortcuts || {}) };
    Object.entries(dom.shortcuts.inputs).forEach(([id, input]) => {
      if (input) input.value = keyEventToString(currentShortcuts[id]);
    });

    Object.values(dom.shortcuts.inputs).forEach(input => {
      input.onkeydown = (e) => {
        e.preventDefault();
        const id = e.target.id.replace('shortcut-', '');
        currentShortcuts[id] = { key: e.key, code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey };
        e.target.value = keyEventToString(currentShortcuts[id]);
      };
    });

    dom.shortcuts.saveButton.onclick = async () => {
      await chrome.storage.local.set({ shortcuts: currentShortcuts });
      dom.shortcuts.status.textContent = '保存しました！';
      setTimeout(() => dom.shortcuts.status.textContent = '', 2000);
    };

    dom.shortcuts.resetButton.onclick = () => {
      currentShortcuts = { ...defaultShortcuts };
      Object.entries(dom.shortcuts.inputs).forEach(([id, input]) => {
        if (input) input.value = keyEventToString(currentShortcuts[id]);
      });
    };
  }

  async function initMembershipStampsPage() {
    const listEl = dom.membershipStamps.list;
    listEl.innerHTML = '<p>読み込み中...</p>';
    const { membershipStamps } = await chrome.storage.local.get('membershipStamps');
    
    if (!membershipStamps || membershipStamps.length === 0) {
      listEl.innerHTML = '<p>保存されたスタンプはありません。「スタンプを更新」を押してください。</p>';
      return;
    }

    listEl.innerHTML = '';
    membershipStamps.forEach(channel => {
      const channelDiv = document.createElement('div');
      channelDiv.className = 'channel-container';
      const stampsGrid = channel.stamps.map(stamp => `
        <div class="stamp-container">
          <img src="${stamp.url}" alt="${stamp.name}" class="stamp-img">
          <span class="stamp-name">${stamp.name}</span>
        </div>
      `).join('');
      channelDiv.innerHTML = `<h3>${channel.channelName}</h3><div class="stamps-grid">${stampsGrid}</div>`;
      listEl.appendChild(channelDiv);
    });
  }

  dom.membershipStamps.updateButton.onclick = () => {
    chrome.runtime.sendMessage({ action: "executeScraper" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        alert("スタンプの取得に失敗しました。YouTubeのページで再度お試しください。");
      } else if (response.length > 0) {
        chrome.storage.local.set({ membershipStamps: response }, () => {
          initMembershipStampsPage();
          alert("スタンプの取得と保存が完了しました。");
        });
      } else {
        alert("スタンプが見つかりませんでした。絵文字ピッカーを開いてから再度お試しください。");
      }
    });
  };

  dom.reloadButton.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "reloadExtension" });
      }
    });
  };

  // --- Initial Load ---
  setupNavigation();
  showPage('home-page');
});
