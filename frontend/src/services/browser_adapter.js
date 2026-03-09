/**
 * Cross-Browser Compatibility Layer
 * Provides unified APIs across Chrome, Firefox, and Edge
 */

export class BrowserAdapter {
  constructor() {
    this.browserType = this.detectBrowser();
    this.manifestVersion = this.getManifestVersion();
    this.capabilities = this.detectCapabilities();
  }

  /**
   * Detects the current browser type
   * @returns {string} Browser identifier
   */
  detectBrowser() {
    // Chrome and Chromium-based browsers
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnect) {
      if (navigator.userAgent.includes('Edg/')) {
        return 'edge';
      }
      if (navigator.userAgent.includes('OPR/')) {
        return 'opera';
      }
      return 'chrome';
    }

    // Firefox
    if (typeof browser !== 'undefined' && browser.runtime) {
      return 'firefox';
    }


    return 'unknown';
  }

  /**
   * Gets the manifest version
   * @returns {number} Manifest version (2 or 3)
   */
  getManifestVersion() {
    try {
      const manifest = this.getRuntime().getManifest();
      return manifest.manifest_version || 2;
    } catch (error) {
      return 2; // Default to V2 for compatibility
    }
  }

  /**
   * Detects browser capabilities
   * @returns {Object} Capability flags
   */
  detectCapabilities() {
    const caps = {
      nativeMessaging: false,
      webRequest: false,
      declarativeNetRequest: false,
      scripting: false,
      activeTab: false,
      storage: false,
      notifications: false,
      contextMenus: false
    };

    try {
      const runtime = this.getRuntime();

      // Native Messaging
      caps.nativeMessaging = !!(runtime.connectNative || runtime.sendNativeMessage);

      // Web Request APIs
      caps.webRequest = !!(this.getBrowserAPI().webRequest);
      caps.declarativeNetRequest = !!(this.getBrowserAPI().declarativeNetRequest);

      // Scripting APIs
      caps.scripting = !!(this.getBrowserAPI().scripting);

      // Permission APIs
      caps.storage = !!(this.getBrowserAPI().storage);
      caps.notifications = !!(this.getBrowserAPI().notifications);
      caps.contextMenus = !!(this.getBrowserAPI().contextMenus || this.getBrowserAPI().menus);

    } catch (error) {
      console.warn('Capability detection failed:', error);
    }

    return caps;
  }

  /**
   * Gets the appropriate browser API object
   * @returns {Object} Browser API namespace
   */
  getBrowserAPI() {
    switch (this.browserType) {
      case 'firefox':
        return typeof browser !== 'undefined' ? browser : chrome;
      default:
        return chrome;
    }
  }

  /**
   * Gets the runtime API with cross-browser compatibility
   * @returns {Object} Runtime API
   */
  getRuntime() {
    const api = this.getBrowserAPI();
    return api.runtime;
  }

  /**
   * Gets the tabs API with cross-browser compatibility
   * @returns {Object} Tabs API
   */
  getTabs() {
    const api = this.getBrowserAPI();
    return api.tabs;
  }

  /**
   * Gets the storage API with cross-browser compatibility
   * @returns {Object} Storage API
   */
  getStorageAPI() {
    const api = this.getBrowserAPI();
    return api.storage;
  }

  /**
   * Gets the scripting API with fallback to tabs.executeScript
   * @returns {Object} Scripting API
   */
  getScripting() {
    const api = this.getBrowserAPI();

    if (api.scripting) {
      return api.scripting;
    }

    // Fallback for Manifest V2
    return {
      executeScript: (injection) => {
        return new Promise((resolve, reject) => {
          const tabId = injection.target?.tabId;
          const files = injection.files;
          const func = injection.func;

          if (files && files.length > 0) {
            api.tabs.executeScript(tabId, { file: files[0] }, (result) => {
              if (api.runtime.lastError) {
                reject(new Error(api.runtime.lastError.message));
              } else {
                resolve([{ result }]);
              }
            });
          } else if (func) {
            api.tabs.executeScript(tabId, { code: `(${func})()` }, (result) => {
              if (api.runtime.lastError) {
                reject(new Error(api.runtime.lastError.message));
              } else {
                resolve([{ result }]);
              }
            });
          } else {
            reject(new Error('No script content provided'));
          }
        });
      }
    };
  }

  /**
   * Connects to native application with cross-browser support
   * @param {string} applicationName - Native application identifier
   * @returns {Object} Native messaging port
   */
  connectNative(applicationName) {
    const runtime = this.getRuntime();

    if (!this.capabilities.nativeMessaging) {
      throw new Error(`Native messaging not supported in ${this.browserType}`);
    }

    switch (this.browserType) {
      case 'firefox':
        // Firefox uses same API as Chrome but may have different behavior
        return runtime.connectNative(applicationName);


      default:
        return runtime.connectNative(applicationName);
    }
  }

  /**
   * Sends message to native application
   * @param {string} applicationName - Native application identifier
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response from native application
   */
  async sendNativeMessage(applicationName, message) {
    const runtime = this.getRuntime();

    if (!this.capabilities.nativeMessaging) {
      throw new Error(`Native messaging not supported in ${this.browserType}`);
    }

    return new Promise((resolve, reject) => {
      runtime.sendNativeMessage(applicationName, message, (response) => {
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Injects content script with cross-browser compatibility
   * @param {number} tabId - Target tab ID
   * @param {Object} details - Injection details
   * @returns {Promise<Array>} Injection results
   */
  async injectScript(tabId, details) {
    const scripting = this.getScripting();

    if (this.manifestVersion === 3 && scripting.executeScript) {
      // Manifest V3 approach
      return scripting.executeScript({
        target: { tabId },
        ...details
      });
    } else {
      // Manifest V2 fallback
      return scripting.executeScript({
        target: { tabId },
        ...details
      });
    }
  }

  /**
   * Adds message listener with cross-browser compatibility
   * @param {Function} listener - Message listener function
   */
  addMessageListener(listener) {
    const runtime = this.getRuntime();

    const wrappedListener = (message, sender, sendResponse) => {
      // Normalize sender object across browsers
      const normalizedSender = {
        id: sender.id,
        url: sender.url,
        tab: sender.tab,
        frameId: sender.frameId || 0,
        origin: sender.origin || (sender.url ? new URL(sender.url).origin : null)
      };

      return listener(message, normalizedSender, sendResponse);
    };

    runtime.onMessage.addListener(wrappedListener);
    return wrappedListener;
  }

  /**
   * Creates notification with cross-browser compatibility
   * @param {Object} options - Notification options
   * @returns {Promise<string>} Notification ID
   */
  async createNotification(options) {
    const api = this.getBrowserAPI();

    if (!this.capabilities.notifications) {
      throw new Error(`Notifications not supported in ${this.browserType}`);
    }

    return new Promise((resolve, reject) => {
      // Normalize notification options
      const normalizedOptions = {
        type: 'basic',
        iconUrl: options.iconUrl || '/icons/icon-48.png',
        title: options.title,
        message: options.message,
        ...options
      };

      api.notifications.create(normalizedOptions, (notificationId) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve(notificationId);
        }
      });
    });
  }

  /**
   * Gets extension info with cross-browser compatibility
   * @returns {Object} Extension information
   */
  getExtensionInfo() {
    const runtime = this.getRuntime();
    const manifest = runtime.getManifest();

    return {
      id: runtime.id,
      version: manifest.version,
      name: manifest.name,
      manifestVersion: manifest.manifest_version,
      browserType: this.browserType,
      capabilities: this.capabilities
    };
  }

  /**
   * Stores data with cross-browser compatibility
   * @param {Object} data - Data to store
   * @param {string} area - Storage area ('local', 'sync', 'managed')
   * @returns {Promise<void>}
   */
  async setStorage(data, area = 'local') {
    const storage = this.getStorageAPI();

    return new Promise((resolve, reject) => {
      storage[area].set(data, () => {
        if (this.getRuntime().lastError) {
          reject(new Error(this.getRuntime().lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Retrieves data with cross-browser compatibility
   * @param {string|Array|Object} keys - Keys to retrieve
   * @param {string} area - Storage area ('local', 'sync', 'managed')
   * @returns {Promise<Object>} Retrieved data
   */
  async getStorage(keys, area = 'local') {
    const storage = this.getStorageAPI();

    return new Promise((resolve, reject) => {
      storage[area].get(keys, (result) => {
        if (this.getRuntime().lastError) {
          reject(new Error(this.getRuntime().lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Removes data with cross-browser compatibility
   * @param {string|Array} keys - Keys to remove
   * @param {string} area - Storage area ('local', 'sync', 'managed')
   * @returns {Promise<void>}
   */
  async removeStorage(keys, area = 'local') {
    const storage = this.getStorageAPI();

    return new Promise((resolve, reject) => {
      storage[area].remove(keys, () => {
        if (this.getRuntime().lastError) {
          reject(new Error(this.getRuntime().lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Gets active tab with cross-browser compatibility
   * @returns {Promise<Object>} Active tab information
   */
  async getActiveTab() {
    const tabs = this.getTabs();

    return new Promise((resolve, reject) => {
      tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (this.getRuntime().lastError) {
          reject(new Error(this.getRuntime().lastError.message));
        } else if (tabs.length === 0) {
          reject(new Error('No active tab found'));
        } else {
          resolve(tabs[0]);
        }
      });
    });
  }

  /**
   * Checks if running in service worker context
   * @returns {boolean} True if service worker context
   */
  isServiceWorker() {
    return typeof importScripts === 'function' &&
           typeof WorkerGlobalScope !== 'undefined' &&
           self instanceof WorkerGlobalScope;
  }

  /**
   * Checks if API is available
   * @param {string} apiName - API name to check
   * @returns {boolean} True if API is available
   */
  hasAPI(apiName) {
    const api = this.getBrowserAPI();
    return !!(api && api[apiName]);
  }

  /**
   * Gets browser-specific configuration
   * @returns {Object} Browser configuration
   */
  getBrowserConfig() {
    const configs = {
      chrome: {
        nativeMessagingHostName: 'com.webhw.hardware_bridge',
        maxNativeMessageSize: 1024 * 1024, // 1MB
        supportsServiceWorker: true,
        supportsOffscreen: true
      },
      firefox: {
        nativeMessagingHostName: 'com.webhw.hardware_bridge',
        maxNativeMessageSize: 1024 * 1024, // 1MB
        supportsServiceWorker: false,
        supportsOffscreen: false
      },
      edge: {
        nativeMessagingHostName: 'com.webhw.hardware_bridge',
        maxNativeMessageSize: 1024 * 1024, // 1MB
        supportsServiceWorker: true,
        supportsOffscreen: true
      },
    };

    return configs[this.browserType] || configs.chrome;
  }
}