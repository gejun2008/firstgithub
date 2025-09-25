const readline = require('readline');
const path = require('path');
const PlaybackManager = require('./lib/playbackManager');
const ChapterManager = require('./lib/chapterManager');
const ProgressManager = require('./lib/progressManager');

const serverInfo = {
  name: 'audiobook-mcp-server',
  version: '0.1.0',
};

const baseDir = __dirname;
const playbackManager = new PlaybackManager({
  outputDir: path.join(baseDir, 'data', 'output'),
});
const chapterManager = new ChapterManager(path.join(baseDir, 'data', 'books'));
const progressManager = new ProgressManager(path.join(baseDir, 'data', 'progress.json'));

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (!line.trim()) {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    return;
  }
  handleMessage(message);
});

async function handleMessage(message) {
  const { id, method, params = {} } = message;
  if (!method) {
    if (id !== undefined) {
      sendError(id, -32600, 'Invalid request: method missing');
    }
    return;
  }

  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-05-30',
          capabilities: {
            tools: {
              list: true,
              call: true,
            },
          },
          serverInfo,
        });
        break;
      case 'tools/list':
        sendResponse(id, {
          tools: getToolDescriptions(),
        });
        break;
      case 'tools/call':
        await handleToolCall(id, params);
        break;
      case 'ping':
        sendResponse(id, {});
        break;
      case 'shutdown':
        sendResponse(id, {});
        process.exit(0);
        break;
      default:
        sendError(id, -32601, `Unknown method: ${method}`);
    }
  } catch (error) {
    if (id !== undefined) {
      sendError(id, -32000, error.message || 'Internal error');
    }
  }
}

function getToolDescriptions() {
  return [
    {
      name: 'play',
      description: 'Generate a synthetic narration for the provided text and mark playback as playing.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          bookId: { type: ['string', 'null'], description: 'Optional book identifier for metadata tracking.' },
          chapterId: { type: ['string', 'null'], description: 'Optional chapter identifier for metadata tracking.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'pause',
      description: 'Pause the current playback state, preserving progress.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'resume',
      description: 'Resume playback from the last paused position.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'getPlaybackState',
      description: 'Retrieve the current playback state without modifying it.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'listChapters',
      description: 'Return the chapter list for a book that can be played.',
      inputSchema: {
        type: 'object',
        properties: {
          bookId: { type: 'string' },
        },
        required: ['bookId'],
      },
    },
    {
      name: 'saveProgress',
      description: 'Persist playback progress for a book and chapter.',
      inputSchema: {
        type: 'object',
        properties: {
          bookId: { type: 'string' },
          chapterId: { type: ['string', 'null'] },
          positionSeconds: { type: 'number' },
        },
        required: ['bookId', 'positionSeconds'],
      },
    },
    {
      name: 'getProgress',
      description: 'Read the persisted playback progress for a book.',
      inputSchema: {
        type: 'object',
        properties: {
          bookId: { type: 'string' },
        },
        required: ['bookId'],
      },
    },
  ];
}

async function handleToolCall(id, params) {
  const { name, arguments: args = {} } = params;
  if (!name) {
    sendError(id, -32602, 'tools/call requires a name');
    return;
  }

  switch (name) {
    case 'play': {
      const state = await playbackManager.play({
        text: args.text,
        bookId: args.bookId,
        chapterId: args.chapterId,
      });
      sendToolResult(id, state);
      break;
    }
    case 'pause': {
      const state = playbackManager.pause();
      sendToolResult(id, state);
      break;
    }
    case 'resume': {
      const state = playbackManager.resume();
      sendToolResult(id, state);
      break;
    }
    case 'getPlaybackState': {
      const state = playbackManager.getState();
      sendToolResult(id, state);
      break;
    }
    case 'listChapters': {
      const data = await chapterManager.listChapters(args.bookId);
      sendToolResult(id, data);
      break;
    }
    case 'saveProgress': {
      const saved = await progressManager.saveProgress({
        bookId: args.bookId,
        chapterId: args.chapterId,
        positionSeconds: args.positionSeconds,
      });
      sendToolResult(id, saved);
      break;
    }
    case 'getProgress': {
      const progress = await progressManager.getProgress(args.bookId);
      sendToolResult(id, progress);
      break;
    }
    default:
      sendError(id, -32601, `Unknown tool: ${name}`);
  }
}

function sendResponse(id, result) {
  if (id === undefined) {
    return;
  }
  const payload = {
    jsonrpc: '2.0',
    id,
    result,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendToolResult(id, data) {
  const payload = {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        {
          type: 'json',
          data,
        },
      ],
    },
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(id, code, message) {
  if (id === undefined) {
    return;
  }
  const payload = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
