const noble = require('@abandonware/noble');
const Device = require('../models/device');

/**
 * Bluetooth LE Library wrapper for hardware access
 */
class BluetoothLib {
  constructor() {
    this._devices = new Map();
    this._peripherals = new Map();
    this._connections = new Map();
    this._scanning = false;
    this._initialized = false;
    this._powerState = 'unknown';
  }

  /**
   * Initializes Bluetooth library
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    if (noble.state === 'poweredOff' || noble.state === 'unsupported') {
      this._powerState = noble.state;
      throw new Error(`Bluetooth ${noble.state}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Bluetooth initialization timeout'));
      }, 3000);

      noble.on('stateChange', (state) => {
        this._powerState = state;
        if (state === 'poweredOn') {
          clearTimeout(timeout);
          this._setupEventHandlers();
          this._initialized = true;
          resolve();
        } else if (state === 'poweredOff' || state === 'unsupported') {
          clearTimeout(timeout);
          reject(new Error(`Bluetooth ${state}`));
        }
      });

      // Start noble if not already started
      if (noble.state === 'poweredOn') {
        clearTimeout(timeout);
        this._setupEventHandlers();
        this._initialized = true;
        resolve();
      }
    });
  }

  /**
   * Sets up Bluetooth event handlers
   * @private
   */
  _setupEventHandlers() {
    noble.on('discover', (peripheral) => {
      this._onDeviceDiscovered(peripheral);
    });

    noble.on('scanStart', () => {
      this._scanning = true;
    });

    noble.on('scanStop', () => {
      this._scanning = false;
    });
  }

  /**
   * Enumerates Bluetooth devices
   * @param {Object} options - Enumeration options
   * @param {boolean} options.includeDisconnected - Include disconnected devices
   * @param {number} options.scanDuration - Scan duration in ms (default 5000)
   * @returns {Promise<Device[]>} Array of Bluetooth devices
   */
  async enumerate(options = {}) {
    await this.initialize();

    if (this._powerState !== 'poweredOn') {
      throw new Error(`Bluetooth not available: ${this._powerState}`);
    }

    const requestedScanDuration = Number(options.scanDuration);
    const scanDuration = Number.isFinite(requestedScanDuration)
      ? Math.min(Math.max(requestedScanDuration, 1000), 20000)
      : 5000;

    const requestedHardTimeout = Number(options.hardTimeoutMs);
    const hardTimeoutMs = Number.isFinite(requestedHardTimeout)
      ? Math.min(Math.max(requestedHardTimeout, scanDuration + 1000), 30000)
      : Math.min(scanDuration + 5000, 30000);

    return new Promise((resolve, reject) => {
      const discoveredDevices = new Set();
      let completed = false;

      const onDiscover = (peripheral) => {
        const normalizedId = this._normalizeDeviceId(peripheral.id);
        const normalizedAddress = this._normalizeDeviceId(peripheral.address);

        if (normalizedId) {
          discoveredDevices.add(normalizedId);
        }

        if (normalizedAddress) {
          discoveredDevices.add(normalizedAddress);
        }
      };

      noble.on('discover', onDiscover);

      const cleanup = () => {
        noble.removeListener('discover', onDiscover);
      };

      const finishWithDevices = () => {
        if (completed) {
          return;
        }
        completed = true;
        clearTimeout(hardTimeout);
        cleanup();

        const devices = [];

        // Convert discovered peripherals to devices
        for (const deviceId of discoveredDevices) {
          const device = this._devices.get(deviceId);
          if (device) {
            devices.push(device);
          }
        }

        // Include cached disconnected devices if requested
        if (options.includeDisconnected) {
          for (const [id, device] of this._devices) {
            if (device.status === 'disconnected' && !discoveredDevices.has(id)) {
              devices.push(device);
            }
          }
        }

        resolve(devices);
      };

      const fail = (error) => {
        if (completed) {
          return;
        }
        completed = true;
        clearTimeout(hardTimeout);
        cleanup();
        reject(error);
      };

      const hardTimeout = setTimeout(() => {
        noble.stopScanning(() => {
          fail(new Error(`Bluetooth scan timeout after ${hardTimeoutMs}ms`));
        });
      }, hardTimeoutMs);

      // Start scanning
      noble.startScanning([], false, (error) => {
        if (error) {
          fail(new Error(`Bluetooth scan failed: ${error.message}`));
          return;
        }

        // Stop scanning after duration
        setTimeout(() => {
          noble.stopScanning(() => {
            finishWithDevices();
          });
        }, scanDuration);
      });
    });
  }

