(function debugConsoleBootstrap() {
  'use strict';

  const refs = {
    nativeStatus: document.getElementById('nativeStatus'),
    tabStatus: document.getElementById('tabStatus'),
    pendingStatus: document.getElementById('pendingStatus'),
    stateTimestamp: document.getElementById('stateTimestamp'),
    refreshStateButton: document.getElementById('refreshStateButton'),
    clearLogsButton: document.getElementById('clearLogsButton'),
    downloadLogsButton: document.getElementById('downloadLogsButton'),
    refreshPermissionsButton: document.getElementById('refreshPermissionsButton'),
    logContainer: document.getElementById('logContainer'),
    permissionTableBody: document.getElementById('permissionTableBody')
  };

  async function sendMessage(type, payload = {}) {
    if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.sendMessage === 'function') {
      const result = await browser.runtime.sendMessage({ type, payload });
      if (result && result.error) {
        throw new Error(result.error);
      }
      return result || {};
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.error) {
          reject(new Error(response.error));
          return;
        }

        resolve(response || {});
      });
    });
  }

  function renderState(workerState) {
    const connected = !!workerState.nativeConnected;
    refs.nativeStatus.className = connected ? 'badge ok' : 'badge err';
    refs.nativeStatus.textContent = connected ? 'Bridge: connected' : 'Bridge: disconnected';
    refs.tabStatus.textContent = `Tabs: ${workerState.connectedTabs}`;
    refs.pendingStatus.textContent = `In-flight: ${workerState.pendingNativeRequests}`;
    refs.stateTimestamp.textContent = `Updated ${new Date(workerState.timestamp).toLocaleString()}`;
  }

  function renderLogs(logs) {
    refs.logContainer.innerHTML = '';

    if (!Array.isArray(logs) || logs.length === 0) {
      refs.logContainer.innerHTML = '<p class="small">No logs yet. Device operations and bridge events appear here.</p>';
      return;
    }

    logs.forEach((log) => {
      const levelClass = log.level === 'error' ? 'badge err' : log.level === 'warn' ? 'badge warn' : 'badge';
      const item = document.createElement('article');
      item.className = 'log-item';
      item.innerHTML = `
        <div class="toolbar" style="margin: 0;">
          <span class="${levelClass}">${String(log.level || 'info').toUpperCase()}</span>
          <span class="badge">${log.category || 'general'}</span>
          <span class="spacer"></span>
          <span class="small">${new Date(log.timestamp).toLocaleTimeString()}</span>
        </div>
        <div><strong>${log.message || ''}</strong></div>
        ${log.details ? `<pre>${JSON.stringify(log.details, null, 2)}</pre>` : ''}
      `;
      refs.logContainer.appendChild(item);
    });
  }

  function renderPermissions(permissions) {
    refs.permissionTableBody.innerHTML = '';

    if (!Array.isArray(permissions) || permissions.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="4" class="small">No permissions granted</td>';
      refs.permissionTableBody.appendChild(row);
      return;
    }

    permissions.forEach((permission) => {
      const row = document.createElement('tr');
      const originCell = document.createElement('td');
      originCell.textContent = permission.origin;

      const deviceCell = document.createElement('td');
      deviceCell.textContent = permission.deviceId;

      const capabilityCell = document.createElement('td');
      capabilityCell.textContent = (permission.capabilities || []).join(', ');

      const actionCell = document.createElement('td');
      const button = document.createElement('button');
      button.className = 'btn alt';
      button.textContent = 'Revoke';
      button.setAttribute('data-key', permission.key || '');
      actionCell.appendChild(button);

      row.appendChild(originCell);
      row.appendChild(deviceCell);
      row.appendChild(capabilityCell);
      row.appendChild(actionCell);
      refs.permissionTableBody.appendChild(row);
    });

    refs.permissionTableBody.querySelectorAll('button[data-key]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const target = event.currentTarget;
        const key = target.getAttribute('data-key');

        target.disabled = true;
        try {
          await sendMessage('UI_PERMISSION_REVOKE', { key });
          await refreshAll();
        } catch (error) {
          target.disabled = false;
          alert(`Failed to revoke permission: ${error.message}`);
        }
      });
    });
  }

  function exportLogs(logs) {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `d4ab-debug-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function refreshState() {
    const response = await sendMessage('UI_GET_STATE');
    renderState(response.state || {});
  }

  async function refreshLogs() {
    const response = await sendMessage('UI_GET_LOGS');
    renderLogs(response.logs || []);
    return response.logs || [];
  }

  async function refreshPermissions() {
    const response = await sendMessage('UI_PERMISSION_LIST');
    renderPermissions(response.permissions || []);
  }

  async function refreshAll() {
    await Promise.all([refreshState(), refreshLogs(), refreshPermissions()]);
  }

  async function initialize() {
    refs.refreshStateButton.addEventListener('click', refreshState);
    refs.refreshPermissionsButton.addEventListener('click', refreshPermissions);

    refs.clearLogsButton.addEventListener('click', async () => {
      await sendMessage('UI_CLEAR_LOGS');
      await refreshLogs();
    });

    refs.downloadLogsButton.addEventListener('click', async () => {
      const logs = await refreshLogs();
      exportLogs(logs);
    });

    await refreshAll();
    setInterval(refreshState, 4000);
    setInterval(refreshLogs, 5000);
  }

  initialize().catch((error) => {
    refs.logContainer.innerHTML = `<p class="small">Initialization failed: ${error.message}</p>`;
  });
})();
