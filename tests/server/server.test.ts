import { describe, expect, test, jest } from "@jest/globals";
import { JSRFServer } from "../../src/server";
import WebSocket from "ws";
import { Service, ControlOpcode } from "../../src/types";
import { constructPacket } from "../../src/utils";

jest.mock("ws", () => {
  const mockWebSocket = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
  }));
  return mockWebSocket;
});

describe("JSRFServer", () => {
  let server: JSRFServer;
  let mockWs: any;

  beforeEach(() => {
    server = new JSRFServer();
    mockWs = new (WebSocket as any)();
    jest.spyOn(mockWs, "on");
    jest.spyOn(mockWs, "send");
    jest.spyOn(mockWs, "close");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should initialize and handle new WebSocket connections", () => {
    // Act
    server.handleConnection(mockWs);

    // Assert
    expect(mockWs.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(mockWs.on).toHaveBeenCalledWith("close", expect.any(Function));
    expect(mockWs.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  test("should register a service", () => {
    // Arrange
    const service: Service = {
      id: "test-service",
      type: 1, // Assuming ServiceType.RemoteCall is 1 based on client code
      handler: jest
        .fn()
        .mockImplementation(async () => Promise.resolve(undefined)) as any,
    };

    // Act
    server.registerService(service);

    // Assert
    // Since there's no direct way to verify internal state without exposing it,
    // we'll assume registration works if no errors are thrown
    expect(() => server.registerService(service)).not.toThrow();
  });

  test("should handle control message to assign channel ID", () => {
    // Arrange
    server.handleConnection(mockWs);
    const serviceId = "test-service";
    const serviceType = 1; // Assuming ServiceType.RemoteCall is 1
    const header = {
      hasAck: 0,
      opcode: ControlOpcode.DigChannel,
      channel: 0,
      seq: 1,
    };
    const payload = { serviceId, serviceType };
    const packetBuffer = constructPacket(header, payload);

    // Act
    const messageCallback = (mockWs.on as jest.Mock).mock.calls.find(
      (call) => call[0] === "message"
    )?.[1] as Function;
    messageCallback(packetBuffer);

    // Assert
    expect(mockWs.send).toHaveBeenCalled();
  });

  test("should handle remote function call and return result", async () => {
    // Arrange
    server.handleConnection(mockWs);
    const service: Service = {
      id: "test-service",
      type: 1, // Assuming ServiceType.RemoteCall is 1
      handler: jest
        .fn()
        .mockImplementation(async (args) =>
          Promise.resolve({ result: "success", args })
        ) as any,
    };
    server.registerService(service);
    // Simulate channel assignment
    const headerDig = {
      hasAck: 0,
      opcode: ControlOpcode.DigChannel,
      channel: 0,
      seq: 1,
    };
    const payloadDig = { serviceId: service.id, serviceType: 1 }; // Assuming ServiceType.RemoteCall is 1
    const packetBufferDig = constructPacket(headerDig, payloadDig);
    const messageCallback = (mockWs.on as jest.Mock).mock.calls.find(
      (call) => call[0] === "message"
    )?.[1] as Function;
    messageCallback(packetBufferDig);
    // Extract channel ID from the response (mocked for simplicity)
    const channelId = 0; // Assuming first channel ID is 0
    const callId = 1;
    const args = { method: "testMethod", params: [1, 2, 3] };
    const headerCall = {
      hasAck: 0,
      opcode: 40, // RemoteCallOpcode.Call
      channel: channelId,
      seq: 2,
    };
    const payloadCall = { callId, data: args };
    const packetBufferCall = constructPacket(headerCall, payloadCall);

    // Act
    messageCallback(packetBufferCall);

    // Assert
    expect(mockWs.send).toHaveBeenCalledTimes(3); // Once for DigChannel response, once for ACK, once for Call response
    expect(service.handler).toHaveBeenCalledWith(args);
  });

  test("should handle data transmission for various payload sizes", async () => {
    // Arrange
    server.handleConnection(mockWs);
    const service: Service = {
      id: "test-service",
      type: 1, // Assuming ServiceType.RemoteCall is 1
      handler: jest
        .fn()
        .mockImplementation(async (args) =>
          Promise.resolve({ result: "success", args })
        ) as any,
    };
    server.registerService(service);
    // Simulate channel assignment
    const headerDig = {
      hasAck: 0,
      opcode: ControlOpcode.DigChannel,
      channel: 0,
      seq: 1,
    };
    const payloadDig = { serviceId: service.id, serviceType: 1 }; // Assuming ServiceType.RemoteCall is 1
    const packetBufferDig = constructPacket(headerDig, payloadDig);
    const messageCallback = (mockWs.on as jest.Mock).mock.calls.find(
      (call) => call[0] === "message"
    )?.[1] as Function;
    messageCallback(packetBufferDig);
    // Extract channel ID from the response (mocked for simplicity)
    const channelId = 0; // Assuming first channel ID is 0
    const smallPayload = { data: "small" };
    const largePayload = { data: new Array(1000).fill("large").join("") };
    const callIdSmall = 1;
    const callIdLarge = 2;
    const headerSmall = {
      hasAck: 0,
      opcode: 40, // RemoteCallOpcode.Call
      channel: channelId,
      seq: 2,
    };
    const payloadSmall = { callId: callIdSmall, data: smallPayload };
    const packetBufferSmall = constructPacket(headerSmall, payloadSmall);
    const headerLarge = {
      hasAck: 0,
      opcode: 40, // RemoteCallOpcode.Call
      channel: channelId,
      seq: 3,
    };
    const payloadLarge = { callId: callIdLarge, data: largePayload };
    const packetBufferLarge = constructPacket(headerLarge, payloadLarge);

    // Act
    messageCallback(packetBufferSmall);
    messageCallback(packetBufferLarge);

    // Assert
    expect(mockWs.send).toHaveBeenCalledTimes(4); // Once for DigChannel, once for ACK, twice for Call responses
    expect(service.handler).toHaveBeenCalledWith(smallPayload);
    expect(service.handler).toHaveBeenCalledWith(largePayload);
  });

  // Tests for JSON Synchronization
  test("should handle JSON synchronization start request", async () => {
    // Arrange
    server.handleConnection(mockWs);
    const service: Service = {
      id: "sync-service",
      type: 0, // ServiceType.JsonSync
      handler: jest
        .fn()
        .mockImplementation(async () => Promise.resolve(undefined)) as any,
    };
    server.registerService(service);
    // Simulate channel assignment
    const headerDig = {
      hasAck: 0,
      opcode: ControlOpcode.DigChannel,
      channel: 0,
      seq: 1,
    };
    const payloadDig = { serviceId: service.id, serviceType: 0 }; // ServiceType.JsonSync
    const packetBufferDig = constructPacket(headerDig, payloadDig);
    const messageCallback = (mockWs.on as jest.Mock).mock.calls.find(
      (call) => call[0] === "message"
    )?.[1] as Function;
    messageCallback(packetBufferDig);
    // Extract channel ID from the response (mocked for simplicity)
    const channelId = 0; // Assuming first channel ID is 0
    const headerStart = {
      hasAck: 0,
      opcode: 64, // JsonSyncOpcode.Start
      channel: channelId,
      seq: 2,
    };
    const payloadStart = {};
    const packetBufferStart = constructPacket(headerStart, payloadStart);

    // Act
    messageCallback(packetBufferStart);

    // Assert
    expect(mockWs.send).toHaveBeenCalledTimes(4); // Once for DigChannel response, once for ACK, twice for Start response or additional ACK
  });
});
