import { describe, expect, test } from "@jest/globals";
import {
  HasAck,
  OpcodeRange,
  ControlOpcode,
  RemoteCallOpcode,
  JsonSyncOpcode,
  ServiceType,
  ClientSyncState,
  PacketHeader,
  Packet,
  PayloadContent,
  Service,
  SyncState,
} from "../../src/types";

describe("Types Module", () => {
  test("should validate enum values for protocol constants", () => {
    // Test enum values to ensure they match expected protocol definitions
    expect(HasAck.False).toBe(0);
    expect(HasAck.True).toBe(1);

    expect(OpcodeRange.Control).toBe(0);
    expect(OpcodeRange.RemoteCall).toBe(32);
    expect(OpcodeRange.JsonSync).toBe(64);

    expect(ControlOpcode.DigChannel).toBe(10);
    expect(ControlOpcode.OpenChannel).toBe(11);
    expect(ControlOpcode.CloseChannel).toBe(12);

    expect(RemoteCallOpcode.Call).toBe(40);
    expect(RemoteCallOpcode.Return).toBe(41);
    expect(RemoteCallOpcode.Error).toBe(42);

    expect(JsonSyncOpcode.Start).toBe(64);
    expect(JsonSyncOpcode.Synced).toBe(66);
    expect(JsonSyncOpcode.Set).toBe(82);

    expect(ServiceType.JsonSync).toBe(0);
    expect(ServiceType.ServerCall).toBe(1);
    expect(ServiceType.ClientCall).toBe(2);

    expect(ClientSyncState.Syncing).toBe("Syncing");
    expect(ClientSyncState.Synced).toBe("Synced");
    expect(ClientSyncState.Error).toBe("Error");
  });

  test("should ensure type safety with interface structures", () => {
    // Test PacketHeader structure
    const header: PacketHeader = {
      hasAck: HasAck.False,
      opcode: ControlOpcode.DigChannel,
      channel: 0,
      seq: 1,
    };
    expect(header.hasAck).toBe(0);
    expect(header.opcode).toBe(10);
    expect(header.channel).toBe(0);
    expect(header.seq).toBe(1);

    // Test Packet structure
    const packet: Packet = {
      header,
      payload: Buffer.from([]),
    };
    expect(packet.header).toBe(header);
    expect(packet.payload).toBeInstanceOf(Buffer);

    // Test PayloadContent structure with different scenarios
    const payloadControl: PayloadContent = {
      serviceId: "test-service",
      serviceType: ServiceType.ServerCall,
    };
    expect(payloadControl.serviceId).toBe("test-service");
    expect(payloadControl.serviceType).toBe(1);

    const payloadCall: PayloadContent = {
      callId: 1,
      data: { method: "testMethod" },
    };
    expect(payloadCall.callId).toBe(1);
    expect(payloadCall.data).toEqual({ method: "testMethod" });

    // Test Service structure
    const service: Service = {
      id: "test-service",
      type: ServiceType.ServerCall,
      channelId: 1,
      handler: async (args) => Promise.resolve({ result: "success", args }),
    };
    expect(service.id).toBe("test-service");
    expect(service.type).toBe(1);
    expect(service.channelId).toBe(1);
    expect(service.handler).toBeInstanceOf(Function);

    // Test SyncState structure
    const syncState: SyncState = {
      state: ClientSyncState.Synced,
      data: { key: "value" },
      lastUpdated: Date.now(),
    };
    expect(syncState.state).toBe("Synced");
    expect(syncState.data).toEqual({ key: "value" });
    expect(syncState.lastUpdated).toBeDefined();
  });

  test("should handle various data structures for protocol correctness", () => {
    // Test different payload content structures for JSON sync
    const payloadSyncSet: PayloadContent = {
      path: ["key1", "key2"],
      value: "new value",
    };
    expect(payloadSyncSet.path).toEqual(["key1", "key2"]);
    expect(payloadSyncSet.value).toBe("new value");

    const payloadSyncPush: PayloadContent = {
      path: ["array"],
      value: [1, 2, 3],
    };
    expect(payloadSyncPush.path).toEqual(["array"]);
    expect(payloadSyncPush.value).toEqual([1, 2, 3]);

    const payloadError: PayloadContent = {
      message: "Sync error occurred",
    };
    expect(payloadError.message).toBe("Sync error occurred");

    // Test SyncState with error state
    const errorSyncState: SyncState = {
      state: ClientSyncState.Error,
      data: null,
      errorMessage: "Failed to sync",
    };
    expect(errorSyncState.state).toBe("Error");
    expect(errorSyncState.data).toBeNull();
    expect(errorSyncState.errorMessage).toBe("Failed to sync");
  });
});
