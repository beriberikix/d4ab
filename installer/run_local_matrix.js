#!/usr/bin/env node

/**
 * Local installer smoke matrix runner.
 * Executes the platform-appropriate smoke test and reports skipped targets.
 */

const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const options = {
    withChrome: false,
    chromeExtensionId: ''
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--with-chrome') {
      options.withChrome = true;
    } else if (arg === '--chrome-extension-id' && argv[i + 1]) {
      options.chromeExtensionId = argv[i + 1];
      i++;
    } else if (arg.startsWith('--chrome-extension-id=')) {
      options.chromeExtensionId = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log('D4AB Local Installer Matrix Runner');
  console.log('');
  console.log('Usage: node installer/run_local_matrix.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --with-chrome                       Enable Chrome/Chromium checks where supported');
  console.log('  --chrome-extension-id <id>          Chrome extension ID for Chrome host manifest checks');
  console.log('  --help, -h                          Show this help message');
}

function runStep(label, command, args, cwd) {
  console.log(`\n▶ ${label}`);
  console.log(`   $ ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const platform = os.platform();

  const matrix = [
    {
      id: 'macos-brew',
      label: 'macOS Brew smoke',
      runOn: 'darwin',
      command: 'bash',
      args: [path.join('installer', 'smoke_macos_brew.sh')]
    },
    {
      id: 'linux-brew',
      label: 'Linux Brew smoke',
      runOn: 'linux',
      command: 'bash',
      args: [
        path.join('installer', 'smoke_linux_brew.sh'),
        ...(options.withChrome ? ['--with-chrome'] : []),
        ...(options.chromeExtensionId ? ['--chrome-extension-id', options.chromeExtensionId] : [])
      ]
    },
    {
      id: 'windows-inno',
      label: 'Windows Inno smoke',
      runOn: 'win32',
      command: 'powershell',
      args: [
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join('installer', 'smoke_windows_inno.ps1'),
        ...(options.withChrome ? ['-WithChrome'] : []),
        ...(options.chromeExtensionId ? ['-ChromeExtensionId', options.chromeExtensionId] : [])
      ]
    }
  ];

  console.log(`Running local installer matrix on platform: ${platform}`);

  for (const step of matrix) {
    if (platform !== step.runOn) {
      console.log(`\n◦ ${step.label}: skipped (requires ${step.runOn})`);
      continue;
    }

    runStep(step.label, step.command, step.args, repoRoot);
  }

  console.log('\n✅ Local installer matrix completed.');
}

try {
  main();
} catch (error) {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
}
