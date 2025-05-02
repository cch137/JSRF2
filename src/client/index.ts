// Client-side logic for JSRF Protocol
// This module handles WebSocket connections and JSON synchronization for clients

import { WebSocket as WebSocketType } from "ws";
import {
  Packet,
  PacketHeader,
  Service,
  ServiceType,
  PayloadContent,
  ControlOpcode,
  RemoteCallOpcode,
  JsonSyncOpcode,
  HasAck,
  ClientSyncState,
  SyncState,
} from "../types";
import {
  parsePacket,
  decodePayload,
  constructPacket,
  encodeHeader,
} from "../utils";

/**
 * JSRF Client class
 * Manages WebSocket connections, channel subscriptions, and JSON synchronization for clients
 */
export class JSRFClient {
  private ws: WebSocketType | WebSocket | null = null;
  private services: Map<string, Service> = new Map();
  private channelToService: Map<number, string> = new Map();
  private pendingCalls: Map<number, (result: any, error?: string) => void> =
    new Map();
  private syncStates: Map<number, SyncState> = new Map();
  private seq: number = 0;
  private lastReceivedSeq: number = -1;
  private ackTimeout: number = 10000; // 10 seconds as per protocol
  private callIdCounter: number = 0;

  constructor(private url: string) {
    // Initialize client state
  }

