// Type definitions for JSRF Protocol
// This module contains TypeScript interfaces for packets, services, and other structures

/**
 * Enum for header field indicating if an ACK is present
 */
export enum HasAck {
  False = 0,
  True = 1,
}

/**
 * Opcode ranges for different types of operations in JSRF Protocol
 */
export enum OpcodeRange {
  Control = 0, // 0-31 for control messages
  RemoteCall = 32, // 32-63 for remote function calls
  JsonSync = 64, // 64-127 for JSON synchronization
}

/**
 * Specific opcodes for control messages (0-31)
 */
export enum ControlOpcode {
  Empty = 0,
  DigChannel = 10,
  OpenChannel = 11,
  CloseChannel = 12,
  ErrorChannel = 13,
  Log = 20,
}

/**
 * Specific opcodes for remote function calls (32-63)
 */
export enum RemoteCallOpcode {
  Call = 40,
  Return = 41,
  Error = 42,
}

/**
 * Specific opcodes for JSON synchronization (64-127)
 */
export enum JsonSyncOpcode {
  Start = 64,
  Stop = 65,
  Synced = 66,
  Get = 81,
  Set = 82,
  Delete = 83,
  Push = 84,
  Unshift = 85,
  Exclude = 86,
  StringConcatenate = 87,
  Error = 99,
}

/**
 * Service types as defined in JSRF Protocol
 */
export enum ServiceType {
  JsonSync = 0,
  ServerCall = 1,
  ClientCall = 2,
  BidirectionalCall = 3,
}

/**
 * Client states for JSON synchronization
 */
export enum ClientSyncState {
  Syncing = "Syncing",
  Error = "Error",
  Synced = "Synced",
  Cached = "Cached",
}

/**
 * Interface for JSRF Protocol packet header
 */
export interface PacketHeader {
  hasAck: HasAck;
  opcode: number; // 0-127
  channel: number; // 0-65535
  seq: number; // 0-2^24-1
  ack?: number; // Optional, present if hasAck is True, 0-2^24-1
}

/**
 * Interface for a complete JSRF Protocol packet
 */
export interface Packet {
  header: PacketHeader;
  payload: Buffer | Uint8Array; // Encoded payload using CBOR
}

/**
 * Interface for decoded payload content (varies based on opcode)
 */
export interface PayloadContent {
  // Generic structure, to be refined based on opcode
  data?: any;
  callId?: number; // For remote calls
  serviceId?: string; // For channel operations
  serviceType?: ServiceType; // For channel operations
  channelId?: number; // For channel operations
  path?: (string | number | object)[]; // For JSON sync operations
  value?: any; // For JSON sync operations like Set, Push, etc.
  filterObj?: object; // For JSON sync Exclude operation
  message?: string; // For error or log messages
  ack?: number; // For ACK responses in control messages
}

/**
 * Interface for a service definition in JSRF Protocol
 */
export interface Service {
  id: string;
  type: ServiceType;
  channelId?: number; // Assigned after channel is opened
  handler?: (args: any) => Promise<any>; // Handler for remote calls
}

/**
 * Interface for JSON synchronization state on client side
 */
export interface SyncState {
  state: ClientSyncState;
  data: any; // The synchronized JSON object or partial data
  lastUpdated?: number; // Timestamp of last sync update
  errorMessage?: string; // If state is Error
}
