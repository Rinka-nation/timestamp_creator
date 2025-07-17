document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('timestamps-list');

    // --- API Helper ---
    async function fetchVideoTitle(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`);
            if (!response.ok) {
                console.warn(`Could not fetch title for ${videoId}. Status: ${response.status}`);
                return videoId; // フォールバックとしてIDを返す
            }
            const data = await response.json();
            return data.title || videoId; // タイトルがあれば返し、なければIDを返す
        } catch (error) {
            console.error(`Error fetching title for ${videoId}:`, error);
            return videoId; // エラー時もIDを返す
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

            // 各ビデオのタイトルを非同期で取得
            const itemsWithTitles = await Promise.all(videoItems.map(async (item) => {
                const title = await fetchVideoTitle(item.videoId);
                return { ...item, title };
            }));

            renderList(itemsWithTitles);

        } catch (error) {
            console.error("Error loading timestamps:", error);
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
            titleSpan.textContent = item.title; // ここでタイトルを表示
            titleSpan.style.fontWeight = 'bold';
            titleSpan.style.display = 'block';
            titleSpan.title = item.title; // ホバー時にフルタイトルを表示

            const dateSpan = document.createElement('span');
            dateSpan.textContent = `Updated: ${new Date(item.timestamp).toLocaleString()}`;
            dateSpan.style.fontSize = '0.8em';
            dateSpan.style.color = '#666';

            textContainer.appendChild(titleSpan);
            textContainer.appendChild(dateSpan);

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.dataset.videoId = item.videoId; // Store videoId in data attribute
            deleteButton.style.flexShrink = '0'; // ボタンが縮まないようにする
            deleteButton.style.marginLeft = '10px'; // テキストとの間にマージンを追加
            deleteButton.style.padding = '5px 10px'; // パディングを調整
            deleteButton.style.cursor = 'pointer'; // カーソルをポインターに
            deleteButton.addEventListener('click', handleDelete);

            li.appendChild(textContainer);
            li.appendChild(deleteButton);
            ul.appendChild(li);
        });

        listContainer.appendChild(ul);
    }

    // --- Event Handlers ---
    function handleDelete(event) {
        event.stopPropagation(); // 親要素へのイベント伝播を停止
        const videoId = event.target.dataset.videoId;
        if (confirm(`Are you sure you want to delete the data for video: ${videoId}?`)) {
            chrome.runtime.sendMessage({ action: "deleteVideoData", videoId: videoId }, (response) => {
                if (response && response.status === 'deleted') {
                    console.log(`Successfully deleted data for ${response.videoId}`);
                    loadAndRenderTimestamps(); // リストを再読み込み
                }
            });
        }
    }

    // --- Initial Load ---
    loadAndRenderTimestamps();
});