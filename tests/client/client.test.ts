import { describe, expect, test, jest } from "@jest/globals";
import { JSRFClient } from "../../src/client";
import { Service } from "../../src/types";
import { WebSocket } from "ws";

jest.mock("ws", () => {
  const mockSend = jest.fn();
  const mockWebSocket = jest.fn().mockImplementation(function () {
    const instance = {
      onopen: null as ((event?: any) => void) | null,
      onmessage: null as ((event?: any) => void) | null,
      onclose: null as ((event?: any) => void) | null,
      onerror: null as ((event?: any) => void) | null,
      readyState: 1, // OPEN
      OPEN: 1,
      send: mockSend,
      close: jest.fn(),
      addEventListener: jest.fn().mockImplementation((event, callback) => {
        if (event === "open")
          instance.onopen = callback as (event?: any) => void;
        if (event === "message")
          instance.onmessage = callback as (event?: any) => void;
        if (event === "close")
          instance.onclose = callback as (event?: any) => void;
        if (event === "error")
          instance.onerror = callback as (event?: any) => void;
      }),
      removeEventListener: jest.fn(),
    };
    // Simulate immediate open event for Node.js style WebSocket
    setTimeout(() => {
      if (instance.onopen) instance.onopen();
    }, 0);
    return instance;
  });
  return mockWebSocket;
});

