// Server-side handler for JSRF Protocol
// This module processes WebSocket messages and manages state for servers

import WebSocket from "ws";
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
} from "../types";
import {
  parsePacket,
  decodePayload,
  constructPacket,
  encodeHeader,
} from "../utils";

/**
 * JSRF Server Handler class
 * Manages WebSocket connections, channels, and processes incoming packets
 */
export class JSRFServer {
  private services: Map<string, Service> = new Map();
  private channelToService: Map<number, string> = new Map();
  private nextChannelId: number = 0;
  private seq: number = 0;
  private lastReceivedSeq: Map<WebSocket, number> = new Map();
  private ackTimeout: number = 10000; // 10 seconds as per protocol

  constructor() {
    // Initialize server state
  }

  /**
   * Registers a service with the server
   * @param service The service to register
   */
  public registerService(service: Service): void {
    this.services.set(service.id, service);
  }

  /**
   * Handles a new WebSocket connection
   * @param ws The WebSocket connection
   */
  public handleConnection(ws: WebSocket): void {
    this.lastReceivedSeq.set(ws, -1);

    ws.on("message", (data: WebSocket.Data) => {
      this.handleMessage(ws, data);
    });

    ws.on("close", () => {
      this.handleDisconnection(ws);
    });

    ws.on("error", (error: Error) => {
      console.error("WebSocket error:", error);
      this.handleDisconnection(ws);
    });
  }

  /**
   * Processes incoming WebSocket messages
   * @param ws The WebSocket connection
   * @param data The received data
   */
  private handleMessage(ws: WebSocket, data: WebSocket.Data): void {
    try {
      if (!(data instanceof Buffer)) {
        console.error("Received non-Buffer data");
        return;
      }

      const packet = parsePacket(data);
      const lastSeq = this.lastReceivedSeq.get(ws) || -1;

      // Send ACK if required
      if (packet.header.seq > lastSeq) {
        this.lastReceivedSeq.set(ws, packet.header.seq);
        this.sendAck(ws, packet.header.seq);
      }

      // Decode payload
      const payloadContent = decodePayload(packet.payload as Buffer);

      // Process based on opcode
      if (packet.header.opcode >= 0 && packet.header.opcode <= 31) {
        this.handleControlMessage(ws, packet.header, payloadContent);
      } else if (packet.header.opcode >= 32 && packet.header.opcode <= 63) {
        this.handleRemoteCall(ws, packet.header, payloadContent);
      } else if (packet.header.opcode >= 64 && packet.header.opcode <= 127) {
        this.handleJsonSync(ws, packet.header, payloadContent);
      } else {
        console.error("Invalid opcode:", packet.header.opcode);
        this.sendError(ws, packet.header.channel, "Invalid opcode");
      }
    } catch (error) {
      console.error("Error processing message:", error);
      this.sendError(ws, 0, "Message processing failed");
    }
  }

  /**
   * Sends an ACK packet for a received sequence number
   * @param ws The WebSocket connection
   * @param seq The sequence number to acknowledge
   */
  private sendAck(ws: WebSocket, seq: number): void {
    const header = {
      hasAck: HasAck.False,
      opcode: ControlOpcode.Empty,
      channel: 0,
      seq: this.incrementSeq(),
    };
    const payload = { ack: seq };
    const packetBuffer = constructPacket(header, payload);
    ws.send(packetBuffer);
  }

  /**
   * Handles control messages (opcodes 0-31)
   * @param ws The WebSocket connection
   * @param header The packet header
   * @param content The decoded payload content
   */
  private handleControlMessage(
    ws: WebSocket,
    header: PacketHeader,
    content: PayloadContent
  ): void {
    switch (header.opcode) {
      case ControlOpcode.DigChannel: {
        const serviceId = content.serviceId as string;
        const serviceType = content.serviceType as ServiceType;
        this.handleDigChannel(ws, serviceId, serviceType);
        break;
      }
      case ControlOpcode.Log: {
        console.log("Client log:", content.message);
        break;
      }
      default:
        console.error("Unsupported control opcode:", header.opcode);
        this.sendError(ws, header.channel, "Unsupported control opcode");
    }
  }

