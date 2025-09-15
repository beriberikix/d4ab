# Data Model: Hardware Access Bridge

## Core Entities

### Device
**Purpose**: Represents a physical hardware device connected via USB, Serial, or Bluetooth

**Fields**:
- `id: string` - Unique device identifier (vendor:product:serial or MAC address)
- `type: 'usb' | 'serial' | 'bluetooth'` - Device connection type
- `name: string` - Human-readable device name
- `vendorId: number` - Hardware vendor identifier
- `productId: number` - Hardware product identifier
- `serialNumber?: string` - Device serial number (if available)
- `status: 'connected' | 'disconnected' | 'busy' | 'error'` - Current device state
- `capabilities: string[]` - Supported operations (read, write, control)
- `lastSeen: Date` - Last successful communication timestamp

**Validation Rules**:
- ID must be unique across all device types
- VendorId and ProductId must be positive integers
- Status transitions: connected ↔ disconnected, connected → busy → connected, any → error
- Capabilities must be non-empty array

**State Transitions**:
```
disconnected → connected (device plugged in)
connected → busy (operation in progress)
busy → connected (operation completed)
connected → disconnected (device unplugged)
any → error (communication failure)
error → connected (error resolved)
```

### Permission
**Purpose**: User-granted authorization for specific webpage-device access pairs

**Fields**:
- `origin: string` - Webpage origin (e.g., 'https://example.com')
- `deviceId: string` - Target device identifier
- `permissions: string[]` - Granted capabilities ('read', 'write', 'control')
- `grantedAt: Date` - Permission grant timestamp
- `expiresAt: Date` - Permission expiration (24 hours from grant)
- `persistent: boolean` - Whether permission survives browser restart

**Validation Rules**:
- Origin must be valid HTTPS URL (except localhost)
- DeviceId must reference existing device
- Permissions must be subset of device capabilities
- ExpiresAt must be exactly 24 hours from grantedAt
- Persistent permissions only for explicitly trusted origins

**Relationships**:
- Many-to-many with Device (one origin can access multiple devices, one device can be accessed by multiple origins)

### BridgeSession
**Purpose**: Active communication channel between webpage and device through native bridge

**Fields**:
- `sessionId: string` - Unique session identifier (UUID)
- `origin: string` - Requesting webpage origin
- `deviceId: string` - Target device identifier
- `startedAt: Date` - Session start timestamp
- `lastActivity: Date` - Last communication timestamp
- `status: 'active' | 'idle' | 'closed' | 'error'` - Session state
- `messageCount: number` - Total messages exchanged
- `bytesSent: number` - Total bytes sent to device
- `bytesReceived: number` - Total bytes received from device

**Validation Rules**:
- SessionId must be globally unique UUID
- Origin must have valid permission for deviceId
- LastActivity updated on every message exchange
- Idle timeout after 5 minutes of inactivity
- Auto-close when browser tab closes

**State Transitions**:
```
active → idle (no activity for 5 minutes)
idle → active (new message received)
active/idle → closed (explicit close or tab close)
any → error (communication failure)
```

### APIRequest
**Purpose**: Standardized command from webpage to device following Web API specifications

**Fields**:
- `requestId: string` - Unique request identifier
- `sessionId: string` - Associated bridge session
- `method: string` - API method name (enumerate, connect, read, write, disconnect)
- `parameters: object` - Method-specific parameters
- `timestamp: Date` - Request creation time
- `status: 'pending' | 'processing' | 'completed' | 'failed'` - Request state
- `response?: object` - Method response data
- `error?: string` - Error message if failed

**Validation Rules**:
- RequestId must be unique within session
- Method must be valid Web API method name
- Parameters must match method signature
- Timeout after 30 seconds for device operations
- Response required for completed status

**Method Signatures**:
```javascript
enumerate() → Device[]
connect(deviceId: string) → BridgeSession
read(length: number, timeout?: number) → ArrayBuffer
write(data: ArrayBuffer) → number
disconnect() → boolean
```

### SecurityContext
**Purpose**: Encrypted communication channel between browser extension and native bridge

**Fields**:
- `contextId: string` - Unique context identifier
- `extensionId: string` - Browser extension identifier
- `processId: number` - Native bridge process ID
- `establishedAt: Date` - Context creation timestamp
- `lastHeartbeat: Date` - Last health check timestamp
- `encryptionKey?: string` - Session encryption key (if enabled)
- `messagesSent: number` - Total messages sent
- `messagesReceived: number` - Total messages received

**Validation Rules**:
- ContextId must be unique per browser instance
- ExtensionId must match registered extension
- ProcessId must be valid system process
- Heartbeat required every 60 seconds
- Encryption key rotated every 24 hours

**Security Properties**:
- All messages authenticated with HMAC
- Optional AES-256 encryption for sensitive data
- Process isolation between different browser instances
- Audit trail for all security events

## Entity Relationships

```
Permission 1:N→ Device (one permission per device per origin)
BridgeSession N:1→ Device (multiple sessions can target same device)
BridgeSession 1:1→ Permission (session requires valid permission)
APIRequest N:1→ BridgeSession (requests belong to single session)
SecurityContext 1:N→ BridgeSession (context manages multiple sessions)
```

## Storage Strategy

**Browser Extension**:
- Permissions: chrome.storage.local (persistent across restarts)
- Active sessions: Memory only (cleared on restart)
- Device cache: chrome.storage.session (tab-scoped)

**Native Bridge**:
- No persistent storage (stateless design)
- Device enumeration cached in memory (5s TTL)
- Session state maintained in process memory only

## Data Flow

1. **Device Discovery**: Native bridge enumerates devices → caches in memory → sends to extension
2. **Permission Grant**: User approves access → extension stores permission → notifies native bridge
3. **Session Creation**: Webpage requests device → extension validates permission → creates bridge session
4. **Data Exchange**: API requests flow through session → validated → forwarded to device → response returned
5. **Cleanup**: Session closed → device released → resources freed → audit logged

---

**Data Model Status**: ✅ Complete - All entities defined with validation rules and relationships