  /**
   * Connects to Bluetooth device
   * @param {string} deviceId - Device identifier
   * @param {Object} options - Connection options
   * @param {number} options.timeout - Connection timeout
   * @returns {Promise<Object>} Connection handle
   */
  async connect(deviceId, options = {}) {
    await this.initialize();

    if (this._powerState !== 'poweredOn') {
      throw new Error(`Bluetooth not available: ${this._powerState}`);
    }

    // Check if already connected
    if (this._connections.has(deviceId)) {
      throw new Error(`Bluetooth device already connected: ${deviceId}`);
    }

    // Find peripheral
    let peripheral = this._findPeripheral(deviceId);
    if (!peripheral) {
      peripheral = await this._discoverPeripheral(deviceId, options.scanDuration || 5000);
    }
    if (!peripheral) {
      throw new Error(`Bluetooth device not found: ${deviceId}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 10000;
      const timer = setTimeout(() => {
        reject(new Error('Bluetooth connection timeout'));
      }, timeout);

      peripheral.connect((error) => {
        clearTimeout(timer);

        if (error) {
          reject(new Error(`Bluetooth connection failed: ${error.message}`));
          return;
        }

        const connection = {
          peripheral,
          deviceId,
          connected: true,
          services: new Map(),
          characteristics: new Map()
        };

        this._connections.set(deviceId, connection);

        // Update device status
        const device = this._devices.get(deviceId);
        if (device) {
          device.updateStatus('connected');
        }

        resolve(connection);
      });
    });
  }

  /**
   * Discovers services and characteristics
   * @param {Object} connection - Connection handle
   * @returns {Promise<Object>} Services and characteristics
   */
  async discoverServices(connection) {
    if (!connection || !connection.peripheral || !connection.connected) {
      throw new Error('Invalid Bluetooth connection');
    }

    return new Promise((resolve, reject) => {
      connection.peripheral.discoverServices([], (error, services) => {
        if (error) {
          reject(new Error(`Service discovery failed: ${error.message}`));
          return;
        }

        const servicePromises = services.map(service => {
          return new Promise((serviceResolve) => {
            service.discoverCharacteristics([], (charError, characteristics) => {
              if (!charError) {
                connection.services.set(service.uuid, service);
                characteristics.forEach(char => {
                  connection.characteristics.set(char.uuid, char);
                });
              }
              serviceResolve(service);
            });
          });
        });

        Promise.all(servicePromises).then(() => {
          resolve({
            services: Array.from(connection.services.values()),
            characteristics: Array.from(connection.characteristics.values())
          });
        });
      });
    });
  }

  /**
   * Reads from Bluetooth characteristic
   * @param {Object} connection - Connection handle
   * @param {string} characteristicUuid - Characteristic UUID
   * @param {number} timeout - Read timeout in ms
   * @returns {Promise<Buffer>} Read data
   */
  async read(connection, characteristicUuid, timeout = 5000) {
    if (!connection || !connection.peripheral || !connection.connected) {
      throw new Error('Invalid Bluetooth connection');
    }

    const characteristic = connection.characteristics.get(characteristicUuid);
    if (!characteristic) {
      throw new Error(`Characteristic not found: ${characteristicUuid}`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Bluetooth read timeout'));
      }, timeout);

      characteristic.read((error, data) => {
        clearTimeout(timer);

        if (error) {
          reject(new Error(`Bluetooth read failed: ${error.message}`));
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Writes to Bluetooth characteristic
   * @param {Object} connection - Connection handle
   * @param {string} characteristicUuid - Characteristic UUID
   * @param {Buffer} data - Data to write
   * @param {boolean} withoutResponse - Write without response
   * @param {number} timeout - Write timeout in ms
   * @returns {Promise<number>} Number of bytes written
   */
  async write(connection, characteristicUuid, data, withoutResponse = false, timeout = 5000) {
    if (!connection || !connection.peripheral || !connection.connected) {
      throw new Error('Invalid Bluetooth connection');
    }

    const characteristic = connection.characteristics.get(characteristicUuid);
    if (!characteristic) {
      throw new Error(`Characteristic not found: ${characteristicUuid}`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Bluetooth write timeout'));
      }, timeout);

      characteristic.write(data, withoutResponse, (error) => {
        clearTimeout(timer);

        if (error) {
          reject(new Error(`Bluetooth write failed: ${error.message}`));
        } else {
          resolve(data.length);
        }
      });
    });
  }

  /**
   * Subscribes to characteristic notifications
   * @param {Object} connection - Connection handle
   * @param {string} characteristicUuid - Characteristic UUID
   * @param {Function} callback - Notification callback
   * @returns {Promise<void>}
   */
  async subscribe(connection, characteristicUuid, callback) {
    if (!connection || !connection.peripheral || !connection.connected) {
      throw new Error('Invalid Bluetooth connection');
    }

    const characteristic = connection.characteristics.get(characteristicUuid);
    if (!characteristic) {
      throw new Error(`Characteristic not found: ${characteristicUuid}`);
    }

    return new Promise((resolve, reject) => {
      characteristic.subscribe((error) => {
        if (error) {
          reject(new Error(`Notification subscription failed: ${error.message}`));
        } else {
          characteristic.on('data', callback);
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribes from characteristic notifications
   * @param {Object} connection - Connection handle
   * @param {string} characteristicUuid - Characteristic UUID
   * @returns {Promise<void>}
   */
  async unsubscribe(connection, characteristicUuid) {
    if (!connection || !connection.peripheral || !connection.connected) {
      throw new Error('Invalid Bluetooth connection');
    }

    const characteristic = connection.characteristics.get(characteristicUuid);
    if (!characteristic) {
      throw new Error(`Characteristic not found: ${characteristicUuid}`);
    }

    return new Promise((resolve, reject) => {
      characteristic.unsubscribe((error) => {
        if (error) {
          reject(new Error(`Notification unsubscribe failed: ${error.message}`));
        } else {
          characteristic.removeAllListeners('data');
          resolve();
        }
      });
    });
  }

  /**
   * Disconnects from Bluetooth device
   * @param {Object} connection - Connection handle
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(connection) {
    if (!connection || !connection.peripheral) {
      return false;
    }

    return new Promise((resolve) => {
      connection.peripheral.disconnect((error) => {
        connection.connected = false;

        // Remove from connections map
        this._connections.delete(connection.deviceId);

        // Update device status
        const device = this._devices.get(connection.deviceId);
        if (device) {
          device.updateStatus('disconnected');
        }

        resolve(!error);
      });
    });
  }

  /**
   * Handles device discovery
   * @private
   * @param {Object} peripheral - Discovered peripheral
   */
  _onDeviceDiscovered(peripheral) {
    const rawId = this._normalizeRawIdentifier(peripheral.id);
    if (rawId) {
      this._peripherals.set(rawId, peripheral);
    }

    const rawAddress = this._normalizeRawIdentifier(peripheral.address);
    if (rawAddress) {
      this._peripherals.set(rawAddress, peripheral);
    }

    const normalizedId = this._normalizeDeviceId(peripheral.id || peripheral.address);
    if (normalizedId) {
      this._peripherals.set(normalizedId, peripheral);
    }

    const normalizedAddress = this._normalizeDeviceId(peripheral.address);
    if (normalizedAddress) {
      this._peripherals.set(normalizedAddress, peripheral);
    }

    const device = this._createDeviceFromPeripheral(peripheral);
    // Device is automatically added to cache in _createDeviceFromPeripheral
  }

  /**
   * Creates Device model from Bluetooth peripheral
   * @private
   * @param {Object} peripheral - Bluetooth peripheral
   * @returns {Device} Device model
   */
  _createDeviceFromPeripheral(peripheral) {
    const deviceId =
      this._normalizeDeviceId(peripheral.id) ||
      this._normalizeDeviceId(peripheral.address) ||
      this._normalizeRawIdentifier(peripheral.id) ||
      this._normalizeRawIdentifier(peripheral.address);

    if (!deviceId) {
      return null;
    }

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
      type: 'bluetooth',
      name: peripheral.advertisement.localName || `Bluetooth Device ${deviceId.slice(-4)}`,
      vendorId: 0, // Bluetooth devices don't have USB-style vendor IDs
      productId: 0,
      serialNumber: null,
      status: 'connected',
      capabilities: ['read', 'write', 'control'],
      lastSeen: new Date()
    });

    this._devices.set(deviceId, device);
    return device;
  }

  /**
   * Finds peripheral by device ID
   * @private
   * @param {string} deviceId - Device identifier
   * @returns {Object|null} Peripheral object
   */
  _findPeripheral(deviceId) {
    const normalizedId = this._normalizeDeviceId(deviceId);
    const rawId = this._normalizeRawIdentifier(deviceId);

    if (!normalizedId && !rawId) {
      return null;
    }

    return (
      (normalizedId ? this._peripherals.get(normalizedId) : null) ||
      (rawId ? this._peripherals.get(rawId) : null) ||
      null
    );
  }

  /**
   * Scans briefly to discover a specific peripheral when not already cached.
   * @private
   * @param {string} deviceId - Target device identifier
   * @param {number} scanDuration - Scan window in milliseconds
   * @returns {Promise<Object|null>} Discovered peripheral
   */
  async _discoverPeripheral(deviceId, scanDuration = 5000) {
    const targetId = this._normalizeDeviceId(deviceId);
    if (!targetId) {
      return null;
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        noble.removeListener('discover', onDiscover);
      };

      const finish = (peripheral) => {
        if (settled) return;
        settled = true;

        noble.stopScanning(() => {
          cleanup();
          resolve(peripheral || null);
        });
      };

      const onDiscover = (peripheral) => {
        this._onDeviceDiscovered(peripheral);
        const discoveredId = this._normalizeDeviceId(peripheral.id || peripheral.address);
        const discoveredAddress = this._normalizeDeviceId(peripheral.address);

        if (discoveredId === targetId || discoveredAddress === targetId) {
          finish(peripheral);
        }
      };

      noble.on('discover', onDiscover);

      noble.startScanning([], false, (error) => {
        if (error) {
          cleanup();
          reject(new Error(`Bluetooth scan failed: ${error.message}`));
          return;
        }

        setTimeout(() => finish(null), scanDuration);
      });
    });
  }

  /**
   * Normalizes Bluetooth identifiers to 12-char lowercase hex.
   * @private
   * @param {string} id - Peripheral id/address
   * @returns {string|null} Normalized identifier
   */
  _normalizeDeviceId(id) {
    if (!id || typeof id !== 'string') {
      return null;
    }

    const cleaned = id.replace(/[:\-]/g, '').toLowerCase();
    if (/^[0-9a-f]{12}$/.test(cleaned)) {
      return cleaned;
    }

    // Some BLE stacks expose UUID-style identifiers rather than MAC addresses.
    if (/^[0-9a-f]{32}$/.test(cleaned)) {
      return cleaned;
    }

    return null;
  }

  /**
   * Preserves a stable raw identifier for cases where MAC/UUID normalization fails.
   * @private
   * @param {string} id - Peripheral id/address
   * @returns {string|null} Normalized raw identifier
   */
  _normalizeRawIdentifier(id) {
    if (!id || typeof id !== 'string') {
      return null;
    }

    const trimmed = id.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Gets Bluetooth adapter state
   * @returns {string} Power state
   */
  getPowerState() {
    return this._powerState;
  }

  /**
   * Checks if scanning is active
   * @returns {boolean} Scanning status
   */
  isScanning() {
    return this._scanning;
  }

  /**
   * Cleans up Bluetooth library
   */
  async cleanup() {
    if (this._initialized) {
      // Stop scanning if active
      if (this._scanning) {
        noble.stopScanning();
      }

      // Disconnect all devices
      const disconnectPromises = [];
      for (const connection of this._connections.values()) {
        if (connection.connected) {
          disconnectPromises.push(this.disconnect(connection));
        }
      }

      await Promise.all(disconnectPromises);

      // Remove all listeners
      noble.removeAllListeners();

      this._devices.clear();
      this._peripherals.clear();
      this._connections.clear();
      this._initialized = false;
    }
  }
}

module.exports = BluetoothLib;