(() => {
  const channelData = [];
  document.querySelectorAll('yt-emoji-picker-category-renderer').forEach(renderer => {
    const customEmojiDiv = renderer.querySelector('.CATEGORY_TYPE_CUSTOM');
    if (!customEmojiDiv) {
      return; // Not a custom emoji category
    }

    const channelNameElement = renderer.querySelector('#title');
    const channelName = channelNameElement ? channelNameElement.textContent.trim() : 'Unknown Channel';
    
    const stamps = [];
    let channelId = null;

    renderer.querySelectorAll('.CATEGORY_TYPE_CUSTOM img').forEach((img, index) => {
      const name = img.getAttribute('aria-label');
      const url = img.src;
      
      if (index === 0) {
          const idAttr = img.getAttribute('id');
          if (idAttr && idAttr.includes('/')) {
              channelId = idAttr.split('/')[0];
          }
      }

      if (name && url) {
        stamps.push({ name, url });
      }
    });

    if (channelId && stamps.length > 0) {
        const existingChannel = channelData.find(c => c.channelId === channelId);
        if (!existingChannel) {
            channelData.push({
                channelId,
                channelName,
                stamps
            });
        }
    }
  });

  return channelData;
})();