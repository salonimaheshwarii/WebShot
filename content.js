// Full Page Screenshot Content Script
class FullPageScreenshot {
    constructor() {
        this.isCapturing = false;
        this.originalScrollPosition = { x: 0, y: 0 };
        this.screenshots = [];
        this.options = {};
    }

    // Get full page dimensions
    getPageDimensions() {
        const body = document.body;
        const html = document.documentElement;

        const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
        );

        const width = Math.max(
            body.scrollWidth,
            body.offsetWidth,
            html.clientWidth,
            html.scrollWidth,
            html.offsetWidth
        );

        return { width, height };
    }

    // Get viewport dimensions
    getViewportDimensions() {
        return {
            width: window.innerWidth,
            height: window.innerHeight
        };
    }

    // Save current scroll position
    saveScrollPosition() {
        this.originalScrollPosition = {
            x: window.pageXOffset || document.documentElement.scrollLeft,
            y: window.pageYOffset || document.documentElement.scrollTop
        };
    }

    // Restore original scroll position
    restoreScrollPosition() {
        window.scrollTo(this.originalScrollPosition.x, this.originalScrollPosition.y);
    }

    // Apply options (hide scrollbars, etc.)
    applyOptions() {
        if (this.options.hideScrollbars) {
            // Hide scrollbars temporarily
            this.originalOverflow = document.documentElement.style.overflow;
            document.documentElement.style.overflow = 'hidden';
        }
    }

    // Restore original options
    restoreOptions() {
        if (this.options.hideScrollbars && this.originalOverflow !== undefined) {
            document.documentElement.style.overflow = this.originalOverflow;
        }
    }

    // Scroll to specific position smoothly
    async scrollToPosition(x, y) {
        return new Promise((resolve) => {
            const currentX = window.pageXOffset || document.documentElement.scrollLeft;
            const currentY = window.pageYOffset || document.documentElement.scrollTop;

            // Only scroll if we're not already at the target position
            if (Math.abs(currentX - x) > 5 || Math.abs(currentY - y) > 5) {
                window.scrollTo(x, y);
                // Wait a bit for rendering to complete after scroll
                setTimeout(resolve, 400);
            } else {
                // Already at position, just wait a short time for any pending renders
                setTimeout(resolve, 100);
            }
        });
    }

    // Send message to popup
    sendMessage(action, data = {}) {
        chrome.runtime.sendMessage({ action, ...data });
    }

    // Calculate capture positions
    calculateCapturePositions() {
        const page = this.getPageDimensions();
        const viewport = this.getViewportDimensions();

        const positions = [];
        const cols = Math.ceil(page.width / viewport.width);
        const rows = Math.ceil(page.height / viewport.height);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                positions.push({
                    x: col * viewport.width,
                    y: row * viewport.height,
                    row,
                    col
                });
            }
        }

        return { positions, cols, rows, page, viewport };
    }

    // Capture single screenshot
    async captureScreenshot() {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.dataUrl);
                }
            });
        });
    }

    // Start the full capture process
    async startCapture(options = {}) {
        if (this.isCapturing) {
            return;
        }

        this.isCapturing = true;
        this.options = options;
        this.screenshots = [];

        try {
            this.sendMessage('captureStatus', { status: 'Preparing capture...', progress: 0 });

            // Save current state
            this.saveScrollPosition();
            this.applyOptions();

            // Calculate all capture positions
            const { positions, cols, rows, page, viewport } = this.calculateCapturePositions();

            this.sendMessage('captureStatus', {
                status: `Capturing ${positions.length} sections...`,
                progress: 5
            });

            // Capture each section
            for (let i = 0; i < positions.length; i++) {
                const position = positions[i];
                const progress = Math.round(((i + 1) / positions.length) * 90); // Save 10% for processing

                this.sendMessage('captureStatus', {
                    status: `Capturing section ${i + 1} of ${positions.length}...`,
                    progress
                });

                // Scroll to position (with smart positioning for first capture)
                if (i === 0) {
                    // For first capture, ensure we're at the exact top-left
                    window.scrollTo(0, 0);
                    await new Promise(resolve => setTimeout(resolve, 400)); // Longer wait for first position
                } else {
                    await this.scrollToPosition(position.x, position.y);
                }

                // Capture screenshot
                const dataUrl = await this.captureScreenshot();

                this.screenshots.push({
                    dataUrl,
                    position,
                    index: i
                });
            }

            this.sendMessage('captureStatus', { status: 'Processing screenshots...', progress: 95 });

            // Combine screenshots
            await this.combineScreenshots(cols, rows, viewport);

            this.sendMessage('captureComplete');

        } catch (error) {
            console.error('Capture error:', error);
            this.sendMessage('captureError', { error: error.message });
        } finally {
            // Restore original state
            this.restoreOptions();
            this.restoreScrollPosition();
            this.isCapturing = false;
        }
    }

    // Combine all screenshots into one image
    async combineScreenshots(cols, rows, viewport) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Set canvas size
                canvas.width = cols * viewport.width;
                canvas.height = rows * viewport.height;

                let loadedImages = 0;
                const totalImages = this.screenshots.length;

                const checkComplete = () => {
                    if (loadedImages === totalImages) {
                        // Convert to blob and download
                        canvas.toBlob((blob) => {
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `fullpage-screenshot-${new Date().getTime()}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                            resolve();
                        }, 'image/png');
                    }
                };

                // Load and draw each screenshot
                this.screenshots.forEach((screenshot) => {
                    const img = new Image();
                    img.onload = () => {
                        const { col, row } = screenshot.position;
                        ctx.drawImage(img, col * viewport.width, row * viewport.height);
                        loadedImages++;
                        checkComplete();
                    };
                    img.onerror = () => {
                        loadedImages++;
                        checkComplete();
                    };
                    img.src = screenshot.dataUrl;
                });

            } catch (error) {
                reject(error);
            }
        });
    }
}

// Initialize the screenshot handler (prevent multiple instances)
let fullPageScreenshot;
if (!window.fullPageScreenshotInstance) {
    fullPageScreenshot = new FullPageScreenshot();
    window.fullPageScreenshotInstance = fullPageScreenshot;
} else {
    fullPageScreenshot = window.fullPageScreenshotInstance;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startCapture') {
        fullPageScreenshot.startCapture(message.options);
        sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
});
