const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const MAX_AMPLITUDE = 0.6;

class PlaybackManager {
  constructor(options) {
    this.outputDir = options.outputDir;
    this.state = {
      status: 'idle',
      progressSeconds: 0,
    };
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async play(options) {
    const { text, bookId = null, chapterId = null } = options;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('play: text is required');
    }
    const sanitizedText = text.trim();
    const { filePath, durationSeconds } = await this.#generateSpeechFile(sanitizedText);
    this.state = {
      status: 'playing',
      audioFile: filePath,
      text: sanitizedText,
      progressSeconds: 0,
      metadata: { bookId, chapterId },
      estimatedDurationSeconds: durationSeconds,
      startedAt: Date.now(),
    };
    return this.getState();
  }

  pause() {
    if (this.state.status !== 'playing') {
      throw new Error('pause: nothing is playing');
    }
    const progress = this.#currentProgress();
    this.state.progressSeconds = progress;
    this.state.status = 'paused';
    delete this.state.startedAt;
    return this.getState();
  }

  resume() {
    if (this.state.status !== 'paused') {
      throw new Error('resume: nothing to resume');
    }
    this.state.status = 'playing';
    this.state.startedAt = Date.now();
    return this.getState();
  }

  getState() {
    const baseState = { ...this.state };
    if (baseState.status === 'playing' && baseState.startedAt) {
      baseState.progressSeconds = this.#currentProgress();
    }
    const { startedAt, ...publicState } = baseState;
    return publicState;
  }

  #currentProgress() {
    let progress = this.state.progressSeconds || 0;
    if (this.state.status === 'playing' && this.state.startedAt) {
      progress += (Date.now() - this.state.startedAt) / 1000;
    }
    const duration = this.state.estimatedDurationSeconds ?? Infinity;
    return Math.min(progress, duration);
  }

  async #generateSpeechFile(text) {
    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}.wav`;
    const filePath = path.join(this.outputDir, safeName);
    const toneData = this.#buildWaveSamples(text);
    const wavBuffer = this.#encodeWave(toneData.samples, toneData.durationSeconds);
    await fs.promises.writeFile(filePath, wavBuffer);
    return { filePath, durationSeconds: toneData.durationSeconds };
  }

  #buildWaveSamples(text) {
    const samples = [];
    let totalDuration = 0;
    const letters = text.split('');
    for (const char of letters) {
      if (char === '\\n') {
        const silenceDuration = 0.3;
        this.#appendSilence(samples, silenceDuration);
        totalDuration += silenceDuration;
        continue;
      }
      if (char.trim().length === 0) {
        const silenceDuration = 0.18;
        this.#appendSilence(samples, silenceDuration);
        totalDuration += silenceDuration;
        continue;
      }
      const lower = char.toLowerCase();
      const charCode = lower.charCodeAt(0);
      const baseFrequency = 440;
      const offset = isFinite(charCode) ? (charCode % 32) * 12 : 0;
      const frequency = baseFrequency + offset;
      const duration = 0.18;
      this.#appendTone(samples, frequency, duration);
      totalDuration += duration;
      const gap = 0.04;
      this.#appendSilence(samples, gap);
      totalDuration += gap;
    }
    if (samples.length === 0) {
      this.#appendSilence(samples, 0.2);
      totalDuration += 0.2;
    }
    return { samples, durationSeconds: totalDuration };
  }

  #appendTone(samples, frequency, durationSeconds) {
    const sampleCount = Math.floor(durationSeconds * SAMPLE_RATE);
    for (let i = 0; i < sampleCount; i += 1) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.sin(Math.PI * Math.min(t / durationSeconds, 1));
      const value = Math.sin(2 * Math.PI * frequency * t) * envelope * MAX_AMPLITUDE;
      samples.push(value);
    }
  }

  #appendSilence(samples, durationSeconds) {
    const sampleCount = Math.floor(durationSeconds * SAMPLE_RATE);
    for (let i = 0; i < sampleCount; i += 1) {
      samples.push(0);
    }
  }

  #encodeWave(samples, durationSeconds) {
    const bytesPerSample = BITS_PER_SAMPLE / 8;
    const dataByteLength = samples.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataByteLength);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataByteLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(CHANNELS, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
    buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
    buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataByteLength, 40);

    let offset = 44;
    for (const sample of samples) {
      const clamped = Math.max(-1, Math.min(1, sample));
      const intSample = Math.floor(clamped * 0x7fff);
      buffer.writeInt16LE(intSample, offset);
      offset += bytesPerSample;
    }
    return buffer;
  }
}

module.exports = PlaybackManager;
