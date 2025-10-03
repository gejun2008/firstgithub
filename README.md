# firstgithub MCP Audiobook Demo

This repository now contains a minimal Model Context Protocol (MCP) stack that demonstrates how a client can drive a custom audiobook toolchain. Everything is implemented with plain Node.js so it can run in restricted environments.

## Project structure

```
.
├── README.md
├── .gitignore
├── audiobook-mcp-server/
│   ├── index.js
│   ├── package.json
│   ├── lib/
│   │   ├── playbackManager.js
│   │   ├── chapterManager.js
│   │   └── progressManager.js
│   └── data/
│       ├── books/
│       │   └── sample-book.json
│       ├── output/
│       │   └── .gitkeep
│       └── progress.json
└── MCP_client/
    ├── index.js
    └── package.json
```

## Prerequisites

* Node.js 18 or newer (no extra npm packages are required).

## Running the MCP server on its own

```bash
cd audiobook-mcp-server
node index.js
```

The server speaks MCP over STDIN/STDOUT. When run manually you can type JSON-RPC messages (one per line) to interact with the tools.

## Running the end-to-end demo client

```bash
cd MCP_client
node index.js
```

The client spawns the server, performs the MCP handshake, lists tools, reads chapters, plays one chapter with the synthetic TTS engine, pauses/resumes playback, persists progress, and finally shuts the server down. Generated audio files are stored under `audiobook-mcp-server/data/output/` as standard WAV files.

## Notes on the synthetic TTS implementation

Because external network calls are not available in this environment, the server contains a very small waveform synthesizer. It encodes characters as gentle sine-wave tones and writes them into a valid PCM WAV file. Even though the audio is not human speech, it respects the MCP contract: text in, audio file out, with pause/resume state tracking and persisted progress.
