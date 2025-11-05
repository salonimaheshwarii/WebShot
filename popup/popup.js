document.addEventListener('DOMContentLoaded', function() {
    const captureBtn = document.getElementById('captureBtn');
    const status = document.getElementById('status');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const includeFixed = document.getElementById('includeFixed');
    const hideScrollbars = document.getElementById('hideScrollbars');

    // Update UI state
    function updateStatus(message, type = 'info') {
        status.textContent = message;
        status.className = `status ${type}`;
    }

    function updateProgress(percentage) {
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }

    function showProgress() {
        progressContainer.style.display = 'block';
        updateProgress(0);
    }

    function hideProgress() {
        progressContainer.style.display = 'none';
    }

    function setButtonState(capturing) {
        captureBtn.disabled = capturing;
        captureBtn.querySelector('.text').textContent = capturing ? 'Capturing...' : 'Capture Full Page';
        captureBtn.querySelector('.icon').textContent = capturing ? '⏳' : '📷';
    }

    // Handle capture button click
    captureBtn.addEventListener('click', async function() {
        try {
            setButtonState(true);
            updateStatus('Initializing capture...', 'info');
            showProgress();

            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error('No active tab found');
            }

            // Get capture options
            const options = {
                includeFixed: includeFixed.checked,
                hideScrollbars: hideScrollbars.checked
            };

            // Try to inject content script if not already present
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
            } catch (injectionError) {
                // Content script might already be injected, or injection failed
                console.log('Content script injection:', injectionError.message);
            }

            // Small delay to ensure content script is ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Send message to content script to start capture
            await chrome.tabs.sendMessage(tab.id, {
                action: 'startCapture',
                options: options
            });

            updateStatus('Starting capture process...', 'info');

        } catch (error) {
            console.error('Error starting capture:', error);
            updateStatus(`Error: ${error.message}`, 'error');
            setButtonState(false);
            hideProgress();
        }
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
            case 'updateProgress':
                updateProgress(message.progress);
                updateStatus(`Capturing... ${message.progress}%`, 'info');
                break;

            case 'captureComplete':
                updateStatus('Screenshot captured successfully!', 'success');
                setButtonState(false);
                hideProgress();
                updateProgress(100);

                // Auto-close popup after 2 seconds
                setTimeout(() => {
                    window.close();
                }, 2000);
                break;

            case 'captureError':
                updateStatus(`Error: ${message.error}`, 'error');
                setButtonState(false);
                hideProgress();
                break;

            case 'captureStatus':
                updateStatus(message.status, 'info');
                if (message.progress !== undefined) {
                    updateProgress(message.progress);
                }
                break;
        }
    });

    // Initialize UI
    updateStatus('Ready to capture');
    setButtonState(false);
    hideProgress();
});