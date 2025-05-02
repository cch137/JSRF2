// Utility functions for JSRF Protocol
// This module contains common utilities for packet handling and encoding/decoding

import * as cbor from "cbor";
import { Packet, PacketHeader, HasAck, PayloadContent } from "../types";

/**
 * Encodes a JSRF Protocol packet header into a Buffer
 * @param header The packet header to encode
 * @returns Buffer containing the encoded header
 */
export function encodeHeader(header: PacketHeader): Buffer {
  const hasAckBit = header.hasAck === HasAck.True ? 1 : 0;
  const opcode = header.opcode & 0x7f; // Ensure opcode is within 0-127
  const firstByte = (hasAckBit << 7) | opcode;

  const buffer = Buffer.alloc(header.hasAck === HasAck.True ? 11 : 7);
  buffer.writeUInt8(firstByte, 0);
  buffer.writeUInt16BE(header.channel & 0xffff, 1); // Channel ID 0-65535
  buffer.writeUInt32BE(header.seq & 0xffffff, 3); // Sequence number 0-2^24-1

  if (header.hasAck === HasAck.True && header.ack !== undefined) {
    buffer.writeUInt32BE(header.ack & 0xffffff, 7); // ACK number 0-2^24-1
  }

  return buffer;
}

/**
 * Decodes a JSRF Protocol packet header from a Buffer
 * @param buffer The buffer containing the encoded header
 * @returns PacketHeader object
 * @throws Error if the buffer is too short or invalid
 */
export function decodeHeader(buffer: Buffer): PacketHeader {
  if (buffer.length < 7) {
    throw new Error("Buffer too short for JSRF header");
  }

  const firstByte = buffer.readUInt8(0);
  const hasAck = (firstByte >> 7) & 0x1 ? HasAck.True : HasAck.False;
  const opcode = firstByte & 0x7f;
  const channel = buffer.readUInt16BE(1);
  const seq = buffer.readUInt32BE(3) & 0xffffff;

  let ack: number | undefined;
  if (hasAck === HasAck.True) {
    if (buffer.length < 11) {
      throw new Error("Buffer too short for JSRF header with ACK");
    }
    ack = buffer.readUInt32BE(7) & 0xffffff;
  }

  return {
    hasAck,
    opcode,
    channel,
    seq,
    ack,
  };
}

/**
 * Encodes a payload content object into a CBOR-encoded Buffer
 * @param content The payload content to encode
 * @returns Buffer containing the CBOR-encoded payload
 */
export function encodePayload(content: PayloadContent): Buffer {
  return cbor.encode(content);
}

/**
 * Decodes a CBOR-encoded payload Buffer into a PayloadContent object
 * @param payload The Buffer containing the CBOR-encoded payload
 * @returns PayloadContent object
 * @throws Error if decoding fails
 */
export function decodePayload(payload: Buffer): PayloadContent {
  return cbor.decode(payload);
}

/**
 * Constructs a complete JSRF Protocol packet
 * @param header The packet header
 * @param payloadContent The payload content to encode
 * @returns Buffer representing the complete packet
 */
export function constructPacket(
  header: PacketHeader,
  payloadContent: PayloadContent
): Buffer {
  const headerBuffer = encodeHeader(header);
  const payloadBuffer = encodePayload(payloadContent);
  return Buffer.concat([headerBuffer, payloadBuffer]);
}

/**
 * Parses a complete JSRF Protocol packet from a Buffer
 * @param buffer The Buffer containing the complete packet
 * @returns Packet object with header and payload
 * @throws Error if parsing fails
 */
export function parsePacket(buffer: Buffer): Packet {
  const header = decodeHeader(buffer);
  const payloadStart = header.hasAck === HasAck.True ? 11 : 7;
  if (buffer.length < payloadStart) {
    throw new Error("Buffer too short for JSRF packet payload");
  }
  const payload = buffer.slice(payloadStart);
  return {
    header,
    payload,
  };
}
