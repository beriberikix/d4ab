const fs = require('fs');
const path = require('path');

describe('Security Compliance', () => {
  test('manifests define restrictive CSP policies', () => {
    const chromeManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../manifest-chrome.json'), 'utf8')
    );
    const firefoxManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../manifest-firefox.json'), 'utf8')
    );

    const chromeCsp = chromeManifest.content_security_policy.extension_pages;
    const firefoxCsp = firefoxManifest.content_security_policy;

    expect(chromeCsp).toContain("script-src 'self'");
    expect(chromeCsp).toContain("object-src 'none'");
    expect(chromeCsp).not.toContain("'unsafe-inline'");
    expect(chromeCsp).not.toContain("'unsafe-eval'");

    expect(firefoxCsp).toContain("script-src 'self'");
    expect(firefoxCsp).toContain("object-src 'none'");
    expect(firefoxCsp).not.toContain("'unsafe-inline'");
    expect(firefoxCsp).not.toContain("'unsafe-eval'");
  });

  test('service worker contains no machine-specific absolute paths', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/background/service_worker.js'),
      'utf8'
    );

    expect(source).not.toMatch(/\/Users\//);
    expect(source).not.toMatch(/[A-Z]:\\\\/);
  });

  test('native messaging permissions are explicitly declared', () => {
    const chromeManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../manifest-chrome.json'), 'utf8')
    );
    const firefoxManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../manifest-firefox.json'), 'utf8')
    );

    expect(chromeManifest.permissions).toContain('nativeMessaging');
    expect(firefoxManifest.permissions).toContain('nativeMessaging');
  });
});
