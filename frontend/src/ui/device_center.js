(function deviceCenterBootstrap() {
  'use strict';

  const query = new URLSearchParams(window.location.search);

  const state = {
    devices: [],
    selectedDevice: null,
    chooser: {
      id: query.get('chooserId'),
      active: !!query.get('chooserId'),
      context: null
    }
  };

  const refs = {
    chooserPanel: document.getElementById('chooserPanel'),
    chooserContext: document.getElementById('chooserContext'),
    chooserStatus: document.getElementById('chooserStatus'),
    chooserBadge: document.getElementById('chooserBadge'),
    cancelChooserButton: document.getElementById('cancelChooserButton'),
    nativeStatus: document.getElementById('nativeStatus'),
    permissionCount: document.getElementById('permissionCount'),
    requestCount: document.getElementById('requestCount'),
    refreshStateButton: document.getElementById('refreshStateButton'),
    openDiagnosticsButton: document.getElementById('openDiagnosticsButton'),
    typeSelect: document.getElementById('typeSelect'),
    scanDurationInput: document.getElementById('scanDurationInput'),
    includeDisconnectedInput: document.getElementById('includeDisconnectedInput'),
    scanButton: document.getElementById('scanButton'),
    deviceList: document.getElementById('deviceList'),
    selectedDeviceName: document.getElementById('selectedDeviceName'),
    selectedDeviceMeta: document.getElementById('selectedDeviceMeta'),
    grantButton: document.getElementById('grantButton'),
    connectButton: document.getElementById('connectButton'),
    disconnectButton: document.getElementById('disconnectButton'),
    writePayloadInput: document.getElementById('writePayloadInput'),
    writeButton: document.getElementById('writeButton'),
    readButton: document.getElementById('readButton'),
    commandResult: document.getElementById('commandResult'),
    activityLog: document.getElementById('activityLog'),
    quickCommandCard: document.getElementById('quickCommandCard'),
    selectedDeviceCard: document.getElementById('selectedDeviceCard'),
    activityCard: document.getElementById('activityCard')
  };

  function getRuntimeMessage(message) {
    if (typeof browser !== 'undefined' && browser.runtime && typeof browser.runtime.sendMessage === 'function') {
      return browser.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  async function request(type, payload = {}) {
    const response = await getRuntimeMessage({ type, payload });
    if (response && response.error) {
      throw new Error(response.error);
    }
    return response || {};
  }

  function badgeClassForState(connected) {
    return connected ? 'badge ok' : 'badge err';
  }

  function isChooserMode() {
    return state.chooser.active;
  }

  function addActivity(level, message, details) {
    const item = document.createElement('div');
    item.className = 'log-item';

    const badgeClass = level === 'error' ? 'badge err' : level === 'warn' ? 'badge warn' : 'badge';
    const detailsText = details ? `\n${JSON.stringify(details, null, 2)}` : '';

    item.innerHTML = `<span class="${badgeClass}">${level.toUpperCase()}</span> <strong>${message}</strong><pre>${new Date().toLocaleTimeString()}${detailsText}</pre>`;
    refs.activityLog.prepend(item);

    while (refs.activityLog.children.length > 25) {
      refs.activityLog.removeChild(refs.activityLog.lastElementChild);
    }
  }

  function describeDevice(device) {
    const bits = [];
    if (device.type) bits.push(`type: ${device.type}`);
    if (device.vendorId !== undefined) bits.push(`vendor: 0x${Number(device.vendorId).toString(16)}`);
    if (device.productId !== undefined) bits.push(`product: 0x${Number(device.productId).toString(16)}`);
    if (device.serialNumber) bits.push(`serial: ${device.serialNumber}`);
    bits.push(`id: ${device.id}`);
    return bits.join(' | ');
  }

  function setSelectedDevice(device) {
    state.selectedDevice = device;
    if (!device) {
      refs.selectedDeviceName.textContent = 'No device selected';
      refs.selectedDeviceMeta.textContent = '';
      refs.commandResult.textContent = '';
      return;
    }

    refs.selectedDeviceName.textContent = device.name || device.productName || device.id;
    refs.selectedDeviceMeta.textContent = describeDevice(device);
    renderDevices();
  }

  function renderDevices() {
    refs.deviceList.innerHTML = '';

    if (state.devices.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'small';
      empty.textContent = 'No devices found. Adjust filters and scan again.';
      refs.deviceList.appendChild(empty);
      return;
    }

    state.devices.forEach((device) => {
      const card = document.createElement('article');
      card.className = `device-card${state.selectedDevice?.id === device.id ? ' selected' : ''}`;
      const label = device.name || device.productName || 'Unnamed device';
      const statusClass = device.connected ? 'badge ok' : 'badge warn';
      const statusText = device.connected ? 'Connected' : 'Disconnected';

      card.innerHTML = `
        <div class="device-head">
          <h3 class="device-title">${label}</h3>
          <span class="${statusClass}">${statusText}</span>
        </div>
        <p class="device-meta">${describeDevice(device)}</p>
        <div class="device-actions">
          <button class="btn alt" data-action="focus">Details</button>
          <button class="btn" data-action="grant">Grant</button>
          <button class="btn alt" data-action="connect">Connect</button>
          <button class="btn alt" data-action="disconnect">Disconnect</button>
        </div>
      `;

      card.querySelector('[data-action="focus"]').addEventListener('click', () => {
        setSelectedDevice(device);
      });

      card.querySelector('[data-action="grant"]').addEventListener('click', async () => {
        setSelectedDevice(device);
        await grantSelectedDevice();
      });

      card.querySelector('[data-action="connect"]').addEventListener('click', async () => {
        setSelectedDevice(device);
        await invokeForSelected('connect', {});
      });

      card.querySelector('[data-action="disconnect"]').addEventListener('click', async () => {
        setSelectedDevice(device);
        await invokeForSelected('disconnect', {});
      });

      refs.deviceList.appendChild(card);
    });
  }

  async function refreshState() {
    try {
      const { state: workerState } = await request('UI_GET_STATE');
      refs.nativeStatus.className = badgeClassForState(workerState.nativeConnected);
      refs.nativeStatus.textContent = workerState.nativeConnected ? 'Bridge: connected' : 'Bridge: disconnected';
      refs.permissionCount.textContent = `Permissions: ${workerState.permissionCount}`;
      refs.requestCount.textContent = `In-flight: ${workerState.pendingNativeRequests} | Choosers: ${workerState.pendingChoosers || 0}`;
    } catch (error) {
      refs.nativeStatus.className = 'badge err';
      refs.nativeStatus.textContent = 'Bridge: unavailable';
      addActivity('error', 'Failed to refresh state', { error: error.message });
    }
  }

  async function enumerateDevices() {
    refs.scanButton.disabled = true;
    const type = refs.typeSelect.value;

    try {
      addActivity('info', `Scanning ${type} devices`, {
        includeDisconnected: refs.includeDisconnectedInput.checked,
        scanDuration: Number(refs.scanDurationInput.value)
      });

      const response = await request('UI_ENUMERATE', {
        type,
        chooserId: state.chooser.id,
        includeDisconnected: refs.includeDisconnectedInput.checked,
        scanDuration: Number(refs.scanDurationInput.value)
      });

      state.devices = Array.isArray(response.devices) ? response.devices : [];
      if (state.selectedDevice) {
        const latest = state.devices.find((item) => item.id === state.selectedDevice.id) || null;
        setSelectedDevice(latest);
      }

      renderDevices();
      addActivity('info', `Found ${state.devices.length} devices`, { type });
      await refreshState();
    } catch (error) {
      addActivity('error', 'Scan failed', { error: error.message });
    } finally {
      refs.scanButton.disabled = false;
    }
  }

  async function grantSelectedDevice() {
    if (!state.selectedDevice) {
      addActivity('warn', 'Select a device before granting access');
      return;
    }

    try {
      await request('UI_SELECT_DEVICE', {
        type: refs.typeSelect.value,
        chooserId: state.chooser.id,
        deviceId: state.selectedDevice.id
      });
      addActivity('info', 'Access granted', { deviceId: state.selectedDevice.id });
      if (isChooserMode()) {
        refs.chooserStatus.className = 'badge ok';
        refs.chooserStatus.textContent = 'Selection sent';
        setTimeout(() => {
          window.close();
        }, 250);
      }
      await refreshState();
    } catch (error) {
      addActivity('error', 'Grant failed', { error: error.message, deviceId: state.selectedDevice.id });
    }
  }

  async function cancelChooser() {
    if (!isChooserMode()) {
      return;
    }

    try {
      await request('UI_CANCEL_CHOOSER', {
        chooserId: state.chooser.id,
        reason: 'User cancelled chooser'
      });
      refs.chooserStatus.className = 'badge warn';
      refs.chooserStatus.textContent = 'Cancelled';
    } catch (error) {
      addActivity('warn', 'Chooser cancellation may already be completed', { error: error.message });
    } finally {
      setTimeout(() => {
        window.close();
      }, 150);
    }
  }

  async function invokeForSelected(method, params) {
    if (isChooserMode()) {
      addActivity('warn', 'Direct device commands are disabled while chooser mode is active');
      return;
    }

    if (!state.selectedDevice) {
      addActivity('warn', `Select a device before calling ${method}`);
      return;
    }

    try {
      const result = await request('UI_API_CALL', {
        method,
        params,
        deviceId: state.selectedDevice.id
      });
      refs.commandResult.textContent = JSON.stringify(result, null, 2);
      addActivity('info', `${method} succeeded`, { deviceId: state.selectedDevice.id });
      await refreshState();
    } catch (error) {
      refs.commandResult.textContent = '';
      addActivity('error', `${method} failed`, { error: error.message, deviceId: state.selectedDevice.id });
    }
  }

  function encodeUtf8(input) {
    const encoder = new TextEncoder();
    return Array.from(encoder.encode(input));
  }

  function bindEvents() {
    refs.refreshStateButton.addEventListener('click', refreshState);
    refs.openDiagnosticsButton.addEventListener('click', () => {
      window.open('debug_console.html', '_blank', 'noopener,noreferrer');
    });
    refs.cancelChooserButton.addEventListener('click', cancelChooser);

    refs.scanButton.addEventListener('click', enumerateDevices);
    refs.typeSelect.addEventListener('change', enumerateDevices);
    refs.grantButton.addEventListener('click', grantSelectedDevice);

    refs.connectButton.addEventListener('click', async () => {
      await invokeForSelected('connect', {});
    });

    refs.disconnectButton.addEventListener('click', async () => {
      await invokeForSelected('disconnect', {});
    });

    refs.writeButton.addEventListener('click', async () => {
      const payload = refs.writePayloadInput.value;
      if (!payload) {
        addActivity('warn', 'Enter text to write');
        return;
      }

      await invokeForSelected('write', {
        data: encodeUtf8(payload)
      });
    });

    refs.readButton.addEventListener('click', async () => {
      await invokeForSelected('read', { length: 64 });
    });
  }

  function formatChooserContext(chooser) {
    if (!chooser) {
      return 'Waiting for chooser context...';
    }

    const details = [];
    details.push(`Origin: ${chooser.origin || 'unknown'}`);
    details.push(`Requested type: ${chooser.params?.type || 'all'}`);
    if (Array.isArray(chooser.params?.filters) && chooser.params.filters.length > 0) {
      details.push(`Filters: ${JSON.stringify(chooser.params.filters)}`);
    } else {
      details.push('Filters: none');
    }

    if (chooser.params?.acceptAllDevices) {
      details.push('acceptAllDevices: true');
    }

    return details.join(' | ');
  }

  async function loadChooserContext() {
    if (!isChooserMode()) {
      return;
    }

    refs.chooserPanel.style.display = 'block';
    refs.chooserBadge.style.display = 'inline-flex';
    refs.openDiagnosticsButton.style.display = 'none';
    refs.quickCommandCard.style.display = 'none';

    refs.grantButton.textContent = 'Select Device';
    refs.connectButton.disabled = true;
    refs.disconnectButton.disabled = true;

    try {
      const response = await request('UI_GET_CHOOSER_CONTEXT', {
        chooserId: state.chooser.id
      });

      state.chooser.context = response.chooser;
      refs.chooserContext.textContent = formatChooserContext(response.chooser);

      const chooserType = response.chooser?.params?.type;
      if (chooserType) {
        refs.typeSelect.value = chooserType;
      }

      if (response.chooser?.params?.scanDuration) {
        refs.scanDurationInput.value = String(response.chooser.params.scanDuration);
      }

      refs.typeSelect.disabled = true;
      refs.includeDisconnectedInput.checked = true;
      refs.chooserStatus.className = 'badge warn';
      refs.chooserStatus.textContent = 'Awaiting selection';
    } catch (error) {
      refs.chooserStatus.className = 'badge err';
      refs.chooserStatus.textContent = 'Chooser unavailable';
      refs.chooserContext.textContent = `Failed to load chooser context: ${error.message}`;
      addActivity('error', 'Failed to load chooser context', { error: error.message });
    }
  }

  async function initialize() {
    bindEvents();
    await loadChooserContext();
    await refreshState();
    await enumerateDevices();
  }

  initialize().catch((error) => {
    addActivity('error', 'Device Center failed to initialize', { error: error.message });
  });
})();
