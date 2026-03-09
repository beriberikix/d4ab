/**
 * WebHW Hardware Bridge - Polyfill Injector
 * Injects Web USB, Serial, and Bluetooth API polyfills into webpages
 */

(function() {
  'use strict';

  // This content script will inject the polyfill into the page context
  // to avoid Firefox's content script isolation issues

  function injectPolyfillIntoPageContext() {
    const script = document.createElement('script');
    script.textContent = `
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.webhwInjected) {
    return;
  }
  window.webhwInjected = true;

  console.log('WebHW: Polyfill injecting into page context');
  console.log('WebHW: navigator.usb before injection:', navigator.usb);

  /**
   * Communication bridge with background service worker
   */
  class ExtensionBridge {
    constructor() {
      this.port = null;
      this.messageId = 0;
      this.pendingRequests = new Map();
      this.connected = false;
      this.connect();
    }

    /**
     * Connects to background service worker
     */
    connect() {
      try {
        console.log('WebHW: Attempting to connect to background script');

        // Support both Chrome and Firefox extension APIs
        const extensionAPI = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome :
                            (typeof browser !== 'undefined' && browser.runtime) ? browser : null;

        if (!extensionAPI) {
          throw new Error('Extension runtime not available');
        }

        this.port = extensionAPI.runtime.connect({ name: 'webhw-hardware-bridge' });
        this.connected = true;
        console.log('WebHW: Connected to background script successfully');

        this.port.onMessage.addListener((message) => {
          this.handleMessage(message);
        });

        this.port.onDisconnect.addListener(() => {
          console.log('WebHW: Port disconnected');
          this.connected = false;
          // Attempt reconnection after delay
          setTimeout(() => this.connect(), 1000);
        });

        // Send keep-alive every 30 seconds
        setInterval(() => {
          if (this.connected) {
            this.port.postMessage({ type: 'KEEP_ALIVE' });
          }
        }, 30000);

      } catch (error) {
        console.error('WebHW: Failed to connect to extension:', error);
        this.connected = false;
        // Don't throw error - allow polyfill to continue with mock data
      }
    }

    /**
     * Handles messages from background service worker
     * @param {Object} message - Received message
     */
    handleMessage(message) {
      const { type, requestId, ...data } = message;

      switch (type) {
        case 'RESPONSE':
          this.handleResponse(requestId, data);
          break;

        case 'DEVICE_EVENT':
          this.handleDeviceEvent(data);
          break;

        case 'NATIVE_ERROR':
          this.handleNativeError(data);
          break;

        case 'NATIVE_DISCONNECTED':
          this.handleNativeDisconnected();
          break;

        case 'PONG':
          // Keep-alive response
          break;
      }
    }

    /**
     * Sends request to background service worker
     * @param {string} type - Request type
     * @param {Object} payload - Request payload
     * @returns {Promise} Request response
     */
    sendRequest(type, payload) {
      return new Promise((resolve, reject) => {
        if (!this.connected) {
          reject(new Error('Extension not connected'));
          return;
        }

        const requestId = \`req_\${++this.messageId}\`;
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }, 30000);

        this.pendingRequests.set(requestId, { resolve, reject, timeout });

        const extensionAPI = (typeof chrome !== 'undefined' && chrome.runtime) ? chrome :
                            (typeof browser !== 'undefined' && browser.runtime) ? browser : null;

        if (extensionAPI) {
          extensionAPI.runtime.sendMessage({
            type,
            payload,
            requestId
          });
        } else {
          reject(new Error('Extension API not available'));
        }
      });
    }

    /**
     * Handles response from background service worker
     * @param {string} requestId - Request identifier
     * @param {Object} data - Response data
     */
    handleResponse(requestId, data) {
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);

        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data);
        }
      }
    }

    /**
     * Handles device events
     * @param {Object} data - Event data
     */
    handleDeviceEvent(data) {
      // Dispatch custom events for device changes
      const event = new CustomEvent('webhw-device-event', {
        detail: data
      });
      window.dispatchEvent(event);
    }

    /**
     * Handles native bridge errors
     * @param {Object} data - Error data
     */
    handleNativeError(data) {
      console.warn('WebHW Native Bridge Error:', data.error);
    }

    /**
     * Handles native bridge disconnection
     */
    handleNativeDisconnected() {
      console.warn('WebHW Native Bridge disconnected');
    }
  }

  // Create extension bridge
  const extensionBridge = new ExtensionBridge();

  /**
   * USB API Polyfill
   */
  class USBPolyfill {
    constructor() {
      this.connectedDevices = new Map();
    }

    /**
     * Requests access to USB devices
     * @param {Object} options - Request options
     * @returns {Promise<USBDevice>} Selected device
     */
    async requestDevice(options = {}) {
      try {
        // Request permission from user
        const permissionResult = await extensionBridge.sendRequest('PERMISSION_REQUEST', {
          deviceType: 'usb',
          filters: options.filters,
          permissions: ['read', 'write', 'control']
        });

        if (!permissionResult.granted) {
          throw new DOMException('User denied device access', 'NotAllowedError');
        }

        // Get available devices
        const deviceResult = await extensionBridge.sendRequest('DEVICE_REQUEST', {
          method: 'enumerate',
          params: { type: 'usb' }
        });

        if (deviceResult.error) {
          throw new Error(deviceResult.error.message);
        }

        const devices = deviceResult.result.devices;
        const matchingDevices = this.filterDevices(devices, options.filters);

        if (matchingDevices.length === 0) {
          throw new DOMException('No matching devices found', 'NotFoundError');
        }

        // Return first matching device (in real implementation, would show picker)
        const deviceData = matchingDevices[0];
        return new USBDevice(deviceData, extensionBridge);

      } catch (error) {
        throw error;
      }
    }

    /**
     * Gets previously authorized devices
     * @returns {Promise<USBDevice[]>} Authorized devices
     */
    async getDevices() {
      try {
        const result = await extensionBridge.sendRequest('DEVICE_REQUEST', {
          method: 'enumerate',
          params: { type: 'usb' }
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        return result.result.devices.map(deviceData =>
          new USBDevice(deviceData, extensionBridge)
        );

      } catch (error) {
        throw error;
      }
    }

    /**
     * Filters devices based on criteria
     * @param {Array} devices - Available devices
     * @param {Array} filters - Filter criteria
     * @returns {Array} Matching devices
     */
    filterDevices(devices, filters = []) {
      if (!filters || filters.length === 0) {
        return devices;
      }

      return devices.filter(device => {
        return filters.some(filter => {
          if (filter.vendorId && device.vendorId !== filter.vendorId) return false;
          if (filter.productId && device.productId !== filter.productId) return false;
          if (filter.classCode && device.deviceClass !== filter.classCode) return false;
          if (filter.subclassCode && device.deviceSubclass !== filter.subclassCode) return false;
          if (filter.protocolCode && device.deviceProtocol !== filter.protocolCode) return false;
          if (filter.serialNumber && device.serialNumber !== filter.serialNumber) return false;
          return true;
        });
      });
    }
  }

  /**
   * USB Device Implementation
   */
  class USBDevice {
    constructor(deviceData, bridge) {
      this.vendorId = deviceData.vendorId;
      this.productId = deviceData.productId;
      this.deviceClass = deviceData.deviceClass || 0;
      this.deviceSubclass = deviceData.deviceSubclass || 0;
      this.deviceProtocol = deviceData.deviceProtocol || 0;
      this.productName = deviceData.name;
      this.manufacturerName = deviceData.manufacturer || 'Unknown';
      this.serialNumber = deviceData.serialNumber || '';
      this.configuration = null;
      this.configurations = [];

      this._deviceId = deviceData.id;
      this._bridge = bridge;
      this._opened = false;
    }

    async open() {
      if (this._opened) return;

      try {
        const result = await this._bridge.sendRequest('API_CALL', {
          method: 'connect',
          params: { deviceId: this._deviceId },
          deviceId: this._deviceId
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        this._opened = true;
      } catch (error) {
        throw new DOMException(error.message, 'NetworkError');
      }
    }

    async close() {
      if (!this._opened) return;

      try {
        await this._bridge.sendRequest('API_CALL', {
          method: 'disconnect',
          deviceId: this._deviceId
        });

        this._opened = false;
      } catch (error) {
        throw new DOMException(error.message, 'NetworkError');
      }
    }

    async selectConfiguration(configurationValue) {
      // Simplified - assume configuration is selected
      return Promise.resolve();
    }

    async claimInterface(interfaceNumber) {
      // Simplified - assume interface is claimed
      return Promise.resolve();
    }

    async transferOut(endpointNumber, data) {
      if (!this._opened) {
        throw new DOMException('Device not open', 'InvalidStateError');
      }

      try {
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(data)));

        const result = await this._bridge.sendRequest('API_CALL', {
          method: 'write',
          params: { data: base64Data },
          deviceId: this._deviceId
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        return {
          status: 'ok',
          bytesWritten: result.result.bytesWritten
        };

      } catch (error) {
        throw new DOMException(error.message, 'NetworkError');
      }
    }

    async transferIn(endpointNumber, length) {
      if (!this._opened) {
        throw new DOMException('Device not open', 'InvalidStateError');
      }

      try {
        const result = await this._bridge.sendRequest('API_CALL', {
          method: 'read',
          params: { length },
          deviceId: this._deviceId
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Convert base64 back to ArrayBuffer
        const binaryString = atob(result.result.data);
        const buffer = new ArrayBuffer(binaryString.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binaryString.length; i++) {
          view[i] = binaryString.charCodeAt(i);
        }

        return {
          status: 'ok',
          data: new DataView(buffer)
        };

      } catch (error) {
        throw new DOMException(error.message, 'NetworkError');
      }
    }

    async controlTransferOut(setup, data) {
      // Simplified implementation
      return this.transferOut(0, data);
    }

    async controlTransferIn(setup, length) {
      // Simplified implementation
      return this.transferIn(0, length);
    }
  }

  /**
   * Serial API Polyfill
   */
  class SerialPolyfill {
    async requestPort(options = {}) {
      try {
        const permissionResult = await extensionBridge.sendRequest('PERMISSION_REQUEST', {
          deviceType: 'serial',
          permissions: ['read', 'write']
        });

        if (!permissionResult.granted) {
          throw new DOMException('User denied device access', 'NotAllowedError');
        }

        const deviceResult = await extensionBridge.sendRequest('DEVICE_REQUEST', {
          method: 'enumerate',
          params: { type: 'serial' }
        });

        if (deviceResult.error) {
          throw new Error(deviceResult.error.message);
        }

        const devices = deviceResult.result.devices;
        if (devices.length === 0) {
          throw new DOMException('No serial ports found', 'NotFoundError');
        }

        return new SerialPort(devices[0], extensionBridge);

      } catch (error) {
        throw error;
      }
    }

    async getPorts() {
      try {
        const result = await extensionBridge.sendRequest('DEVICE_REQUEST', {
          method: 'enumerate',
          params: { type: 'serial' }
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        return result.result.devices.map(deviceData =>
          new SerialPort(deviceData, extensionBridge)
        );

      } catch (error) {
        throw error;
      }
    }
  }

  /**
   * Serial Port Implementation
   */
  class SerialPort {
    constructor(deviceData, bridge) {
      this._deviceId = deviceData.id;
      this._bridge = bridge;
      this._opened = false;
      this.readable = null;
      this.writable = null;
    }

    async open(options = {}) {
      if (this._opened) return;

      try {
        const result = await this._bridge.sendRequest('API_CALL', {
          method: 'connect',
          params: {
            deviceId: this._deviceId,
            options
          },
          deviceId: this._deviceId
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        this._opened = true;
        this._setupStreams();

      } catch (error) {
        throw new DOMException(error.message, 'NetworkError');
      }
    }

    async close() {
      if (!this._opened) return;

      try {
        await this._bridge.sendRequest('API_CALL', {
          method: 'disconnect',
          deviceId: this._deviceId
        });

        this._opened = false;
        this.readable = null;
        this.writable = null;

      } catch (error) {
        throw new DOMException(error.message, 'NetworkError');
      }
    }

    _setupStreams() {
      // Create readable stream
      this.readable = new ReadableStream({
        start: (controller) => {
          // Set up data reading from device
          this._readController = controller;
          this._startReading();
        }
      });

      // Create writable stream
      this.writable = new WritableStream({
        write: async (chunk) => {
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(chunk)));

          await this._bridge.sendRequest('API_CALL', {
            method: 'write',
            params: { data: base64Data },
            deviceId: this._deviceId
          });
        }
      });
    }

    async _startReading() {
      // Simplified - in real implementation would set up continuous reading
      try {
        const result = await this._bridge.sendRequest('API_CALL', {
          method: 'read',
          params: { length: 1024 },
          deviceId: this._deviceId
        });

        if (result.result && result.result.data) {
          const binaryString = atob(result.result.data);
          const buffer = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            buffer[i] = binaryString.charCodeAt(i);
          }
          this._readController.enqueue(buffer);
        }
      } catch (error) {
        this._readController.error(error);
      }
    }
  }

  /**
   * Bluetooth API Polyfill (simplified)
   */
  class BluetoothPolyfill {
    async requestDevice(options = {}) {
      try {
        const permissionResult = await extensionBridge.sendRequest('PERMISSION_REQUEST', {
          deviceType: 'bluetooth',
          permissions: ['read', 'write', 'control']
        });

        if (!permissionResult.granted) {
          throw new DOMException('User denied device access', 'NotAllowedError');
        }

        const deviceResult = await extensionBridge.sendRequest('DEVICE_REQUEST', {
          method: 'enumerate',
          params: { type: 'bluetooth' }
        });

        if (deviceResult.error) {
          throw new Error(deviceResult.error.message);
        }

        const devices = deviceResult.result.devices;
        if (devices.length === 0) {
          throw new DOMException('No Bluetooth devices found', 'NotFoundError');
        }

        return new BluetoothDevice(devices[0], extensionBridge);

      } catch (error) {
        throw error;
      }
    }
  }

  /**
   * Bluetooth Device Implementation (simplified)
   */
  class BluetoothDevice {
    constructor(deviceData, bridge) {
      this.id = deviceData.id;
      this.name = deviceData.name;
      this.gatt = new BluetoothRemoteGATTServer(this, bridge);
      this._bridge = bridge;
    }
  }

  class BluetoothRemoteGATTServer {
    constructor(device, bridge) {
      this.device = device;
      this.connected = false;
      this._bridge = bridge;
    }

    async connect() {
      // Simplified Bluetooth connection
      this.connected = true;
      return this;
    }

    disconnect() {
      this.connected = false;
    }

    async getPrimaryService(service) {
      return new BluetoothRemoteGATTService(this.device, service, this._bridge);
    }
  }

  class BluetoothRemoteGATTService {
    constructor(device, uuid, bridge) {
      this.device = device;
      this.uuid = uuid;
      this.isPrimary = true;
      this._bridge = bridge;
    }

    async getCharacteristic(characteristic) {
      return new BluetoothRemoteGATTCharacteristic(this, characteristic, this._bridge);
    }
  }

  class BluetoothRemoteGATTCharacteristic extends EventTarget {
    constructor(service, uuid, bridge) {
      super();
      this.service = service;
      this.uuid = uuid;
      this.properties = {
        read: true,
        write: true,
        notify: true
      };
      this._bridge = bridge;
    }

    async readValue() {
      // Simplified read
      return new DataView(new ArrayBuffer(4));
    }

    async writeValue(value) {
      // Simplified write
      return Promise.resolve();
    }

    async startNotifications() {
      // Simplified notifications
      return this;
    }

    async stopNotifications() {
      return this;
    }
  }

  // Debug logging before injection
  console.log('WebHW: About to inject polyfills');
  console.log('WebHW: navigator.usb before injection:', navigator.usb);
  console.log('WebHW: chrome available:', typeof chrome !== 'undefined');
  console.log('WebHW: chrome.runtime available:', typeof chrome !== 'undefined' && chrome.runtime);
  console.log('WebHW: browser available:', typeof browser !== 'undefined');
  console.log('WebHW: browser.runtime available:', typeof browser !== 'undefined' && browser.runtime);

  // Inject polyfills into navigator
  try {
    if (!navigator.usb) {
      navigator.usb = new USBPolyfill();
      console.log('WebHW: USB polyfill injected successfully');
    } else {
      console.log('WebHW: navigator.usb already exists');
    }

    if (!navigator.serial) {
      navigator.serial = new SerialPolyfill();
      console.log('WebHW: Serial polyfill injected successfully');
    }

    if (!navigator.bluetooth) {
      navigator.bluetooth = new BluetoothPolyfill();
      console.log('WebHW: Bluetooth polyfill injected successfully');
    }

    console.log('WebHW Hardware Bridge polyfills injected');
    console.log('WebHW: navigator.usb after injection:', navigator.usb);
    console.log('WebHW: navigator.usb.getDevices available:', typeof navigator.usb?.getDevices);

  } catch (error) {
    console.error('WebHW: Error during polyfill injection:', error);
  }

})();
`;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  injectPolyfillIntoPageContext();
})();