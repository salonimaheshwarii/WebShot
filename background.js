// Background script for Full Page Screenshot extension

// Handle screenshot capture requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'captureTab') {
        // Capture the visible area of the tab
        chrome.tabs.captureVisibleTab(
            sender.tab.windowId,
            { format: 'png', quality: 100 },
            (dataUrl) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ error: chrome.runtime.lastError.message });
                } else {
                    sendResponse({ dataUrl: dataUrl });
                }
            }
        );
        return true; // Keep message channel open for async response
    }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Full Page Screenshot extension installed');
    } else if (details.reason === 'update') {
        console.log('Full Page Screenshot extension updated');
    }

    // Add context menu item for quick access
    try {
        chrome.contextMenus.create({
            id: 'fullPageScreenshot',
            title: 'Take Full Page Screenshot',
            contexts: ['page']
        });
    } catch (error) {
        console.log('Context menu creation failed:', error);
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Full Page Screenshot extension started');
});

// Handle context menu click (only if contextMenus API is available)
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'fullPageScreenshot') {
            // Send message to content script to start capture
            chrome.tabs.sendMessage(tab.id, {
                action: 'startCapture',
                options: {
                    includeFixed: true,
                    hideScrollbars: true
                }
            });
        }
    });
}
