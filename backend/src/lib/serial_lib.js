let SerialPortClass = null;

function getSerialPortClass() {
  if (SerialPortClass) {
    return SerialPortClass;
  }

  const serialport = require('serialport');
  if (!serialport || !serialport.SerialPort) {
    throw new Error('serialport module is unavailable');
  }

  SerialPortClass = serialport.SerialPort;
  return SerialPortClass;
}
const Device = require('../models/device');

/**
 * Serial Port Library wrapper for hardware access
 */
class SerialLib {
  constructor() {
    this._devices = new Map();
    this._connections = new Map();
    this._initialized = false;
  }

  /**
   * Initializes Serial library
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    try {
      // Serial ports are discovered dynamically, no global initialization needed
      this._initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Serial library: ${error.message}`);
    }
  }

  /**
   * Enumerates serial ports
   * @param {Object} options - Enumeration options
   * @param {boolean} options.includeDisconnected - Include disconnected devices
   * @returns {Promise<Device[]>} Array of serial devices
   */
  async enumerate(options = {}) {
    await this.initialize();

    try {
      const SerialPort = getSerialPortClass();
      const ports = await SerialPort.list();
      const devices = [];

      for (const port of ports) {
        const device = this._createDeviceFromPort(port);
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
      throw new Error(`Serial enumeration failed: ${error.message}`);
    }
  }

  /**
   * Connects to serial port
   * @param {string} deviceId - Device identifier (port path)
   * @param {Object} options - Connection options
   * @param {number} options.baudRate - Baud rate (default 9600)
   * @param {number} options.dataBits - Data bits (default 8)
   * @param {number} options.stopBits - Stop bits (default 1)
   * @param {string} options.parity - Parity (default 'none')
   * @param {number} options.timeout - Connection timeout
   * @returns {Promise<Object>} Connection handle
   */
  async connect(deviceId, options = {}) {
    await this.initialize();

    const SerialPort = getSerialPortClass();

    const portPath = this._getPortPathFromDeviceId(deviceId);
    if (!portPath) {
      throw new Error(`Invalid serial device ID: ${deviceId}`);
    }

    // Check if already connected
    if (this._connections.has(deviceId)) {
      throw new Error(`Serial device already connected: ${deviceId}`);
    }

    const config = {
      path: portPath,
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
      autoOpen: false
    };

    try {
      const port = new SerialPort(config);

      // Open port with timeout
      return new Promise((resolve, reject) => {
        const timeout = options.timeout || 5000;
        const timer = setTimeout(() => {
          reject(new Error('Serial connection timeout'));
        }, timeout);

        port.open((error) => {
          clearTimeout(timer);

          if (error) {
            reject(new Error(`Serial connection failed: ${error.message}`));
            return;
          }

          const connection = {
            port,
            deviceId,
            portPath,
            config,
            connected: true,
            opened: true
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
    } catch (error) {
      throw new Error(`Serial connection failed: ${error.message}`);
    }
  }

  /**
   * Reads data from serial port
   * @param {Object} connection - Connection handle
   * @param {number} length - Number of bytes to read (optional)
   * @param {number} timeout - Read timeout in ms
   * @returns {Promise<Buffer>} Read data
   */
  async read(connection, length = 0, timeout = 1000) {
    if (!connection || !connection.port || !connection.connected) {
      throw new Error('Invalid serial connection');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Serial read timeout'));
      }, timeout);

      let buffer = Buffer.alloc(0);
      const targetLength = length || 1024;

      const onData = (data) => {
        buffer = Buffer.concat([buffer, data]);

        // If specific length requested, wait for that amount
        if (length > 0 && buffer.length >= length) {
          cleanup();
          resolve(buffer.slice(0, length));
        } else if (length === 0) {
          // Return what we have after a brief pause
          setTimeout(() => {
            cleanup();
            resolve(buffer);
          }, 50);
        }
      };

      const onError = (error) => {
        cleanup();
        reject(new Error(`Serial read error: ${error.message}`));
      };

      const cleanup = () => {
        clearTimeout(timer);
        connection.port.removeListener('data', onData);
        connection.port.removeListener('error', onError);
      };

      connection.port.on('data', onData);
      connection.port.on('error', onError);
    });
  }

  /**
   * Writes data to serial port
   * @param {Object} connection - Connection handle
   * @param {Buffer} data - Data to write
   * @param {number} timeout - Write timeout in ms
   * @returns {Promise<number>} Number of bytes written
   */
  async write(connection, data, timeout = 1000) {
    if (!connection || !connection.port || !connection.connected) {
      throw new Error('Invalid serial connection');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Serial write timeout'));
      }, timeout);

      connection.port.write(data, (error) => {
        clearTimeout(timer);

        if (error) {
          reject(new Error(`Serial write failed: ${error.message}`));
        } else {
          // Wait for drain to ensure data is actually sent
          connection.port.drain((drainError) => {
            if (drainError) {
              reject(new Error(`Serial drain failed: ${drainError.message}`));
            } else {
              resolve(data.length);
            }
          });
        }
      });
    });
  }

