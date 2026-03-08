/**
 * D4AB Hardware Bridge - Simple Polyfill Injector
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
  if (window.d4abInjected) {
    return;
  }
  window.d4abInjected = true;

  console.log('D4AB: Injecting polyfills into page context');

  /**
   * Simple USB API Polyfill
   */
  class USBPolyfill {
    constructor() {
      this.connectedDevices = new Map();
    }

    async requestDevice(options = {}) {
      console.log('D4AB: USB requestDevice called with options:', options);

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
          console.log('D4AB: Mock USB device opened');
          return Promise.resolve();
        },

        async close() {
          console.log('D4AB: Mock USB device closed');
          return Promise.resolve();
        },

        async selectConfiguration(configValue) {
          console.log('D4AB: Mock selectConfiguration:', configValue);
          return Promise.resolve();
        },

        async claimInterface(interfaceNumber) {
          console.log('D4AB: Mock claimInterface:', interfaceNumber);
          return Promise.resolve();
        },

        async transferOut(endpointNumber, data) {
          console.log('D4AB: Mock transferOut:', endpointNumber, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data.byteLength || 0
          });
        },

        async transferIn(endpointNumber, length) {
          console.log('D4AB: Mock transferIn:', endpointNumber, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        },

        async controlTransferOut(setup, data) {
          console.log('D4AB: Mock controlTransferOut:', setup, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data ? data.byteLength : 0
          });
        },

        async controlTransferIn(setup, length) {
          console.log('D4AB: Mock controlTransferIn:', setup, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        }
      };

      return Promise.resolve(mockDevice);
    }

    async getDevices() {
      console.log('D4AB: USB getDevices called');

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
          console.log('D4AB: Mock USB device opened');
          return Promise.resolve();
        },

        async close() {
          console.log('D4AB: Mock USB device closed');
          return Promise.resolve();
        },

        async selectConfiguration(configValue) {
          console.log('D4AB: Mock selectConfiguration:', configValue);
          return Promise.resolve();
        },

        async claimInterface(interfaceNumber) {
          console.log('D4AB: Mock claimInterface:', interfaceNumber);
          return Promise.resolve();
        },

        async transferOut(endpointNumber, data) {
          console.log('D4AB: Mock transferOut:', endpointNumber, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data.byteLength || 0
          });
        },

        async transferIn(endpointNumber, length) {
          console.log('D4AB: Mock transferIn:', endpointNumber, length);
          return Promise.resolve({
            status: 'ok',
            data: new DataView(new ArrayBuffer(length))
          });
        },

        async controlTransferOut(setup, data) {
          console.log('D4AB: Mock controlTransferOut:', setup, data);
          return Promise.resolve({
            status: 'ok',
            bytesWritten: data ? data.byteLength : 0
          });
        },

        async controlTransferIn(setup, length) {
          console.log('D4AB: Mock controlTransferIn:', setup, length);
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
      console.log('D4AB: Serial requestPort called with options:', options);
      throw new DOMException('Serial not available in mock mode', 'NotFoundError');
    }

    async getPorts() {
      console.log('D4AB: Serial getPorts called');
      return Promise.resolve([]);
    }
  }

  /**
   * Simple Bluetooth API Polyfill
   */
  class BluetoothPolyfill {
    async requestDevice(options = {}) {
      console.log('D4AB: Bluetooth requestDevice called with options:', options);
      throw new DOMException('Bluetooth not available in mock mode', 'NotFoundError');
    }
  }

  // Inject polyfills into navigator
  try {
    if (!navigator.usb) {
      navigator.usb = new USBPolyfill();
      console.log('D4AB: USB polyfill injected successfully');
    } else {
      console.log('D4AB: navigator.usb already exists');
    }

    if (!navigator.serial) {
      navigator.serial = new SerialPolyfill();
      console.log('D4AB: Serial polyfill injected successfully');
    }

    if (!navigator.bluetooth) {
      navigator.bluetooth = new BluetoothPolyfill();
      console.log('D4AB: Bluetooth polyfill injected successfully');
    }

    console.log('D4AB Hardware Bridge polyfills injected into page context');
    console.log('D4AB: Final navigator.usb:', navigator.usb);
    console.log('D4AB: Final navigator.usb.getDevices:', typeof navigator.usb?.getDevices);

  } catch (error) {
    console.error('D4AB: Error during polyfill injection:', error);
  }

})();
`;

    // Inject at the very beginning of document head
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // Clean up the script element after injection

    console.log('D4AB: Polyfill script injected into page context');
  }

  // Inject immediately, before any page scripts can run
  injectPolyfill();

})();