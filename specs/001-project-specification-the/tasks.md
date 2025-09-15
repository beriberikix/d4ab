# Tasks: Hardware Access Bridge

**Input**: Design documents from `/Users/jberi/code/d4ab/specs/001-project-specification-the/`
**Prerequisites**: plan.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓)

## Execution Flow (main)
```
1. Load plan.md from feature directory ✓
   → Extract: JavaScript/Node.js, web extension + native app structure
2. Load optional design documents ✓:
   → data-model.md: 5 entities (Device, Permission, BridgeSession, APIRequest, SecurityContext)
   → contracts/: 2 files (native-messaging-api.json, web-api-polyfill.json)
   → research.md: Tech stack decisions, libraries
3. Generate tasks by category ✓:
   → Setup: browser extension + native bridge projects, dependencies
   → Tests: contract tests for 6 JSON-RPC methods, integration tests for 3 user scenarios
   → Core: data models, hardware libraries, polyfill APIs, native messaging
   → Integration: extension-bridge communication, cross-browser compatibility
   → Polish: performance tests, documentation, installer
4. Apply task rules ✓:
   → Different files = mark [P] for parallel execution
   → Tests before implementation (TDD enforced)
5. Number tasks sequentially (T001-T035) ✓
6. Generate dependency graph ✓
7. Create parallel execution examples ✓
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Web app structure**: `frontend/` (browser extension), `backend/` (native bridge)
- Extension files: `frontend/src/`, `frontend/tests/`
- Native bridge: `backend/src/`, `backend/tests/`

## Phase 3.1: Setup
- [x] T001 Create web application project structure (frontend/ for extension, backend/ for native bridge)
- [x] T002 Initialize browser extension project with Manifest V3 in frontend/
- [x] T003 Initialize Node.js native bridge project with hardware dependencies in backend/
- [x] T004 [P] Configure ESLint and Prettier for extension in frontend/.eslintrc.js
- [x] T005 [P] Configure Jest for native bridge testing in backend/jest.config.js
- [x] T006 [P] Set up web-ext configuration in frontend/web-ext-config.js

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests (Native Messaging API)
- [x] T007 [P] Contract test enumerate method in backend/tests/contract/test_enumerate.js
- [x] T008 [P] Contract test connect method in backend/tests/contract/test_connect.js
- [x] T009 [P] Contract test read method in backend/tests/contract/test_read.js
- [x] T010 [P] Contract test write method in backend/tests/contract/test_write.js
- [x] T011 [P] Contract test disconnect method in backend/tests/contract/test_disconnect.js
- [x] T012 [P] Contract test heartbeat method in backend/tests/contract/test_heartbeat.js

### Web API Polyfill Tests
- [x] T013 [P] Contract test USB API polyfill in frontend/tests/contract/test_usb_polyfill.js
- [x] T014 [P] Contract test Serial API polyfill in frontend/tests/contract/test_serial_polyfill.js
- [x] T015 [P] Contract test Bluetooth API polyfill in frontend/tests/contract/test_bluetooth_polyfill.js

### Integration Tests (User Scenarios)
- [x] T016 [P] Integration test Arduino LED control in frontend/tests/integration/test_arduino_scenario.js
- [x] T017 [P] Integration test Serial GPS reading in frontend/tests/integration/test_serial_gps_scenario.js
- [x] T018 [P] Integration test Bluetooth heart rate in frontend/tests/integration/test_bluetooth_hr_scenario.js

### Performance Tests
- [x] T019 [P] Performance test device enumeration <5s in backend/tests/performance/test_enumeration.js
- [x] T020 [P] Performance test memory usage <100MB in frontend/tests/performance/test_memory.js

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Data Models
- [ ] T021 [P] Device model in backend/src/models/device.js
- [ ] T022 [P] Permission model in frontend/src/models/permission.js
- [ ] T023 [P] BridgeSession model in backend/src/models/bridge_session.js
- [ ] T024 [P] APIRequest model in backend/src/models/api_request.js
- [ ] T025 [P] SecurityContext model in frontend/src/models/security_context.js

### Hardware Libraries
- [ ] T026 [P] USB library wrapper in backend/src/lib/usb_lib.js
- [ ] T027 [P] Serial port library wrapper in backend/src/lib/serial_lib.js
- [ ] T028 [P] Bluetooth library wrapper in backend/src/lib/bluetooth_lib.js

### Core Services
- [ ] T029 Native bridge CLI entry point in backend/src/bridge_cli.js
- [ ] T030 JSON-RPC message handler in backend/src/services/message_handler.js
- [ ] T031 Extension background service worker in frontend/src/background/service_worker.js
- [ ] T032 Web API polyfill injection in frontend/src/content/polyfill_injector.js

## Phase 3.4: Integration
- [ ] T033 Native Messaging communication channel in frontend/src/services/native_messaging.js
- [ ] T034 Cross-browser compatibility layer in frontend/src/services/browser_adapter.js
- [ ] T035 Extension manifest V3 configuration in frontend/manifest.json
- [ ] T036 Device permission management in frontend/src/services/permission_manager.js
- [ ] T037 Error handling and logging in backend/src/services/error_handler.js

## Phase 3.5: Polish
- [ ] T038 [P] Unit tests for device validation in backend/tests/unit/test_device_validation.js
- [ ] T039 [P] Unit tests for permission logic in frontend/tests/unit/test_permission_logic.js
- [ ] T040 [P] Cross-browser E2E tests with Playwright in frontend/tests/e2e/test_cross_browser.js
- [ ] T041 [P] Security audit tests in frontend/tests/security/test_csp_compliance.js
- [ ] T042 [P] Update extension documentation in frontend/docs/extension_api.md
- [ ] T043 [P] Update native bridge documentation in backend/docs/native_bridge.md
- [ ] T044 Cross-platform installer script in installer/build_installer.js
- [ ] T045 Execute quickstart validation scenarios

## Dependencies
- **Setup** (T001-T006) before all other phases
- **Tests** (T007-T020) before **Core Implementation** (T021-T032)
- **Models** (T021-T025) before **Services** (T029-T032)
- **Hardware Libraries** (T026-T028) before **Native Bridge CLI** (T029)
- **Core Implementation** before **Integration** (T033-T037)
- **Everything** before **Polish** (T038-T045)

### Specific Dependencies
- T021-T025 (models) block T029-T032 (services using models)
- T026-T028 (hardware libs) block T029 (CLI using libs)
- T031 (service worker) blocks T033 (native messaging)
- T035 (manifest) blocks T036 (permission manager)

## Parallel Execution Examples

### Contract Tests Phase (can run simultaneously):
```bash
# Launch T007-T012 together:
Task: "Contract test enumerate method in backend/tests/contract/test_enumerate.js"
Task: "Contract test connect method in backend/tests/contract/test_connect.js"
Task: "Contract test read method in backend/tests/contract/test_read.js"
Task: "Contract test write method in backend/tests/contract/test_write.js"
Task: "Contract test disconnect method in backend/tests/contract/test_disconnect.js"
Task: "Contract test heartbeat method in backend/tests/contract/test_heartbeat.js"
```

### Web API Tests Phase (can run simultaneously):
```bash
# Launch T013-T015 together:
Task: "Contract test USB API polyfill in frontend/tests/contract/test_usb_polyfill.js"
Task: "Contract test Serial API polyfill in frontend/tests/contract/test_serial_polyfill.js"
Task: "Contract test Bluetooth API polyfill in frontend/tests/contract/test_bluetooth_polyfill.js"
```

### Data Models Phase (can run simultaneously):
```bash
# Launch T021-T025 together:
Task: "Device model in backend/src/models/device.js"
Task: "Permission model in frontend/src/models/permission.js"
Task: "BridgeSession model in backend/src/models/bridge_session.js"
Task: "APIRequest model in backend/src/models/api_request.js"
Task: "SecurityContext model in frontend/src/models/security_context.js"
```

### Hardware Libraries Phase (can run simultaneously):
```bash
# Launch T026-T028 together:
Task: "USB library wrapper in backend/src/lib/usb_lib.js"
Task: "Serial port library wrapper in backend/src/lib/serial_lib.js"
Task: "Bluetooth library wrapper in backend/src/lib/bluetooth_lib.js"
```

## Constitutional Requirements Met
- ✅ **TDD Enforced**: Tests (T007-T020) must be written first and must fail
- ✅ **Library-First**: Each hardware type gets dedicated library (T026-T028)
- ✅ **CLI Interface**: Native bridge has CLI entry point (T029)
- ✅ **Cross-Browser**: Compatibility testing included (T034, T040)
- ✅ **Performance**: <5s enumeration, <100MB memory tests (T019-T020)
- ✅ **Security**: CSP compliance and audit tests (T041)

## Validation Checklist
- [x] All contracts have corresponding tests (T007-T015)
- [x] All entities have model tasks (T021-T025)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks truly independent (different files, no shared state)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Hardware access follows constitution (library-first, CLI, testing)

## Execution Status
✅ **Tasks Generated**: 45 numbered tasks with TDD ordering
✅ **Dependencies Mapped**: Clear blocking relationships defined
✅ **Parallel Execution**: 20 tasks marked [P] for concurrent execution
✅ **Constitutional Compliance**: All principles enforced in task structure

---
**Ready for implementation execution following TDD Red-Green-Refactor cycle**