  /**
   * Connects to the JSRF server via WebSocket
   * @returns Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window !== "undefined" && window.WebSocket) {
        // Browser environment
        this.ws = new window.WebSocket(this.url);
      } else {
        // Node.js environment
        const WebSocket = require("ws");
        this.ws = new WebSocket(this.url);
      }

      if (!this.ws) {
        reject(new Error("WebSocket initialization failed"));
        return;
      }

      this.ws.onopen = () => {
        console.log("Connected to JSRF server");
        this.setupEventListeners();
        resolve();
      };

      this.ws.onerror = (error: Error | Event) => {
        console.error("WebSocket connection error:", error);
        reject(error);
      };
    });
  }

  /**
   * Registers a service with the client
   * @param service The service to register
   */
  public registerService(service: Service): void {
    this.services.set(service.id, service);
    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.requestChannel(service.id, service.type);
    }
  }

  /**
   * Sets up event listeners for WebSocket events
   */
  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event: any) => {
      let data: any;
      if (event.data instanceof Buffer || event.data instanceof ArrayBuffer) {
        data = event.data;
      } else if (typeof event.data === "string") {
        console.error("Received non-binary data");
        return;
      } else {
        // Handle Node.js WebSocket event
        data = event;
      }

      const buffer = data instanceof Buffer ? data : Buffer.from(data);
      this.handleMessage(buffer);
    };

    this.ws.onclose = () => {
      console.log("Disconnected from JSRF server");
      this.handleDisconnection();
    };

    this.ws.onerror = (error: any) => {
      console.error("WebSocket error:", error);
    };
  }

  /**
   * Processes incoming WebSocket messages
   * @param data The received data as a Buffer
   */
  private handleMessage(data: Buffer): void {
    try {
      const packet = parsePacket(data);

      // Send ACK if required
      if (packet.header.seq > this.lastReceivedSeq) {
        this.lastReceivedSeq = packet.header.seq;
        this.sendAck(packet.header.seq);
      }

      // Decode payload
      const payloadContent = decodePayload(packet.payload as Buffer);

      // Process based on opcode
      if (packet.header.opcode >= 0 && packet.header.opcode <= 31) {
        this.handleControlMessage(packet.header, payloadContent);
      } else if (packet.header.opcode >= 32 && packet.header.opcode <= 63) {
        this.handleRemoteCall(packet.header, payloadContent);
      } else if (packet.header.opcode >= 64 && packet.header.opcode <= 127) {
        this.handleJsonSync(packet.header, payloadContent);
      } else {
        console.error("Invalid opcode:", packet.header.opcode);
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  }

  /**
   * Sends an ACK packet for a received sequence number
   * @param seq The sequence number to acknowledge
   */
  private sendAck(seq: number): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;

    const header = {
      hasAck: HasAck.False,
      opcode: ControlOpcode.Empty,
      channel: 0,
      seq: this.incrementSeq(),
    };
    const payload = { ack: seq };
    const packetBuffer = constructPacket(header, payload);
    if (this.ws) {
      if (
        typeof window !== "undefined" &&
        this.ws instanceof window.WebSocket
      ) {
        this.ws.send(packetBuffer.buffer);
      } else {
        this.ws.send(packetBuffer);
      }
    }
  }

  /**
   * Handles control messages (opcodes 0-31)
   * @param header The packet header
   * @param content The decoded payload content
   */
  private handleControlMessage(
    header: PacketHeader,
    content: PayloadContent
  ): void {
    switch (header.opcode) {
      case ControlOpcode.OpenChannel: {
        const serviceId = content.serviceId as string;
        const channelId = content.channelId as number;
        this.channelToService.set(channelId, serviceId);
        const service = this.services.get(serviceId);
        if (service) {
          service.channelId = channelId;
        }
        console.log(`Channel ${channelId} opened for service ${serviceId}`);
        break;
      }
      case ControlOpcode.CloseChannel: {
        const channelId = header.channel;
        const serviceId = this.channelToService.get(channelId);
        if (serviceId) {
          this.channelToService.delete(channelId);
          const service = this.services.get(serviceId);
          if (service) {
            service.channelId = undefined;
          }
          console.log(`Channel ${channelId} closed for service ${serviceId}`);
        }
        break;
      }
      case ControlOpcode.ErrorChannel: {
        const serviceId = content.serviceId as string;
        console.error(`Error opening channel for service ${serviceId}`);
        break;
      }
      default:
        console.log("Unhandled control opcode:", header.opcode);
    }
  }

  /**
   * Handles remote function call messages (opcodes 32-63)
   * @param header The packet header
   * @param content The decoded payload content
   */
  private handleRemoteCall(
    header: PacketHeader,
    content: PayloadContent
  ): void {
    switch (header.opcode) {
      case RemoteCallOpcode.Call: {
        const callId = content.callId as number;
        const serviceId = this.channelToService.get(header.channel);
        if (!serviceId) {
          this.sendError(header.channel, "Channel not found");
          return;
        }
        const service = this.services.get(serviceId);
        if (!service || !service.handler) {
          this.sendError(header.channel, "No handler for service");
          return;
        }
        this.executeLocalCall(header.channel, callId, service, content.data);
        break;
      }
      case RemoteCallOpcode.Return: {
        const callId = content.callId as number;
        const callback = this.pendingCalls.get(callId);
        if (callback) {
          callback(content.value);
          this.pendingCalls.delete(callId);
        }
        break;
      }
      case RemoteCallOpcode.Error: {
        const callId = content.callId as number;
        const callback = this.pendingCalls.get(callId);
        if (callback) {
          callback(null, content.message as string);
          this.pendingCalls.delete(callId);
        }
        break;
      }
      default:
        console.error("Unsupported remote call opcode:", header.opcode);
    }
  }

  /**
   * Executes a local function call in response to a server request
   * @param channel The channel ID
   * @param callId The call ID
   * @param service The service definition
   * @param args The arguments for the call
   */
  private async executeLocalCall(
    channel: number,
    callId: number,
    service: Service,
    args: any
  ): Promise<void> {
    try {
      if (!service.handler) {
        throw new Error("No handler defined");
      }
      const result = await service.handler(args);
      const header = {
        hasAck: HasAck.False,
        opcode: RemoteCallOpcode.Return,
        channel,
        seq: this.incrementSeq(),
      };
      const payload = { callId, value: result };
      const packetBuffer = constructPacket(header, payload);
      if (this.ws && this.ws.readyState === this.ws.OPEN) {
        if (
          typeof window !== "undefined" &&
          this.ws instanceof window.WebSocket
        ) {
          this.ws.send(packetBuffer.buffer);
        } else {
          this.ws.send(packetBuffer);
        }
      }
    } catch (error) {
      const header = {
        hasAck: HasAck.False,
        opcode: RemoteCallOpcode.Error,
        channel,
        seq: this.incrementSeq(),
      };
      const payload = {
        callId,
        message: error instanceof Error ? error.message : "Unknown error",
      };
      const packetBuffer = constructPacket(header, payload);
      if (this.ws && this.ws.readyState === this.ws.OPEN) {
        this.ws.send(packetBuffer);
      }
    }
  }

  /**
   * Handles JSON synchronization messages (opcodes 64-127)
   * @param header The packet header
   * @param content The decoded payload content
   */
  private handleJsonSync(header: PacketHeader, content: PayloadContent): void {
    // Placeholder for JSON sync logic
    // This will handle operations like Start, Stop, Get, Set, etc.
    console.log("JSON Sync operation received, opcode:", header.opcode);

    switch (header.opcode) {
      case JsonSyncOpcode.Synced: {
        const syncState = this.syncStates.get(header.channel);
        if (syncState) {
          syncState.state = ClientSyncState.Synced;
          console.log(`Channel ${header.channel} synced`);
        }
        break;
      }
      case JsonSyncOpcode.Set: {
        const syncState = this.syncStates.get(header.channel);
        if (syncState && syncState.state === ClientSyncState.Synced) {
          // Update local data
          // For now, just log the update
          console.log(
            `Received update on channel ${header.channel}:`,
            content.path,
            content.value
          );
        }
        break;
      }
      case JsonSyncOpcode.Error: {
        const syncState = this.syncStates.get(header.channel);
        if (syncState) {
          syncState.state = ClientSyncState.Error;
          syncState.errorMessage = content.message as string;
          console.error(
            `Sync error on channel ${header.channel}:`,
            content.message
          );
        }
        break;
      }
      default:
        console.log("Unhandled JSON sync opcode:", header.opcode);
    }
  }

  /**
   * Sends an error message to the server
   * @param channel The channel ID
   * @param message The error message
   */
  private sendError(channel: number, message: string): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;

    const header = {
      hasAck: HasAck.False,
      opcode: JsonSyncOpcode.Error,
      channel,
      seq: this.incrementSeq(),
    };
    const payload = { message };
    const packetBuffer = constructPacket(header, payload);
    this.ws.send(packetBuffer);
  }

  /**
   * Increments the sequence number for outgoing packets
   * @returns The new sequence number
   */
  private incrementSeq(): number {
    const currentSeq = this.seq;
    this.seq = (this.seq + 1) % 0x1000000; // Wrap around at 2^24
    return currentSeq;
  }

  /**
   * Handles disconnection from the server
   */
  private handleDisconnection(): void {
    this.ws = null;
    this.lastReceivedSeq = -1;
    this.pendingCalls.clear();
    // Reset sync states to Cached or Error
    for (const [channel, state] of this.syncStates) {
      if (
        state.state === ClientSyncState.Syncing ||
        state.state === ClientSyncState.Synced
      ) {
        state.state = ClientSyncState.Cached;
      }
    }
  }

  /**
   * Requests a channel ID for a service from the server
   * @param serviceId The service ID
   * @param serviceType The service type
   */
  private requestChannel(serviceId: string, serviceType: ServiceType): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;

    const header = {
      hasAck: HasAck.False,
      opcode: ControlOpcode.DigChannel,
      channel: 0,
      seq: this.incrementSeq(),
    };
    const payload = { serviceId, serviceType };
    const packetBuffer = constructPacket(header, payload);
    this.ws.send(packetBuffer);
  }

  /**
   * Invokes a remote function on the server
   * @param serviceId The service ID to call
   * @param args The arguments for the function call
   * @returns Promise with the result of the remote call
   */
  public async invokeRemote(serviceId: string, args: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      throw new Error("Not connected to server");
    }

    const service = this.services.get(serviceId);
    if (!service || service.channelId === undefined) {
      throw new Error(
        `Service ${serviceId} not registered or channel not assigned`
      );
    }

    const callId = this.incrementCallId();
    const header = {
      hasAck: HasAck.False,
      opcode: RemoteCallOpcode.Call,
      channel: service.channelId,
      seq: this.incrementSeq(),
    };
    const payload = { callId, arguments: args };
    const packetBuffer = constructPacket(header, payload);
    this.ws.send(packetBuffer);

    return new Promise((resolve, reject) => {
      this.pendingCalls.set(callId, (result, error) => {
        if (error) {
          reject(new Error(error));
        } else {
          resolve(result);
        }
      });

      // Set timeout for response
      setTimeout(() => {
        if (this.pendingCalls.has(callId)) {
          this.pendingCalls.delete(callId);
          reject(new Error("Remote call timeout"));
        }
      }, this.ackTimeout);
    });
  }

  /**
   * Increments the call ID counter for remote calls
   * @returns The new call ID
   */
  private incrementCallId(): number {
    const currentCallId = this.callIdCounter;
    this.callIdCounter = (this.callIdCounter + 1) % 0x100000000; // Wrap around at 2^32
    return currentCallId;
  }

  /**
   * Starts JSON synchronization for a service
   * @param serviceId The service ID for synchronization
   */
  public startSync(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (!service || service.channelId === undefined) {
      throw new Error(
        `Service ${serviceId} not registered or channel not assigned`
      );
    }

    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      throw new Error("Not connected to server");
    }

    this.syncStates.set(service.channelId, {
      state: ClientSyncState.Syncing,
      data: null,
    });

    const header = {
      hasAck: HasAck.False,
      opcode: JsonSyncOpcode.Start,
      channel: service.channelId,
      seq: this.incrementSeq(),
    };
    const payload = {};
    const packetBuffer = constructPacket(header, payload);
    this.ws.send(packetBuffer);
  }

  /**
   * Gets the current synchronization state for a service
   * @param serviceId The service ID
   * @returns The current SyncState or undefined if not found
   */
  public getSyncState(serviceId: string): SyncState | undefined {
    const service = this.services.get(serviceId);
    if (!service || service.channelId === undefined) {
      return undefined;
    }
    return this.syncStates.get(service.channelId);
  }
}
