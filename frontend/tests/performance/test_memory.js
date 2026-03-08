const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadNativeMessagingClass() {
	const sourcePath = path.join(__dirname, '../../src/services/native_messaging.js');
	const source = fs.readFileSync(sourcePath, 'utf8');

	const transformed = source
		.replace(
			"import { SecurityContext } from '../models/security_context.js';",
			"const SecurityContext = { create: () => ({ recordReceived() {}, recordActivity() {}, toJSON() { return {}; } }) };"
		)
		.replace('export class NativeMessaging', 'class NativeMessaging')
		.concat('\nmodule.exports = { NativeMessaging };\n');

	const sandbox = {
		module: { exports: {} },
		exports: {},
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
		TextEncoder,
		Date,
		Math,
		Map,
		console,
		chrome: {
			runtime: {
				id: 'test-extension-id',
				lastError: null,
				connectNative: () => ({
					onMessage: { addListener: () => {} },
					onDisconnect: { addListener: () => {} },
					postMessage: () => {},
					disconnect: () => {}
				})
			}
		}
	};

	vm.runInNewContext(transformed, sandbox, { filename: 'native_messaging.js' });
	return sandbox.module.exports.NativeMessaging;
}

describe('Performance Test: Native Messaging Guardrails', () => {
	let NativeMessaging;

	beforeAll(() => {
		NativeMessaging = loadNativeMessagingClass();
	});

	test('enforces queue cap to prevent unbounded memory growth', async () => {
		const messaging = new NativeMessaging();
		messaging.maxQueueSize = 1;
		messaging.connect = jest.fn().mockResolvedValue();

		messaging.queueMessage({ method: 'heartbeat' });

		await expect(
			messaging.queueMessage({ method: 'heartbeat' })
		).rejects.toThrow('Message queue is full');

		expect(messaging.connect).toHaveBeenCalled();
	});

	test('enforces in-flight request cap', async () => {
		const messaging = new NativeMessaging();
		messaging.connected = true;
		messaging.port = { postMessage: jest.fn() };
		messaging.maxPendingRequests = 1;

		messaging.pendingRequests.set('existing', { resolve: () => {}, reject: () => {} });

		await expect(
			messaging.sendMessage({ method: 'heartbeat', params: {} })
		).rejects.toThrow('Too many in-flight requests');
	});

	test('rejects oversized payloads before posting to native port', () => {
		const messaging = new NativeMessaging();
		messaging.maxMessageBytes = 64;

		expect(() => {
			messaging.validateMessageSize({
				jsonrpc: '2.0',
				method: 'write',
				params: { data: 'x'.repeat(512) },
				id: 'oversized'
			});
		}).toThrow('Request payload too large');
	});

	test('reports queue and pending sizes in connection stats', () => {
		const messaging = new NativeMessaging();
		messaging.connected = true;
		messaging.messageQueue.push({ message: { method: 'heartbeat' } });
		messaging.pendingRequests.set('req-1', { resolve: () => {}, reject: () => {} });

		const stats = messaging.getConnectionStats();

		expect(stats.connected).toBe(true);
		expect(stats.queuedMessages).toBe(1);
		expect(stats.pendingRequests).toBe(1);
	});
});
