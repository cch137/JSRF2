# Changelog

All notable changes to the `jsrf-protocol` module will be documented in this file.

## [1.0.0] - 2025-05-02

### Added

- Initial implementation of the JSRF Protocol as per the specifications in README.md.
- **Type Definitions** (`src/types/index.ts`): Defined enums and interfaces for packet structures, opcodes, service types, and synchronization states.
- **Utility Functions** (`src/utils/index.ts`): Added functions for encoding/decoding packet headers and CBOR payloads.
- **Server Handler** (`src/server/index.ts`): Implemented `JSRFServer` class for managing WebSocket connections, channel assignments, and processing control messages and remote calls.
- **Client Library** (`src/client/index.ts`): Implemented `JSRFClient` class for connecting to servers, handling remote function calls, and initiating JSON synchronization.
- **Main Entry Point** (`src/index.ts`): Exported all necessary components for integration.
- Project configuration with TypeScript, ES module support, and build tools like Rollup.
- Installed dependencies: `ws` for WebSocket and `cbor` for payload encoding.
- Added `.gitignore` and `.npmignore` files to exclude unnecessary files from version control and npm packages.

### Notes

- JSON synchronization logic is currently a placeholder and requires further implementation for detailed operations like `Set`, `Get`, etc.
- Project setup includes build scripts for bundling into CommonJS and ES module formats.
