/**
 * D4AB Hardware Bridge - Polyfill Bridge
 * Proper architecture with page context polyfill + content script bridge
 */

(function() {
  'use strict';

  // Content script bridge that can communicate with background script
  class D4ABBridge {
    constructor() {
      this.messageId = 0;
      this.setupMessageHandling();
    }

    setupMessageHandling() {
      // Listen for messages from page context
      window.addEventListener('message', (event) => {
        if (event.source !== window || event.data.source !== 'D4AB_PAGE') {
          return;
        }
        this.handlePageMessage(event.data);
      });
    }

    async handlePageMessage(message) {
      const { type, payload, requestId } = message;

      try {
        let response;

        switch (type) {
          case 'USB_GET_DEVICES':
            response = await this.sendToBackground('DEVICE_REQUEST', {
              method: 'enumerate',
              params: { type: 'usb' }
            });
            break;

          case 'USB_REQUEST_DEVICE':
            response = await this.sendToBackground('DEVICE_REQUEST', {
              method: 'requestDevice',
              params: { type: 'usb', filters: payload.filters }
            });
            break;

          case 'USB_API_CALL':
            response = await this.sendToBackground('API_CALL', {
              method: payload.method,
              params: payload.params,
              deviceId: payload.deviceId
            });
            break;

          case 'SERIAL_GET_PORTS':
            response = await this.sendToBackground('DEVICE_REQUEST', {
              method: 'enumerate',
              params: { type: 'serial' }
            });
            break;

          case 'SERIAL_REQUEST_PORT':
            response = await this.sendToBackground('DEVICE_REQUEST', {
              method: 'requestDevice',
              params: { type: 'serial', filters: payload.filters }
            });
            break;

          case 'SERIAL_API_CALL':
            response = await this.sendToBackground('API_CALL', {
              method: this.mapSerialMethod(payload.method),
              params: payload.params,
              deviceId: payload.deviceId
            });
            break;

          case 'BLUETOOTH_REQUEST_DEVICE':
            response = await this.sendToBackground('DEVICE_REQUEST', {
              method: 'requestDevice',
              params: {
                type: 'bluetooth',
                filters: payload.filters,
                acceptAllDevices: payload.acceptAllDevices,
                optionalServices: payload.optionalServices,
                scanDuration: payload.scanDuration,
                hardTimeoutMs: payload.hardTimeoutMs
              }
            });
            break;

          case 'BLUETOOTH_GET_DEVICES':
            response = await this.sendToBackground('DEVICE_REQUEST', {
              method: 'enumerate',
              params: {
                type: 'bluetooth',
                includeDisconnected: true,
                scanDuration: payload.scanDuration,
                hardTimeoutMs: payload.hardTimeoutMs
              }
            });
            break;

          case 'BLUETOOTH_API_CALL':
            response = await this.sendToBackground('API_CALL', {
              method: this.mapBluetoothMethod(payload.method),
              params: payload.params,
              deviceId: payload.deviceId
            });
            break;

          default:
            response = { error: 'Unknown request type: ' + type };
        }

        // Send response back to page context
        window.postMessage({
          source: 'D4AB_BRIDGE',
          requestId,
          response
        }, '*');

      } catch (error) {
        window.postMessage({
          source: 'D4AB_BRIDGE',
          requestId,
          error: error.message
        }, '*');
      }
    }

    async sendToBackground(type, payload) {
      return new Promise((resolve, reject) => {
        const requestId = `bridge_${++this.messageId}`;
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 30000);

        chrome.runtime.sendMessage({
          type,
          payload,
          requestId
        }, (response) => {
          clearTimeout(timeout);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve(response || {});
        });
      });
    }

    mapSerialMethod(method) {
      if (method === 'open') return 'connect';
      if (method === 'close') return 'disconnect';
      return method;
    }

    mapBluetoothMethod(method) {
      if (method === 'open') return 'connect';
      if (method === 'close') return 'disconnect';
      return method;
    }
  }

  // Initialize bridge
  new D4ABBridge();

  // Inject polyfill into page context
  const script = document.createElement('script');
  script.textContent = `
(function() {
  'use strict';

  if (window.d4abInjected) {
    return;
  }
  window.d4abInjected = true;

  console.log('D4AB: Injecting production polyfills');

  // Bridge communication helper
  let messageId = 0;
  const pendingRequests = new Map();

  function sendToBridge(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = \`page_\${++messageId}\`;
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Bridge communication timeout'));
      }, 30000);

      pendingRequests.set(requestId, { resolve, reject, timeout });

      window.postMessage({
        source: 'D4AB_PAGE',
        type,
        payload,
        requestId
      }, '*');
    });
  }

  // Listen for responses from bridge
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data.source !== 'D4AB_BRIDGE') {
      return;
    }

    const { requestId, response, error } = event.data;
    const pending = pendingRequests.get(requestId);

    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(requestId);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(response);
      }
    }
  });

  /**
   * Production WebUSB API Implementation
   */
  class USBDevice {
    constructor(deviceData) {
      this.vendorId = deviceData.vendorId;
      this.productId = deviceData.productId;
      this.deviceClass = deviceData.deviceClass || 0;
      this.deviceSubclass = deviceData.deviceSubclass || 0;
      this.deviceProtocol = deviceData.deviceProtocol || 0;
      this.productName = deviceData.productName || deviceData.name;
      this.manufacturerName = deviceData.manufacturerName || 'Unknown';
      this.serialNumber = deviceData.serialNumber || '';
      this.configuration = null;
      this.configurations = [];
      this._deviceId = deviceData.id;
      this._opened = false;
    }

    async open() {
      if (this._opened) return;
      const result = await sendToBridge('USB_API_CALL', {
        method: 'connect',
        params: {},
        deviceId: this._deviceId
      });
      if (result.error) throw new DOMException(result.error, 'NetworkError');
      this._opened = true;
    }

    async close() {
      if (!this._opened) return;
      await sendToBridge('USB_API_CALL', {
        method: 'disconnect',
        params: {},
        deviceId: this._deviceId
      });
      this._opened = false;
    }

    async selectConfiguration(configurationValue) {
      await sendToBridge('USB_API_CALL', {
        method: 'selectConfiguration',
        params: { configurationValue },
        deviceId: this._deviceId
      });
    }

    async claimInterface(interfaceNumber) {
      await sendToBridge('USB_API_CALL', {
        method: 'claimInterface',
        params: { interfaceNumber },
        deviceId: this._deviceId
      });
    }

    async transferOut(endpointNumber, data) {
      const result = await sendToBridge('USB_API_CALL', {
        method: 'transferOut',
        params: {
          endpointNumber,
          data: Array.from(new Uint8Array(data))
        },
        deviceId: this._deviceId
      });
      return {
        status: 'ok',
        bytesWritten: result.bytesWritten || 0
      };
    }

    async transferIn(endpointNumber, length) {
      const result = await sendToBridge('USB_API_CALL', {
        method: 'transferIn',
        params: { endpointNumber, length },
        deviceId: this._deviceId
      });
      const byteData = Array.isArray(result.data) ? result.data : [];
      const buffer = new ArrayBuffer(byteData.length);
      const view = new Uint8Array(buffer);
      view.set(byteData);
      return {
        status: 'ok',
        data: new DataView(buffer)
      };
    }

    async controlTransferOut(setup, data) {
      const result = await sendToBridge('USB_API_CALL', {
        method: 'controlTransferOut',
        params: {
          setup,
          data: data ? Array.from(new Uint8Array(data)) : []
        },
        deviceId: this._deviceId
      });
      return {
        status: 'ok',
        bytesWritten: result.bytesWritten || 0
      };
    }

    async controlTransferIn(setup, length) {
      const result = await sendToBridge('USB_API_CALL', {
        method: 'controlTransferIn',
        params: { setup, length },
        deviceId: this._deviceId
      });
      const byteData = Array.isArray(result.data) ? result.data : [];
      const buffer = new ArrayBuffer(byteData.length);
      const view = new Uint8Array(buffer);
      view.set(byteData);
      return {
        status: 'ok',
        data: new DataView(buffer)
      };
    }
  }

  class USBPolyfill {
    async getDevices() {
      const result = await sendToBridge('USB_GET_DEVICES');
      if (result.error) throw new Error(result.error);
      return result.devices.map(deviceData => new USBDevice(deviceData));
    }

    async requestDevice(options = {}) {
      const result = await sendToBridge('USB_REQUEST_DEVICE', { filters: options.filters || [] });
      if (result.error) throw new DOMException(result.error, 'NotFoundError');
      return new USBDevice(result.device);
    }
  }

  /**
   * Production WebSerial API Implementation
   */
  class SerialPort {
    constructor(portData) {
      this._portId = portData.id;
      this._opened = false;
      this.readable = null;
      this.writable = null;
      this._streamActive = false;
    }

    async open(options = {}) {
      if (this._opened) return;
      const result = await sendToBridge('SERIAL_API_CALL', {
        method: 'open',
        params: options,
        deviceId: this._portId
      });
      if (result.error) throw new DOMException(result.error, 'NetworkError');
      this._opened = true;
      this._setupStreams();
    }

    async close() {
      if (!this._opened) return;
      this._streamActive = false;
      await sendToBridge('SERIAL_API_CALL', {
        method: 'close',
        params: {},
        deviceId: this._portId
      });
      this._opened = false;
      this.readable = null;
      this.writable = null;
    }

    _setupStreams() {
      this.readable = new ReadableStream({
        start: (controller) => {
          this._streamActive = true;
          this._startReadLoop(controller);
        },
        cancel: () => {
          this._streamActive = false;
        }
      });

      this.writable = new WritableStream({
        write: async (chunk) => {
          await sendToBridge('SERIAL_API_CALL', {
            method: 'write',
            params: { data: Array.from(new Uint8Array(chunk)) },
            deviceId: this._portId
          });
        }
      });
    }

    async _startReadLoop(controller) {
      while (this._opened && this._streamActive) {
        try {
          const result = await sendToBridge('SERIAL_API_CALL', {
            method: 'read',
            params: { length: 256, timeout: 250 },
            deviceId: this._portId
          });

          if (result && !result.error) {
            const bytes = this._normalizeReadBytes(result);
            if (bytes.length > 0) {
              controller.enqueue(new Uint8Array(bytes));
              continue;
            }
          }

          await this._sleep(25);
        } catch (error) {
          if (this._opened && this._streamActive) {
            controller.error(new DOMException(error.message, 'NetworkError'));
          }
          this._streamActive = false;
        }
      }
    }

    _normalizeReadBytes(result) {
      if (Array.isArray(result?.data)) {
        return result.data;
      }

      if (typeof result?.data === 'string') {
        try {
          const binary = atob(result.data);
          const bytes = new Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return bytes;
        } catch (_error) {
          return [];
        }
      }

      return [];
    }

    _sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  class SerialPolyfill {
    async getPorts() {
      const result = await sendToBridge('SERIAL_GET_PORTS');
      if (result.error) throw new Error(result.error);
      const ports = result.ports || result.devices || [];
      return ports.map(portData => new SerialPort(portData));
    }

    async requestPort(options = {}) {
      const result = await sendToBridge('SERIAL_REQUEST_PORT', { filters: options.filters || [] });
      if (result.error) throw new DOMException(result.error, 'NotFoundError');
      const port = result.port || result.device;
      if (!port) throw new DOMException('No serial port selected', 'NotFoundError');
      return new SerialPort(port);
    }
  }

  /**
   * Production Web Bluetooth API Implementation
   */
  class BluetoothDevice {
    constructor(deviceData) {
      this.id = deviceData.id;
      this.name = deviceData.name;
      this.gatt = new BluetoothRemoteGATTServer(this);
      this._deviceId = deviceData.id;
    }
  }

  class BluetoothRemoteGATTServer {
    constructor(device) {
      this.device = device;
      this.connected = false;
    }

    async connect() {
      const result = await sendToBridge('BLUETOOTH_API_CALL', {
        method: 'connect',
        params: {},
        deviceId: this.device._deviceId
      });
      if (result.error) throw new DOMException(result.error, 'NetworkError');
      this.connected = true;
      return this;
    }

    disconnect() {
      sendToBridge('BLUETOOTH_API_CALL', {
        method: 'disconnect',
        params: {},
        deviceId: this.device._deviceId
      });
      this.connected = false;
    }
  }

  class BluetoothPolyfill {
    async getDevices(options = {}) {
      const requestedScanDuration = Number(options.scanDuration);
      const scanDuration = Number.isFinite(requestedScanDuration)
        ? requestedScanDuration
        : 10000;

      const requestedHardTimeout = Number(options.hardTimeoutMs);
      const hardTimeoutMs = Number.isFinite(requestedHardTimeout)
        ? requestedHardTimeout
        : Math.min(Math.max(scanDuration + 5000, 8000), 30000);

      const result = await sendToBridge('BLUETOOTH_GET_DEVICES', {
        scanDuration,
        hardTimeoutMs
      });

      if (result.error) {
        throw new DOMException(result.error, 'NetworkError');
      }

      const devices = Array.isArray(result.devices) ? result.devices : [];
      return devices.map((deviceData) => new BluetoothDevice(deviceData));
    }

    async requestDevice(options = {}) {
      const filters = Array.isArray(options.filters) ? options.filters : [];
      const acceptAllDevices = !!options.acceptAllDevices;

      if (!acceptAllDevices && filters.length === 0) {
        throw new TypeError('requestDevice requires either filters or acceptAllDevices=true');
      }

      const requestedScanDuration = Number(options.scanDuration);
      const scanDuration = Number.isFinite(requestedScanDuration)
        ? requestedScanDuration
        : 10000;

      const result = await sendToBridge('BLUETOOTH_REQUEST_DEVICE', {
        filters,
        acceptAllDevices,
        optionalServices: Array.isArray(options.optionalServices) ? options.optionalServices : [],
        scanDuration
      });
      if (result.error) throw new DOMException(result.error, 'NotFoundError');
      return new BluetoothDevice(result.device);
    }
  }

  // Install polyfills
  if (!navigator.usb) {
    navigator.usb = new USBPolyfill();
    console.log('D4AB: WebUSB polyfill installed');
  }

  if (!navigator.serial) {
    navigator.serial = new SerialPolyfill();
    console.log('D4AB: WebSerial polyfill installed');
  }

  if (!navigator.bluetooth) {
    navigator.bluetooth = new BluetoothPolyfill();
    console.log('D4AB: Web Bluetooth polyfill installed');
  }

  console.log('D4AB: Production polyfills ready');
})();
`;

  (document.head || document.documentElement).appendChild(script);
  script.remove();

  console.log('D4AB: Bridge initialized and polyfill injected');

})();