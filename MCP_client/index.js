const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

const serverDir = path.resolve(__dirname, '..', 'audiobook-mcp-server');
const serverEntry = path.join(serverDir, 'index.js');

const server = spawn('node', [serverEntry], {
  cwd: serverDir,
  stdio: ['pipe', 'pipe', 'inherit'],
});

const rl = readline.createInterface({
  input: server.stdout,
  crlfDelay: Infinity,
});

const pending = new Map();
let requestId = 0;

rl.on('line', (line) => {
  if (!line.trim()) {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    console.warn('Failed to parse message from server:', line);
    return;
  }
  if (typeof message.id !== 'undefined' && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      const err = new Error(message.error.message || 'Server error');
      err.code = message.error.code;
      reject(err);
    } else {
      resolve(message.result);
    }
  } else if (message.method) {
    console.log('[notification]', message);
  } else {
    console.log('[server]', message);
  }
});

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Server exited with code ${code}`);
  }
});

function sendRequest(method, params = {}) {
  const id = ++requestId;
  const payload = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  server.stdin.write(`${JSON.stringify(payload)}\n`);
  return promise;
}

async function callTool(name, args = {}) {
  const result = await sendRequest('tools/call', {
    name,
    arguments: args,
  });
  return extractContent(result);
}

function extractContent(result) {
  if (result && Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item && item.type === 'json') {
        return item.data;
      }
      if (item && item.type === 'text') {
        return item.text;
      }
    }
  }
  return result;
}

async function main() {
  console.log('Connecting to MCP server...');
  const initResult = await sendRequest('initialize', {
    clientInfo: {
      name: 'mcp-client-demo',
      version: '0.1.0',
    },
    capabilities: {},
  });
  console.log('Server handshake:', initResult);

  const toolsResult = await sendRequest('tools/list');
  console.log('Available tools:', toolsResult.tools.map((tool) => tool.name).join(', '));

  const chapters = await callTool('listChapters', { bookId: 'sample-book' });
  console.log(`Loaded book "${chapters.title}" by ${chapters.author}`);
  chapters.chapters.forEach((chapter, index) => {
    console.log(`  ${index + 1}. ${chapter.title} (${chapter.wordCount} words)`);
  });

  const firstChapter = chapters.chapters[0];
  console.log('\nRequesting playback for the first chapter...');
  const playState = await callTool('play', {
    text: firstChapter.text,
    bookId: chapters.bookId,
    chapterId: firstChapter.id,
  });
  logPlaybackState('Playing', playState);

  await wait(600);
  const paused = await callTool('pause');
  logPlaybackState('Paused', paused);

  await wait(400);
  const resumed = await callTool('resume');
  logPlaybackState('Resumed', resumed);

  await wait(800);
  const saved = await callTool('saveProgress', {
    bookId: chapters.bookId,
    chapterId: firstChapter.id,
    positionSeconds: Math.round(resumed.progressSeconds || 0),
  });
  console.log('Progress saved:', saved);

  const stored = await callTool('getProgress', { bookId: chapters.bookId });
  console.log('Stored progress:', stored);

  const currentState = await callTool('getPlaybackState');
  logPlaybackState('Current playback state', currentState);

  await sendRequest('shutdown');
  server.stdin.end();
}

function logPlaybackState(label, state) {
  if (!state) {
    console.log(`${label}: <no state>`);
    return;
  }
  const progress = typeof state.progressSeconds === 'number'
    ? state.progressSeconds.toFixed(2)
    : '0.00';
  const duration = typeof state.estimatedDurationSeconds === 'number'
    ? state.estimatedDurationSeconds.toFixed(2)
    : 'n/a';
  console.log(`${label}: status=${state.status}, progress=${progress}s, duration=${duration}s`);
  if (state.audioFile) {
    console.log(`  audio file: ${state.audioFile}`);
  }
  if (state.metadata) {
    console.log(`  metadata: ${JSON.stringify(state.metadata)}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Client encountered an error:', error.message);
  server.kill('SIGTERM');
  process.exitCode = 1;
});
