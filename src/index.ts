// Entry point for the JSRF Protocol module
// This file exports the main components of the library

export const version = "1.0.0";

// Export core types
export * from "./types";

// Export utility functions for packet handling
export * from "./utils";

// Export server-side handler
export { JSRFServer } from "./server";

// Export client-side library
export { JSRFClient } from "./client";

console.log("JSRF Protocol module initialized");
