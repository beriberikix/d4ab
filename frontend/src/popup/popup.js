(function popupBootstrap() {
  'use strict';

  const bridgeBadge = document.getElementById('bridgeBadge');
  const permissionBadge = document.getElementById('permissionBadge');
  const openCenterButton = document.getElementById('openCenterButton');
  const openDebugButton = document.getElementById('openDebugButton');

  const extensionApi = typeof browser !== 'undefined' ? browser : chrome;

  function sendMessage(type, payload = {}) {
    if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.sendMessage === 'function') {
      return browser.runtime.sendMessage({ type, payload });
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  function openPage(path) {
    extensionApi.tabs.create({
      url: extensionApi.runtime.getURL(path)
    });
  }

  async function refreshState() {
    try {
      const response = await sendMessage('UI_GET_STATE');
      const workerState = response.state || {};
      bridgeBadge.className = workerState.nativeConnected ? 'badge ok' : 'badge err';
      bridgeBadge.textContent = workerState.nativeConnected ? 'Bridge: connected' : 'Bridge: disconnected';
      permissionBadge.textContent = `Permissions: ${workerState.permissionCount || 0}`;
    } catch (error) {
      bridgeBadge.className = 'badge err';
      bridgeBadge.textContent = 'Bridge: unavailable';
      permissionBadge.textContent = 'Permissions: n/a';
    }
  }

  openCenterButton.addEventListener('click', () => {
    openPage('src/ui/device_center.html');
  });

  openDebugButton.addEventListener('click', () => {
    openPage('src/ui/debug_console.html');
  });

  refreshState();
})();
