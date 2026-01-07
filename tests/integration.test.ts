import { describe, expect, test, jest } from "@jest/globals";
import { JSRFClient } from "../src/client";
import { JSRFServer } from "../src/server";
import { Service } from "../src/types";
import WebSocket, { WebSocketServer } from "ws";

describe("JSRF Integration Test", () => {
  let server: JSRFServer;
  let client: JSRFClient;
  let wss: WebSocketServer;
  const port = 8081;

  beforeAll(async () => {
    // Setup WebSocket server
    wss = new WebSocketServer({ port });
    server = new JSRFServer();

    wss.on("connection", (ws) => {
      server.handleConnection(ws);
    });

    // Setup client
    client = new JSRFClient(`ws://localhost:${port}`);
    await client.connect();
  });

  afterAll(async () => {
    // Close client connection first by closing the underlying WebSocket
    await new Promise<void>((resolve) => {
      if (client) {
        // Access the private ws property to close the connection
        // @ts-ignore: Access private property for testing purposes
        const ws = client.ws;
        if (ws) {
          ws.close();
          resolve();
        } else {
          resolve();
        }
      } else {
        resolve();
      }
    });

    // Then close the WebSocket server
    await new Promise<void>((resolve) => {
      wss.close(() => {
        resolve();
      });
    });
  });

  test("should synchronize complex object between server and client", async () => {
    // Arrange
    const complexObject = {
      id: "test-obj",
      data: {
        name: "Test Object",
        value: 123,
        nested: {
          a: 1,
          b: [1, 2, 3],
        },
      },
    };

    const syncService: Service = {
      id: "sync-complex-service",
      type: 0, // ServiceType.JsonSync
      handler: async (data) => {
        // Server-side handler for sync updates
        return Promise.resolve(complexObject);
      },
    };

    // Register service on server
    server.registerService(syncService);

    // Register service on client
    client.registerService(syncService);

    // Act
    // Wait for channel assignment before starting sync
    await new Promise((resolve) => {
      const checkChannel = setInterval(() => {
        const service = client["services"].get("sync-complex-service");
        if (service && service.channelId !== undefined) {
          clearInterval(checkChannel);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkChannel);
        resolve(false);
      }, 5000); // Timeout after 5 seconds
    });

    client.startSync("sync-complex-service");
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for sync to start

    const clientState = client.getSyncState("sync-complex-service");

    // Assert
    expect(clientState).toBeDefined();
    // Additional assertions can be added once getSyncValue is implemented
  }, 10000);

  test("should handle remote function call between client and server", async () => {
    // Arrange
    const remoteService: Service = {
      id: "remote-call-service",
      type: 1, // ServiceType.RemoteCall
      handler: async (args) => {
        return Promise.resolve({ result: "success", received: args });
      },
    };

    // Register service on server
    server.registerService(remoteService);

    // Register service on client
    client.registerService(remoteService);

    // Wait for channel assignment before invoking remote call
    await new Promise((resolve) => {
      const checkChannel = setInterval(() => {
        const service = client["services"].get("remote-call-service");
        if (service && service.channelId !== undefined) {
          clearInterval(checkChannel);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkChannel);
        resolve(false);
      }, 5000); // Timeout after 5 seconds
    });

    const args = { method: "testMethod", params: [1, 2, 3] };

    // Act
    const response = await client.invokeRemote("remote-call-service", args);

    // Assert
    expect(response).toBeDefined();
    expect(response.result).toBe("success");
    expect(response.received).toEqual(args);
  }, 10000);
});
