#!/usr/bin/env node

/**
 * WebHW End-to-End Test Setup
 * Tests the complete system: extension + native bridge + device enumeration
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class WebHWTestSetup {
  constructor() {
    this.testResults = {
      dependencies: false,
      nativeBridge: false,
      deviceEnum: false,
      extensionReady: false
    };
  }

  /**
   * Runs complete system test
   */
  async runTests() {
    console.log('🧪 WebHW Hardware Bridge - End-to-End Test');
    console.log('=' .repeat(50));

    try {
      await this.testDependencies();
      await this.testNativeBridge();
      await this.testDeviceEnumeration();
      await this.installNativeHost();

      this.printResults();
      this.printNextSteps();

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Tests Node.js dependencies
   */
  async testDependencies() {
    console.log('📦 Testing Dependencies...');

    try {
      // Check Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

      if (majorVersion < 18) {
        throw new Error(`Node.js ${nodeVersion} detected. Requires Node.js 18.0+`);
      }

      console.log(`✅ Node.js ${nodeVersion} (compatible)`);

      // Check backend dependencies
      const backendPath = path.join(__dirname, 'backend');

      if (!fs.existsSync(path.join(backendPath, 'node_modules'))) {
        console.log('📦 Installing backend dependencies...');
        execSync('npm install', { cwd: backendPath, stdio: 'pipe' });
      }

      console.log('✅ Backend dependencies installed');

      // Test USB library
      try {
        const usb = require('./backend/node_modules/usb');
        console.log('✅ USB library loaded');
      } catch (error) {
        console.warn('⚠️  USB library load failed:', error.message);
        console.log('   This may affect USB device enumeration');
      }

      // Test Serial library
      try {
        const { SerialPort } = require('./backend/node_modules/serialport');
        console.log('✅ SerialPort library loaded');
      } catch (error) {
        console.warn('⚠️  SerialPort library load failed:', error.message);
        console.log('   This may affect serial port enumeration');
      }

      this.testResults.dependencies = true;

    } catch (error) {
      throw new Error(`Dependency test failed: ${error.message}`);
    }
  }

  /**
   * Tests native bridge functionality
   */
  async testNativeBridge() {
    console.log('🔌 Testing Native Bridge...');

    try {
      // Test bridge CLI version
      const versionOutput = execSync('node src/bridge_cli.js --show-version', {
        cwd: path.join(__dirname, 'backend'),
        encoding: 'utf8',
        timeout: 5000
      });

      if (!versionOutput.includes('1.0.0')) {
        throw new Error(`Unexpected version output: ${versionOutput}`);
      }

      console.log('✅ Bridge CLI responds correctly');

      // Test JSON-RPC health check
      const healthCheck = JSON.stringify({
        jsonrpc: '2.0',
        method: 'health',
        id: 'test-health'
      });

      try {
        const bridge = spawn('node', ['src/bridge_cli.js'], {
          cwd: path.join(__dirname, 'backend'),
          stdio: 'pipe'
        });

        // Send health check message using native messaging format
        const messageBuffer = Buffer.from(healthCheck, 'utf8');
        const lengthBuffer = Buffer.allocUnsafe(4);
        lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

        bridge.stdin.write(lengthBuffer);
        bridge.stdin.write(messageBuffer);

        // Wait for response or timeout
        let responseReceived = false;

        setTimeout(() => {
          if (!responseReceived) {
            bridge.kill();
          }
        }, 3000);

        bridge.stdout.once('data', (data) => {
          responseReceived = true;
          bridge.kill();
          console.log('✅ Native messaging communication working');
        });

        bridge.on('error', (error) => {
          throw new Error(`Bridge process error: ${error.message}`);
        });

      } catch (error) {
        console.warn('⚠️  Native messaging test failed:', error.message);
        console.log('   Bridge CLI works but messaging may have issues');
      }

      this.testResults.nativeBridge = true;

    } catch (error) {
      throw new Error(`Native bridge test failed: ${error.message}`);
    }
  }

  /**
   * Tests device enumeration
   */
  async testDeviceEnumeration() {
    console.log('📱 Testing Device Enumeration...');

    try {
      // Test USB device enumeration
      const usbTest = execSync('node src/bridge_cli.js --enumerate usb --format json', {
        cwd: path.join(__dirname, 'backend'),
        encoding: 'utf8',
        timeout: 10000
      });

      const usbResult = JSON.parse(usbTest);

      if (usbResult.result && usbResult.result.devices) {
        const usbCount = usbResult.result.devices.length;
        console.log(`✅ USB enumeration: ${usbCount} devices found`);
      } else {
        console.log('⚠️  USB enumeration returned no devices');
      }

      // Test Serial port enumeration
      const serialTest = execSync('node src/bridge_cli.js --enumerate serial --format json', {
        cwd: path.join(__dirname, 'backend'),
        encoding: 'utf8',
        timeout: 10000
      });

      const serialResult = JSON.parse(serialTest);

      if (serialResult.result && serialResult.result.devices) {
        const serialCount = serialResult.result.devices.length;
        console.log(`✅ Serial enumeration: ${serialCount} ports found`);
      } else {
        console.log('⚠️  Serial enumeration returned no ports');
      }

      this.testResults.deviceEnum = true;

    } catch (error) {
      throw new Error(`Device enumeration test failed: ${error.message}`);
    }
  }

  /**
   * Installs native messaging host
   */
  async installNativeHost() {
    console.log('🏠 Installing Native Messaging Host...');

    try {
      const installerPath = path.join(__dirname, 'installer', 'install_native_host.js');

      if (fs.existsSync(installerPath)) {
        execSync('node install_native_host.js install', {
          cwd: path.join(__dirname, 'installer'),
          stdio: 'pipe'
        });

        console.log('✅ Native messaging host installed');
        this.testResults.extensionReady = true;
      } else {
        console.log('⚠️  Native messaging host installer not found');
        console.log('   Extension may not be able to communicate with bridge');
      }

    } catch (error) {
      console.warn('⚠️  Native messaging host installation failed:', error.message);
      console.log('   You may need to install manually');
    }
  }

  /**
   * Prints test results summary
   */
  printResults() {
    console.log('\n📊 Test Results Summary');
    console.log('=' .repeat(25));

    const results = [
      { name: 'Dependencies', status: this.testResults.dependencies },
      { name: 'Native Bridge', status: this.testResults.nativeBridge },
      { name: 'Device Enumeration', status: this.testResults.deviceEnum },
      { name: 'Extension Ready', status: this.testResults.extensionReady }
    ];

    results.forEach(result => {
      const icon = result.status ? '✅' : '❌';
      console.log(`${icon} ${result.name}`);
    });

    const passedTests = results.filter(r => r.status).length;
    console.log(`\n📈 ${passedTests}/${results.length} tests passed`);

    if (passedTests === results.length) {
      console.log('\n🎉 All systems operational!');
    } else {
      console.log('\n⚠️  Some issues detected. See troubleshooting below.');
    }
  }

  /**
   * Prints next steps for the user
   */
  printNextSteps() {
    console.log('\n🚀 Next Steps');
    console.log('=' .repeat(12));

    console.log('1. 📱 Install browser extension:');
    console.log('   Chrome/Edge: Load unpacked from frontend/ directory');
    console.log('   Firefox: Load temporary add-on manifest.json');
    console.log('');

    console.log('2. 🌐 Test in browser console:');
    console.log('   navigator.usb.getDevices()');
    console.log('   navigator.serial.getPorts()');
    console.log('');

    console.log('3. 🔗 Try example applications:');
    console.log('   https://intel.github.io/zephyr.js/webusb/');
    console.log('   https://serial-terminal.vercel.app/');
    console.log('');

    console.log('📚 Documentation: README.md');
    console.log('🐛 Issues: Check logs in backend/logs/');
    console.log('💬 Support: GitHub Issues or Discord');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new WebHWTestSetup();
  tester.runTests();
}

module.exports = WebHWTestSetup;