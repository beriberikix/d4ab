module.exports = {
  // Global options:
  verbose: false,

  // Command options:
  build: {
    overwriteDest: true
  },

  run: {
    browserConsole: true,
    startUrl: [
      'about:debugging#/runtime/this-firefox',
      'chrome://extensions/'
    ],
    args: [
      // Chrome flags for hardware access
      '--enable-web-bluetooth',
      '--enable-experimental-web-platform-features'
    ]
  },

  lint: {
    pretty: true,
    warningsAsErrors: false,
    metadata: false,
    output: 'text'
  },

  sign: {
    channel: 'unlisted'
  }
};