const usb = require('usb');
const Device = require('../models/device');

/**
 * USB Library wrapper for hardware access
 */
class USBLib {
  constructor() {
    this._devices = new Map();
    this._initialized = false;
  }

  /**
   * Initializes USB library
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    try {
      // Test basic USB access
      const deviceList = usb.getDeviceList();
      console.error(`USB library initialized. Found ${deviceList.length} devices.`); // Use stderr to avoid JSON output issues

      // Note: USB event handlers would require different setup depending on platform
      // For now, skip event handlers and just ensure basic functionality works

      this._initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize USB library: ${error.message}`);
    }
  }

  /**
   * Enumerates USB devices
   * @param {Object} options - Enumeration options
   * @param {boolean} options.includeDisconnected - Include disconnected devices
   * @returns {Promise<Device[]>} Array of USB devices
   */
  async enumerate(options = {}) {
    await this.initialize();

    try {
      const usbDevices = usb.getDeviceList();
      const devices = [];

      for (const usbDevice of usbDevices) {
        const device = await this._createDeviceFromUSB(usbDevice);
        devices.push(device);
      }

      // Include cached disconnected devices if requested
      if (options.includeDisconnected) {
        for (const [id, device] of this._devices) {
          if (device.status === 'disconnected') {
            devices.push(device);
          }
        }
      }

      return devices;
    } catch (error) {
      throw new Error(`USB enumeration failed: ${error.message}`);
    }
  }

  /**
   * Connects to USB device
   * @param {string} deviceId - Device identifier
   * @param {Object} options - Connection options
   * @returns {Promise<Object>} Connection handle
   */
  async connect(deviceId, options = {}) {
    await this.initialize();

    const usbDevices = usb.getDeviceList();
    const targetDevice = usbDevices.find(dev => this._getDeviceId(dev) === deviceId);

    if (!targetDevice) {
      throw new Error(`USB device not found: ${deviceId}`);
    }

    try {
      // Open device
      targetDevice.open();

      // Select configuration (default to first)
      const config = targetDevice.configurations[0];
      if (config) {
        targetDevice.setConfiguration(config.configurationValue, (error) => {
          if (error) {
            throw new Error(`Failed to set configuration: ${error.message}`);
          }
        });
      }

      // Update device status
      const device = this._devices.get(deviceId);
      if (device) {
        device.updateStatus('connected');
      }

      return {
        device: targetDevice,
        deviceId,
        connected: true,
        configuration: config
      };
    } catch (error) {
      throw new Error(`USB connection failed: ${error.message}`);
    }
  }

