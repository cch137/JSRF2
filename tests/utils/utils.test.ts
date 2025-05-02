import { describe, expect, test } from "@jest/globals";
import {
  encodeHeader,
  decodeHeader,
  encodePayload,
  decodePayload,
  constructPacket,
  parsePacket,
} from "../../src/utils";
import { HasAck, PacketHeader, PayloadContent } from "../../src/types";
import * as cbor from "cbor";

describe("Utils Module", () => {
  test("should encode and decode packet headers correctly", () => {
    // Test header without ACK
    const headerWithoutAck: PacketHeader = {
      hasAck: HasAck.False,
      opcode: 10, // ControlOpcode.DigChannel
      channel: 1,
      seq: 100,
    };
    const encodedWithoutAck = encodeHeader(headerWithoutAck);
    expect(encodedWithoutAck.length).toBe(7);
    expect(encodedWithoutAck.readUInt8(0)).toBe(10); // hasAck bit 0, opcode 10
    expect(encodedWithoutAck.readUInt16BE(1)).toBe(1); // channel
    expect(encodedWithoutAck.readUInt32BE(3) & 0xffffff).toBe(100); // seq

    const decodedWithoutAck = decodeHeader(encodedWithoutAck);
    expect(decodedWithoutAck.hasAck).toBe(HasAck.False);
    expect(decodedWithoutAck.opcode).toBe(10);
    expect(decodedWithoutAck.channel).toBe(1);
    expect(decodedWithoutAck.seq).toBe(100);
    expect(decodedWithoutAck.ack).toBeUndefined();

    // Test header with ACK
    const headerWithAck: PacketHeader = {
      hasAck: HasAck.True,
      opcode: 11, // ControlOpcode.OpenChannel
      channel: 2,
      seq: 200,
      ack: 150,
    };
    const encodedWithAck = encodeHeader(headerWithAck);
    expect(encodedWithAck.length).toBe(11);
    expect(encodedWithAck.readUInt8(0)).toBe(139); // hasAck bit 1 (128) + opcode 11
    expect(encodedWithAck.readUInt16BE(1)).toBe(2); // channel
    expect(encodedWithAck.readUInt32BE(3) & 0xffffff).toBe(200); // seq
    expect(encodedWithAck.readUInt32BE(7) & 0xffffff).toBe(150); // ack

    const decodedWithAck = decodeHeader(encodedWithAck);
    expect(decodedWithAck.hasAck).toBe(HasAck.True);
    expect(decodedWithAck.opcode).toBe(11);
    expect(decodedWithAck.channel).toBe(2);
    expect(decodedWithAck.seq).toBe(200);
    expect(decodedWithAck.ack).toBe(150);
  });

  test("should encode and decode payload content using CBOR", () => {
    // Test simple payload content
    const simplePayload: PayloadContent = {
      serviceId: "test-service",
      serviceType: 1,
    };
    const encodedSimple = encodePayload(simplePayload);
    const decodedSimple = decodePayload(encodedSimple);
    expect(decodedSimple.serviceId).toBe("test-service");
    expect(decodedSimple.serviceType).toBe(1);

    // Test complex payload content with nested data
    const complexPayload: PayloadContent = {
      callId: 1,
      data: {
        method: "testMethod",
        params: [1, 2, 3, { key: "value" }],
      },
    };
    const encodedComplex = encodePayload(complexPayload);
    const decodedComplex = decodePayload(encodedComplex);
    expect(decodedComplex.callId).toBe(1);
    expect(decodedComplex.data).toEqual({
      method: "testMethod",
      params: [1, 2, 3, { key: "value" }],
    });

    // Test payload with array and object paths for JSON sync
    const syncPayload: PayloadContent = {
      path: ["key1", 0, { id: "nested" }],
      value: "updated value",
    };
    const encodedSync = encodePayload(syncPayload);
    const decodedSync = decodePayload(encodedSync);
    expect(decodedSync.path).toEqual(["key1", 0, { id: "nested" }]);
    expect(decodedSync.value).toBe("updated value");
  });

  test("should construct and parse complete packets correctly", () => {
    // Test constructing a packet without ACK
    const headerWithoutAck: PacketHeader = {
      hasAck: HasAck.False,
      opcode: 10, // ControlOpcode.DigChannel
      channel: 1,
      seq: 100,
    };
    const payloadWithoutAck: PayloadContent = {
      serviceId: "test-service",
      serviceType: 1,
    };
    const packetBufferWithoutAck = constructPacket(
      headerWithoutAck,
      payloadWithoutAck
    );
    expect(packetBufferWithoutAck.length).toBeGreaterThan(7); // Header + payload

    const parsedPacketWithoutAck = parsePacket(packetBufferWithoutAck);
    expect(parsedPacketWithoutAck.header.hasAck).toBe(HasAck.False);
    expect(parsedPacketWithoutAck.header.opcode).toBe(10);
    expect(parsedPacketWithoutAck.header.channel).toBe(1);
    expect(parsedPacketWithoutAck.header.seq).toBe(100);
    expect(parsedPacketWithoutAck.header.ack).toBeUndefined();
    const decodedPayloadWithoutAck = decodePayload(
      parsedPacketWithoutAck.payload as Buffer
    );
    expect(decodedPayloadWithoutAck.serviceId).toBe("test-service");
    expect(decodedPayloadWithoutAck.serviceType).toBe(1);

    // Test constructing a packet with ACK
    const headerWithAck: PacketHeader = {
      hasAck: HasAck.True,
      opcode: 11, // ControlOpcode.OpenChannel
      channel: 2,
      seq: 200,
      ack: 150,
    };
    const payloadWithAck: PayloadContent = {
      serviceId: "test-service",
      channelId: 2,
    };
    const packetBufferWithAck = constructPacket(headerWithAck, payloadWithAck);
    expect(packetBufferWithAck.length).toBeGreaterThan(11); // Header with ACK + payload

    const parsedPacketWithAck = parsePacket(packetBufferWithAck);
    expect(parsedPacketWithAck.header.hasAck).toBe(HasAck.True);
    expect(parsedPacketWithAck.header.opcode).toBe(11);
    expect(parsedPacketWithAck.header.channel).toBe(2);
    expect(parsedPacketWithAck.header.seq).toBe(200);
    expect(parsedPacketWithAck.header.ack).toBe(150);
    const decodedPayloadWithAck = decodePayload(
      parsedPacketWithAck.payload as Buffer
    );
    expect(decodedPayloadWithAck.serviceId).toBe("test-service");
    expect(decodedPayloadWithAck.channelId).toBe(2);
  });
});
