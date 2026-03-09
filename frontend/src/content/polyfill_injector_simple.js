/**
 * WebHW Hardware Bridge - Simple Polyfill Injector
 * Injects basic polyfills directly into page context to avoid isolation issues
 */

(function() {
  'use strict';

  // Inject polyfill script directly into page context
  function injectPolyfill() {
    const script = document.createElement('script');
    script.textContent = `
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.webhwInjected) {
    return;
  }
  window.webhwInjected = true;

  console.log('WebHW: Injecting polyfills into page context');

  /**
   * Simple USB API Polyfill
   */
  class USBPolyfill {
    constructor() {
      this.connectedDevices = new Map();
    }

    async requestDevice(options = {}) {
      console.log('WebHW: USB requestDevice called with options:', options);

      // Mock device for testing
      const mockDevice = {
        vendorId: 0x1234,
        productId: 0x5678,
        deviceClass: 0,
        deviceSubclass: 0,
        deviceProtocol: 0,
        productName: 'Mock USB Device',
        manufacturerName: 'Mock Manufacturer',
        serialNumber: 'MOCK123',
        configuration: null,
        configurations: [],

        async open() {
          console.log('WebHW: Mock USB device opened');
          return Promise.resolve();
        },

        async close() {
          console.log('WebHW: Mock USB device closed');
          return Promise.resolve();
        },

        async selectConfiguration(configValue) {
          console.log('WebHW: Mock selectConfiguration:', configValue);
          return Promise.resolve();
        },

        async claimInterface(interfaceNumber) {
          console.log('WebHW: Mock claimInterface:', interfaceNumber);
          return Promise.resolve();
        },

        async transferOut(endpointNumber, data) {
          console.log('WebHW: Mock transferOut:', endpointNumber, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data.byteLength || 0
          });
        },

        async transferIn(endpointNumber, length) {
          console.log('WebHW: Mock transferIn:', endpointNumber, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        },

        async controlTransferOut(setup, data) {
          console.log('WebHW: Mock controlTransferOut:', setup, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data ? data.byteLength : 0
          });
        },

        async controlTransferIn(setup, length) {
          console.log('WebHW: Mock controlTransferIn:', setup, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        }
      };

      return Promise.resolve(mockDevice);
    }

    async getDevices() {
      console.log('WebHW: USB getDevices called');

      // Return mock device array for testing
      const mockDevice = {
        vendorId: 0x1234,
        productId: 0x5678,
        deviceClass: 0,
        deviceSubclass: 0,
        deviceProtocol: 0,
        productName: 'Mock USB Device',
        manufacturerName: 'Mock Manufacturer',
        serialNumber: 'MOCK123',
        configuration: null,
        configurations: [],

        async open() {
          console.log('WebHW: Mock USB device opened');
          return Promise.resolve();
        },

        async close() {
          console.log('WebHW: Mock USB device closed');
          return Promise.resolve();
        },

        async selectConfiguration(configValue) {
          console.log('WebHW: Mock selectConfiguration:', configValue);
          return Promise.resolve();
        },

        async claimInterface(interfaceNumber) {
          console.log('WebHW: Mock claimInterface:', interfaceNumber);
          return Promise.resolve();
        },

        async transferOut(endpointNumber, data) {
          console.log('WebHW: Mock transferOut:', endpointNumber, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data.byteLength || 0
          });
        },

        async transferIn(endpointNumber, length) {
          console.log('WebHW: Mock transferIn:', endpointNumber, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        },

        async controlTransferOut(setup, data) {
          console.log('WebHW: Mock controlTransferOut:', setup, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data ? data.byteLength : 0
          });
        },

        async controlTransferIn(setup, length) {
          console.log('WebHW: Mock controlTransferIn:', setup, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        }
      };

      return Promise.resolve([mockDevice]);
    }
  }

  /**
   * Simple Serial API Polyfill
   */
  class SerialPolyfill {
    async requestPort(options = {}) {
      console.log('WebHW: Serial requestPort called with options:', options);
      throw new DOMException('Serial not available in mock mode', 'NotFoundError');
    }

    async getPorts() {
      console.log('WebHW: Serial getPorts called');
      return Promise.resolve([]);
    }
  }

  /**
   * Simple Bluetooth API Polyfill
   */
  class BluetoothPolyfill {
    async requestDevice(options = {}) {
      console.log('WebHW: Bluetooth requestDevice called with options:', options);
      throw new DOMException('Bluetooth not available in mock mode', 'NotFoundError');
    }
  }

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

    console.log('WebHW Hardware Bridge polyfills injected into page context');
    console.log('WebHW: Final navigator.usb:', navigator.usb);
    console.log('WebHW: Final navigator.usb.getDevices:', typeof navigator.usb?.getDevices);

  } catch (error) {
    console.error('WebHW: Error during polyfill injection:', error);
  }

})();
`;

    // Inject at the very beginning of document head
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // Clean up the script element after injection

    console.log('WebHW: Polyfill script injected into page context');
  }

  // Inject immediately, before any page scripts can run
  injectPolyfill();

})();