  /**
   * Reads data from USB device
   * @param {Object} connection - Connection handle
   * @param {number} length - Number of bytes to read
   * @param {number} timeout - Read timeout in ms
   * @returns {Promise<Buffer>} Read data
   */
  async read(connection, length = 256, timeout = 1000) {
    if (!connection || !connection.device) {
      throw new Error('Invalid USB connection');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('USB read timeout'));
      }, timeout);

      try {
        // Find bulk IN endpoint
        const config = connection.device.configurations[0];
        const deviceInterface = config.interfaces[0];
        const endpoint = deviceInterface.endpoints.find(ep =>
          ep.direction === 'in' && ep.transferType === 'bulk'
        );

        if (!endpoint) {
          clearTimeout(timer);
          reject(new Error('No bulk IN endpoint found'));
          return;
        }

        endpoint.transfer(length, (error, data) => {
          clearTimeout(timer);
          if (error) {
            reject(new Error(`USB read failed: ${error.message}`));
          } else {
            resolve(data);
          }
        });
      } catch (error) {
        clearTimeout(timer);
        reject(new Error(`USB read error: ${error.message}`));
      }
    });
  }

  /**
   * Writes data to USB device
   * @param {Object} connection - Connection handle
   * @param {Buffer} data - Data to write
   * @param {number} timeout - Write timeout in ms
   * @returns {Promise<number>} Number of bytes written
   */
  async write(connection, data, timeout = 1000) {
    if (!connection || !connection.device) {
      throw new Error('Invalid USB connection');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('USB write timeout'));
      }, timeout);

      try {
        // Find bulk OUT endpoint
        const config = connection.device.configurations[0];
        const deviceInterface = config.interfaces[0];
        const endpoint = deviceInterface.endpoints.find(ep =>
          ep.direction === 'out' && ep.transferType === 'bulk'
        );

        if (!endpoint) {
          clearTimeout(timer);
          reject(new Error('No bulk OUT endpoint found'));
          return;
        }

        endpoint.transfer(data, (error) => {
          clearTimeout(timer);
          if (error) {
            reject(new Error(`USB write failed: ${error.message}`));
          } else {
            resolve(data.length);
          }
        });
      } catch (error) {
        clearTimeout(timer);
        reject(new Error(`USB write error: ${error.message}`));
      }
    });
  }

  /**
   * Disconnects from USB device
   * @param {Object} connection - Connection handle
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(connection) {
    if (!connection || !connection.device) {
      return false;
    }

    try {
      connection.device.close();
      connection.connected = false;

      // Update device status
      const device = this._devices.get(connection.deviceId);
      if (device) {
        device.updateStatus('disconnected');
      }

      return true;
    } catch (error) {
      throw new Error(`USB disconnect failed: ${error.message}`);
    }
  }

  /**
   * Creates Device model from USB device
   * @private
   * @param {Object} usbDevice - Native USB device
   * @returns {Promise<Device>} Device model
   */
  async _createDeviceFromUSB(usbDevice) {
    const deviceId = this._getDeviceId(usbDevice);

    // Check if we already have this device cached
    if (this._devices.has(deviceId)) {
      const cachedDevice = this._devices.get(deviceId);
      cachedDevice.updateStatus('connected');
      cachedDevice.lastSeen = new Date();
      return cachedDevice;
    }

    // Create new device
    const device = new Device({
      id: deviceId,
      type: 'usb',
      name: this._getDeviceName(usbDevice),
      vendorId: usbDevice.deviceDescriptor.idVendor,
      productId: usbDevice.deviceDescriptor.idProduct,
      serialNumber: await this._getSerialNumber(usbDevice),
      status: 'connected',
      capabilities: ['read', 'write', 'control'],
      lastSeen: new Date()
    });

    this._devices.set(deviceId, device);
    return device;
  }

  /**
   * Gets unique device identifier
   * @private
   * @param {Object} usbDevice - USB device
   * @returns {string} Device ID
   */
  _getDeviceId(usbDevice) {
    const vendor = usbDevice.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
    const product = usbDevice.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
    const busNumber = usbDevice.busNumber.toString().padStart(3, '0');
    const deviceAddress = usbDevice.deviceAddress.toString().padStart(3, '0');

    return `usb:${vendor}:${product}:${busNumber}:${deviceAddress}`;
  }

  /**
   * Gets human-readable device name
   * @private
   * @param {Object} usbDevice - USB device
   * @returns {string} Device name
   */
  _getDeviceName(usbDevice) {
    try {
      // Try to get manufacturer and product strings
      const manufacturer = usbDevice.deviceDescriptor.iManufacturer || 'Unknown';
      const product = usbDevice.deviceDescriptor.iProduct || 'USB Device';
      return `${manufacturer} ${product}`.trim();
    } catch (error) {
      return `USB Device (${usbDevice.deviceDescriptor.idVendor}:${usbDevice.deviceDescriptor.idProduct})`;
    }
  }

  /**
   * Gets device serial number
   * @private
   * @param {Object} usbDevice - USB device
   * @returns {Promise<string|null>} Serial number
   */
  async _getSerialNumber(usbDevice) {
    try {
      if (usbDevice.deviceDescriptor.iSerialNumber) {
        return new Promise((resolve) => {
          usbDevice.getStringDescriptor(
            usbDevice.deviceDescriptor.iSerialNumber,
            (error, serial) => {
              resolve(error ? null : serial);
            }
          );
        });
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Handles device attachment (commented out - not used currently)
   * @private
   * @param {Object} usbDevice - Attached USB device
   */
  // _onDeviceAttached(usbDevice) {
  //   const deviceId = this._getDeviceId(usbDevice);
  //   const device = this._devices.get(deviceId);
  //
  //   if (device) {
  //     device.updateStatus('connected');
  //   }
  // }

  /**
   * Handles device detachment (commented out - not used currently)
   * @private
   * @param {Object} usbDevice - Detached USB device
   */
  // _onDeviceDetached(usbDevice) {
  //   const deviceId = this._getDeviceId(usbDevice);
  //   const device = this._devices.get(deviceId);
  //
  //   if (device) {
  //     device.updateStatus('disconnected');
  //   }
  // }

  /**
   * Cleans up USB library
   */
  async cleanup() {
    if (this._initialized) {
      // Remove event listeners
      if (typeof usb.removeAllListeners === 'function') {
        usb.removeAllListeners('attach');
        usb.removeAllListeners('detach');
      }

      // Close all open devices
      for (const device of this._devices.values()) {
        if (device.status === 'connected') {
          device.updateStatus('disconnected');
        }
      }

      this._devices.clear();
      this._initialized = false;
    }
  }
}

module.exports = USBLib;