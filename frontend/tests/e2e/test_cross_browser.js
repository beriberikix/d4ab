const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

describe('Cross-Browser Build and Manifest Compatibility', () => {
  const rootDir = path.join(__dirname, '../..');

  test('manifest files define browser-appropriate schema', () => {
    const chromeManifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'manifest-chrome.json'), 'utf8')
    );
    const firefoxManifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'manifest-firefox.json'), 'utf8')
    );

    expect(chromeManifest.manifest_version).toBe(3);
    expect(chromeManifest.background).toHaveProperty('service_worker');

    expect(firefoxManifest.manifest_version).toBe(2);
    expect(firefoxManifest.background).toHaveProperty('scripts');
    expect(firefoxManifest.applications.gecko.id).toBeTruthy();
  });

  test('build-browser script produces chrome build artifacts', () => {
    const result = spawnSync('node', ['build-browser.js', 'chrome'], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);

    const manifestPath = path.join(rootDir, 'build', 'chrome', 'manifest.json');
    const backgroundPath = path.join(rootDir, 'build', 'chrome', 'src', 'background', 'service_worker.js');

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(backgroundPath)).toBe(true);

    const builtManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(builtManifest.manifest_version).toBe(3);
  });

  test('build-browser script produces firefox build artifacts', () => {
    const result = spawnSync('node', ['build-browser.js', 'firefox'], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);

    const manifestPath = path.join(rootDir, 'build', 'firefox', 'manifest.json');
    const backgroundPath = path.join(rootDir, 'build', 'firefox', 'src', 'background', 'service_worker.js');

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(backgroundPath)).toBe(true);

    const builtManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(builtManifest.manifest_version).toBe(2);
  });
});
