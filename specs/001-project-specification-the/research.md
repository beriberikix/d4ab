# Research: Hardware Access Bridge

## Browser Extension Development

**Decision**: Manifest V3 with Native Messaging API
**Rationale**:
- Manifest V3 is required for modern browsers (Chrome 88+, Firefox 109+)
- Native Messaging API provides secure, permission-based communication channel
- Service workers replace background pages for better performance
- Content Security Policy compliance ensures security

**Alternatives considered**:
- WebSocket communication (rejected: requires server, complicates deployment)
- Shared memory (rejected: not supported in browsers)
- File-based communication (rejected: security concerns, platform differences)

## Node.js Hardware Libraries

**Decision**: node-usb v2.11+, @serialport/bindings-cpp v12+, @abandonware/noble for Bluetooth
**Rationale**:
- node-usb: Active maintenance, supports USB 3.0+, cross-platform libusb bindings
- @serialport/bindings-cpp: Native C++ bindings, high performance, supports all platforms
- @abandonware/noble: Community-maintained Bluetooth LE, works on all platforms

**Alternatives considered**:
- usb v1.x (rejected: deprecated, no USB 3.0 support)
- node-serialport v9 (rejected: older API, performance issues)
- bleno for Bluetooth (rejected: peripheral only, we need central)

## Cross-Platform Deployment

**Decision**: pkg for Node.js bundling + platform-specific installers (NSIS for Windows, DMG for macOS, AppImage for Linux)
**Rationale**:
- pkg creates single executable with embedded Node.js runtime
- Platform-specific installers handle Native Messaging manifest registration
- Follows each platform's standard installation patterns

**Alternatives considered**:
- Electron (rejected: unnecessary overhead for CLI app)
- Docker (rejected: complicates hardware access permissions)
- Universal installer (rejected: platform registration differences too complex)

## Native Messaging Protocol

**Decision**: JSON-RPC 2.0 over Native Messaging stdin/stdout
**Rationale**:
- JSON-RPC provides standardized request/response pattern
- Native Messaging enforces secure communication channel
- Async request handling prevents blocking browser

**Alternatives considered**:
- Plain JSON messages (rejected: no standard error handling)
- Protocol Buffers (rejected: adds complexity, JSON sufficient for bandwidth)
- Custom binary protocol (rejected: debugging difficulty, unnecessary complexity)

## Testing Strategy

**Decision**: web-ext for extension testing, Jest for Node.js, Playwright for E2E integration tests
**Rationale**:
- web-ext official Mozilla tool, cross-browser testing support
- Jest provides mocking for hardware dependencies in unit tests
- Playwright enables actual browser automation for E2E scenarios

**Alternatives considered**:
- Selenium (rejected: more complex setup, slower execution)
- Puppeteer (rejected: Chrome-only, need cross-browser testing)
- Manual testing only (rejected: violates TDD constitution requirement)

## Performance Optimization

**Decision**: Device enumeration caching (5s TTL), connection pooling (max 10 per tab), lazy loading of hardware modules
**Rationale**:
- Enumeration caching reduces hardware polling overhead
- Connection limits prevent resource exhaustion
- Lazy module loading reduces startup time and memory usage

**Alternatives considered**:
- No caching (rejected: excessive hardware polling)
- Unlimited connections (rejected: violates FR-017 requirement)
- Preload all modules (rejected: unnecessary memory usage)

## Security Measures

**Decision**: Content Security Policy strict mode, input validation on all device commands, permission scoping per origin
**Rationale**:
- CSP prevents XSS attacks in extension
- Command validation prevents malicious device access
- Origin-based permissions follow browser security model

**Alternatives considered**:
- Relaxed CSP (rejected: security vulnerability)
- Trust webpage input (rejected: enables device attacks)
- Global permissions (rejected: violates principle of least privilege)

---

**Research Status**: ✅ Complete - All technical decisions made with documented rationale