describe("JSRFClient", () => {
  let client: JSRFClient;
  let mockWs: jest.Mocked<any>;

  beforeEach(() => {
    mockWs = require("ws") as jest.Mocked<any>;
    // Ensure mockWs.OPEN is defined to match the expected value
    mockWs.OPEN = 1;
    client = new JSRFClient("ws://localhost:8080");
    // Reset mock functions will be done in individual tests after connect
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should establish connection to server", async () => {
    // Arrange
    const connectPromise = client.connect();
    await connectPromise; // Wait for connection to be established
    // Reset the send mock for this test
    mockWs.mock.results[0].value.send.mockReset();

    // Assert
    await expect(connectPromise).resolves.toBeUndefined();
  }, 10000);

  test("should fail to connect due to error", async () => {
    // Arrange
    // Use an invalid WebSocket URL to simulate connection failure
    const invalidClient = new JSRFClient("ws://invalid-url:9999");
    // Mock the WebSocket to simulate a connection error
    mockWs.mockImplementation(function () {
      const instance = {
        onopen: null as ((event?: any) => void) | null,
        onmessage: null as ((event?: any) => void) | null,
        onclose: null as ((event?: any) => void) | null,
        onerror: null as ((event?: any) => void) | null,
        readyState: 3, // CLOSED
        OPEN: 1,
        send: jest.fn(),
        close: jest.fn(),
        addEventListener: jest.fn().mockImplementation((event, callback) => {
          if (event === "open")
            instance.onopen = callback as (event?: any) => void;
          if (event === "message")
            instance.onmessage = callback as (event?: any) => void;
          if (event === "close")
            instance.onclose = callback as (event?: any) => void;
          if (event === "error")
            instance.onerror = callback as (event?: any) => void;
        }),
        removeEventListener: jest.fn(),
      };
      // Simulate immediate error event
      setTimeout(() => {
        if (instance.onerror) instance.onerror(new Error("Connection failed"));
      }, 0);
      return instance;
    });
    const connectPromise = invalidClient.connect();
    // Reset the send mock for this test
    mockWs.mock.results[0].value.send.mockReset();

    // Assert
    await expect(connectPromise).rejects.toThrow();
  }, 5000);

  test("should register a service and request channel when connected", async () => {
    // Arrange
    await client.connect();
    // Reset the send mock for this test
    mockWs.mock.results[0].value.send.mockReset();
    const service: Service = {
      id: "test-service",
      type: 1, // ServiceType.RemoteCall
      handler: jest
        .fn()
        .mockImplementation(async () => Promise.resolve(undefined)) as any,
    };

    // Act
    client.registerService(service);

    // Assert
    expect(mockWs.mock.results[0].value.send).toHaveBeenCalled();
  }, 10000);

  test("should invoke remote function and handle response", async () => {
    // Arrange
    await client.connect();
    // Reset the send mock for this test
    mockWs.mock.results[0].value.send.mockReset();
    const service: Service = {
      id: "test-service",
      type: 1, // ServiceType.RemoteCall
      handler: jest
        .fn()
        .mockImplementation(async () => Promise.resolve(undefined)) as any,
      channelId: 1, // Assigned channel ID
    };
    client.registerService(service);
    // Simulate channel assignment response from server
    const channelResponseBuffer = Buffer.from(
      JSON.stringify({
        serviceId: service.id,
        channelId: 1,
      })
    );
    const channelHeaderBuffer = Buffer.alloc(8);
    channelHeaderBuffer.writeUInt8(0, 0); // hasAck: False
    channelHeaderBuffer.writeUInt8(11, 1); // opcode: ControlOpcode.OpenChannel
    channelHeaderBuffer.writeUInt16BE(0, 2); // channel: 0 (will be updated to 1 in response)
    channelHeaderBuffer.writeUInt32BE(1, 4); // seq: 1
    const channelPacketBuffer = Buffer.concat([
      channelHeaderBuffer,
      channelResponseBuffer,
    ]);
    if (mockWs.onmessage) {
      mockWs.onmessage({ data: channelPacketBuffer });
    }
    const args = { method: "testMethod", params: [1, 2, 3] };
    const mockResponse = { result: "success" };
    const responseBuffer = Buffer.from(
      JSON.stringify({
        callId: 0,
        value: mockResponse.result,
      })
    );
    // Simulate response packet
    const headerBuffer = Buffer.alloc(8);
    headerBuffer.writeUInt8(0, 0); // hasAck: False
    headerBuffer.writeUInt8(41, 1); // opcode: RemoteCallOpcode.Return
    headerBuffer.writeUInt16BE(1, 2); // channel: 1
    headerBuffer.writeUInt32BE(2, 4); // seq: 2
    const packetBuffer = Buffer.concat([headerBuffer, responseBuffer]);

    // Act
    const invokePromise = client.invokeRemote(service.id, args);
    if (mockWs.onmessage) {
      mockWs.onmessage({ data: packetBuffer });
    }

    // Assert
    await expect(invokePromise).resolves.toBe(mockResponse.result);
    expect(mockWs.mock.results[0].value.send).toHaveBeenCalledTimes(2); // Once for channel request, once for remote call
  }, 20000);

  test("should handle data transmission for various payload sizes", async () => {
    // Arrange
    await client.connect();
    // Reset the send mock for this test
    mockWs.mock.results[0].value.send.mockReset();
    const service: Service = {
      id: "test-service",
      type: 1, // ServiceType.RemoteCall
      handler: jest
        .fn()
        .mockImplementation(async () => Promise.resolve(undefined)) as any,
      channelId: 1, // Assigned channel ID
    };
    client.registerService(service);
    // Simulate channel assignment response from server
    const channelResponseBuffer = Buffer.from(
      JSON.stringify({
        serviceId: service.id,
        channelId: 1,
      })
    );
    const channelHeaderBuffer = Buffer.alloc(8);
    channelHeaderBuffer.writeUInt8(0, 0); // hasAck: False
    channelHeaderBuffer.writeUInt8(11, 1); // opcode: ControlOpcode.OpenChannel
    channelHeaderBuffer.writeUInt16BE(0, 2); // channel: 0 (will be updated to 1 in response)
    channelHeaderBuffer.writeUInt32BE(1, 4); // seq: 1
    const channelPacketBuffer = Buffer.concat([
      channelHeaderBuffer,
      channelResponseBuffer,
    ]);
    if (mockWs.onmessage) {
      mockWs.onmessage({ data: channelPacketBuffer });
    }
    const smallPayload = { data: "small" };
    const largePayload = { data: new Array(1000).fill("large").join("") };

    // Act
    const smallInvokePromise = client.invokeRemote(service.id, smallPayload);
    const largeInvokePromise = client.invokeRemote(service.id, largePayload);
    // Simulate responses (simplified for this test)
    if (mockWs.onmessage) {
      const smallResponse = Buffer.from(
        JSON.stringify({
          callId: 0,
          value: "small response",
        })
      );
      const largeResponse = Buffer.from(
        JSON.stringify({
          callId: 1,
          value: "large response",
        })
      );
      const headerBufferSmall = Buffer.alloc(8);
      headerBufferSmall.writeUInt8(0, 0); // hasAck: False
      headerBufferSmall.writeUInt8(41, 1); // opcode: RemoteCallOpcode.Return
      headerBufferSmall.writeUInt16BE(1, 2); // channel: 1
      headerBufferSmall.writeUInt32BE(2, 4); // seq: 2
      const headerBufferLarge = Buffer.alloc(8);
      headerBufferLarge.writeUInt8(0, 0); // hasAck: False
      headerBufferLarge.writeUInt8(41, 1); // opcode: RemoteCallOpcode.Return
      headerBufferLarge.writeUInt16BE(1, 2); // channel: 1
      headerBufferLarge.writeUInt32BE(3, 4); // seq: 3
      mockWs.onmessage({
        data: Buffer.concat([headerBufferSmall, smallResponse]),
      });
      mockWs.onmessage({
        data: Buffer.concat([headerBufferLarge, largeResponse]),
      });
    }

    // Assert
    await expect(smallInvokePromise).resolves.toBe("small response");
    await expect(largeInvokePromise).resolves.toBe("large response");
    expect(mockWs.mock.results[0].value.send).toHaveBeenCalledTimes(3); // Once for channel request, twice for remote calls
  }, 20000);

  // Tests for JSON Synchronization
  describe("JSON Synchronization", () => {
    beforeEach(async () => {
      await client.connect();
      // Wait a bit for connection to be fully established
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Reset the send mock for this test
      mockWs.mock.results[0].value.send.mockReset();
      const service: Service = {
        id: "sync-service",
        type: 0, // ServiceType.JsonSync
        handler: jest
          .fn()
          .mockImplementation(async () => Promise.resolve(undefined)) as any,
        channelId: 2, // Assigned channel ID for sync
      };
      client.registerService(service);
      // Simulate channel assignment response from server
      const channelResponseBuffer = Buffer.from(
        JSON.stringify({
          serviceId: service.id,
          channelId: 2,
        })
      );
      const channelHeaderBuffer = Buffer.alloc(8);
      channelHeaderBuffer.writeUInt8(0, 0); // hasAck: False
      channelHeaderBuffer.writeUInt8(11, 1); // opcode: ControlOpcode.OpenChannel
      channelHeaderBuffer.writeUInt16BE(0, 2); // channel: 0 (will be updated to 2 in response)
      channelHeaderBuffer.writeUInt32BE(1, 4); // seq: 1
      const channelPacketBuffer = Buffer.concat([
        channelHeaderBuffer,
        channelResponseBuffer,
      ]);
      if (mockWs.onmessage) {
        mockWs.onmessage({ data: channelPacketBuffer });
      }
    });

    test("should start synchronization", async () => {
      // Act
      client.startSync("sync-service");

      // Simulate server response for Start command
      const headerBuffer = Buffer.alloc(8);
      headerBuffer.writeUInt8(0, 0); // hasAck: False
      headerBuffer.writeUInt8(64, 1); // opcode: JsonSyncOpcode.Start
      headerBuffer.writeUInt16BE(2, 2); // channel: 2
      headerBuffer.writeUInt32BE(2, 4); // seq: 2
      if (mockWs.onmessage) {
        mockWs.onmessage({ data: headerBuffer });
      }

      // Assert
      expect(mockWs.mock.results[0].value.send).toHaveBeenCalled();
    }, 10000);

    test("should get synchronization state", async () => {
      // Arrange
      client.startSync("sync-service");
      // Simulate server response for Start command
      const headerBuffer = Buffer.alloc(8);
      headerBuffer.writeUInt8(0, 0); // hasAck: False
      headerBuffer.writeUInt8(64, 1); // opcode: JsonSyncOpcode.Start
      headerBuffer.writeUInt16BE(2, 2); // channel: 2
      headerBuffer.writeUInt32BE(2, 4); // seq: 2
      if (mockWs.onmessage) {
        mockWs.onmessage({ data: headerBuffer });
      }

      // Act
      const syncState = client.getSyncState("sync-service");

      // Assert
      expect(syncState).toBeDefined();
    }, 5000);

    // TODO: Add tests for stopSync, getSyncValue, setSyncValue, deleteSyncValue once implemented in JSRFClient
  });
});