  /**
   * Handles a DigChannel request to assign a channel ID to a service
   * @param ws The WebSocket connection
   * @param serviceId The service ID
   * @param serviceType The service type
   */
  private handleDigChannel(
    ws: WebSocket,
    serviceId: string,
    serviceType: ServiceType
  ): void {
    let service = this.services.get(serviceId);
    if (!service) {
      // Auto-register if not found, as per protocol flexibility
      service = { id: serviceId, type: serviceType };
      this.services.set(serviceId, service);
    }

    if (service.channelId === undefined) {
      service.channelId = this.assignChannelId(serviceId);
    }

    const header = {
      hasAck: HasAck.False,
      opcode: ControlOpcode.OpenChannel,
      channel: service.channelId,
      seq: this.incrementSeq(),
    };
    const payload = { serviceId, channelId: service.channelId };
    const packetBuffer = constructPacket(header, payload);
    ws.send(packetBuffer);
  }

  /**
   * Assigns a new channel ID for a service
   * @param serviceId The service ID
   * @returns The assigned channel ID
   */
  private assignChannelId(serviceId: string): number {
    const channelId = this.nextChannelId;
    this.nextChannelId = (this.nextChannelId + 1) % 65536; // Wrap around at 65536
    this.channelToService.set(channelId, serviceId);
    return channelId;
  }

  /**
   * Handles remote function call messages (opcodes 32-63)
   * @param ws The WebSocket connection
   * @param header The packet header
   * @param content The decoded payload content
   */
  private handleRemoteCall(
    ws: WebSocket,
    header: PacketHeader,
    content: PayloadContent
  ): void {
    switch (header.opcode) {
      case RemoteCallOpcode.Call: {
        const callId = content.callId as number;
        const serviceId = this.channelToService.get(header.channel);
        if (!serviceId) {
          this.sendError(ws, header.channel, "Channel not found");
          return;
        }
        const service = this.services.get(serviceId);
        if (!service || !service.handler) {
          this.sendError(ws, header.channel, "No handler for service");
          return;
        }
        this.executeRemoteCall(
          ws,
          header.channel,
          callId,
          service,
          content.data
        );
        break;
      }
      default:
        console.error("Unsupported remote call opcode:", header.opcode);
        this.sendError(ws, header.channel, "Unsupported remote call opcode");
    }
  }

  /**
   * Executes a remote function call and sends the response
   * @param ws The WebSocket connection
   * @param channel The channel ID
   * @param callId The call ID
   * @param service The service definition
   * @param args The arguments for the call
   */
  private async executeRemoteCall(
    ws: WebSocket,
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
      ws.send(packetBuffer);
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
      ws.send(packetBuffer);
    }
  }

  /**
   * Handles JSON synchronization messages (opcodes 64-127)
   * @param ws The WebSocket connection
   * @param header The packet header
   * @param content The decoded payload content
   */
  private handleJsonSync(
    ws: WebSocket,
    header: PacketHeader,
    content: PayloadContent
  ): void {
    // Placeholder for JSON sync logic
    // This will be implemented to handle operations like Start, Stop, Get, Set, etc.
    console.log("JSON Sync operation received, opcode:", header.opcode);
    // For now, acknowledge but do not process
    this.sendError(ws, header.channel, "JSON Sync not yet implemented");
  }

  /**
   * Sends an error message to the client
   * @param ws The WebSocket connection
   * @param channel The channel ID
   * @param message The error message
   */
  private sendError(ws: WebSocket, channel: number, message: string): void {
    const header = {
      hasAck: HasAck.False,
      opcode: JsonSyncOpcode.Error,
      channel,
      seq: this.incrementSeq(),
    };
    const payload = { message };
    const packetBuffer = constructPacket(header, payload);
    ws.send(packetBuffer);
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
   * Handles disconnection of a WebSocket client
   * @param ws The WebSocket connection
   */
  private handleDisconnection(ws: WebSocket): void {
    this.lastReceivedSeq.delete(ws);
    console.log("Client disconnected");
  }
}