  /**
   * Disconnects from serial port
   * @param {Object} connection - Connection handle
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(connection) {
    if (!connection || !connection.port) {
      return false;
    }

    return new Promise((resolve) => {
      connection.port.close((error) => {
        connection.connected = false;
        connection.opened = false;

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
   * Creates Device model from serial port info
   * @private
   * @param {Object} portInfo - Serial port information
   * @returns {Device} Device model
   */
  _createDeviceFromPort(portInfo) {
    const deviceId = this._getDeviceIdFromPort(portInfo);

    // Check if we already have this device cached
    if (this._devices.has(deviceId)) {
      const cachedDevice = this._devices.get(deviceId);
      cachedDevice.updateStatus('connected');
      cachedDevice.lastSeen = new Date();
      return cachedDevice;
    }

    // Parse vendor/product IDs from USB info if available
    let vendorId = 0;
    let productId = 0;
    if (portInfo.vendorId) {
      vendorId = parseInt(portInfo.vendorId, 16) || 0;
    }
    if (portInfo.productId) {
      productId = parseInt(portInfo.productId, 16) || 0;
    }

    // Create new device
    const device = new Device({
      id: deviceId,
      type: 'serial',
      name: this._getPortName(portInfo),
      vendorId,
      productId,
      serialNumber: portInfo.serialNumber || null,
      status: 'connected',
      capabilities: ['read', 'write'],
      lastSeen: new Date()
    });

    this._devices.set(deviceId, device);
    return device;
  }

  /**
   * Gets unique device identifier from port info
   * @private
   * @param {Object} portInfo - Port information
   * @returns {string} Device ID
   */
  _getDeviceIdFromPort(portInfo) {
    // Use port path as primary identifier
    return `serial:${portInfo.path}`;
  }

  /**
   * Gets port path from device ID
   * @private
   * @param {string} deviceId - Device identifier
   * @returns {string|null} Port path
   */
  _getPortPathFromDeviceId(deviceId) {
    if (deviceId.startsWith('serial:')) {
      return deviceId.substring(7); // Remove 'serial:' prefix
    }
    return null;
  }

  /**
   * Gets human-readable port name
   * @private
   * @param {Object} portInfo - Port information
   * @returns {string} Port name
   */
  _getPortName(portInfo) {
    if (portInfo.friendlyName) {
      return portInfo.friendlyName;
    }

    if (portInfo.manufacturer && portInfo.productName) {
      return `${portInfo.manufacturer} ${portInfo.productName}`;
    }

    return `Serial Port (${portInfo.path})`;
  }

  /**
   * Gets all active connections
   * @returns {Map<string, Object>} Active connections
   */
  getConnections() {
    return new Map(this._connections);
  }

  /**
   * Checks if device is connected
   * @param {string} deviceId - Device identifier
   * @returns {boolean} Connection status
   */
  isConnected(deviceId) {
    return this._connections.has(deviceId);
  }

  /**
   * Cleans up serial library
   */
  async cleanup() {
    if (this._initialized) {
      // Close all open connections
      const disconnectPromises = [];
      for (const connection of this._connections.values()) {
        if (connection.connected) {
          disconnectPromises.push(this.disconnect(connection));
        }
      }

      await Promise.all(disconnectPromises);

      this._devices.clear();
      this._connections.clear();
      this._initialized = false;
    }
  }
}

module.exports = SerialLib;