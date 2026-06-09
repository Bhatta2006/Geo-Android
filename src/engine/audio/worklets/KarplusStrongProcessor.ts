// This file runs in the AudioWorkletGlobalScope (separate thread).
// It cannot import node modules directly unless bundled. It must remain self-contained.

const DELAY_MAX = 8192; // Max delay length for string waveguide (~5.3Hz at 44.1kHz)

interface Voice {
  active: boolean;
  delayLine: Float32Array;
  writePtr: number;
  delayLength: number;          // target delay length in samples
  loopGain: number;             // string decay (sustain)
  brightness: number;           // loop filter coefficient
  currentPitchCents: number;    // current tracking pitch in cents
  targetPitchCents: number;    // pitch rounding convergence target
  roundingSpeed: number;        // rate of convergence to target
  velocity: number;             // attack velocity (excitation volume)
  lastFilteredSample: number;   // state for one-pole lowpass filter
}

class KarplusStrongProcessor extends AudioWorkletProcessor {
  private voices: Map<number, Voice> = new Map();
  private sampleRate: number = 44100;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      switch (msg.type) {
        case 'noteOn':
          this.startVoice(msg.voiceId, msg.frequency, msg.velocity, msg.brightness, msg.decay);
          break;
        case 'noteUpdate':
          this.updateVoice(msg.voiceId, msg.pitchBendCents, msg.keyY, msg.keyZ);
          break;
        case 'noteOff':
          this.releaseVoice(msg.voiceId);
          break;
      }
    };
  }

  private startVoice(voiceId: number, frequency: number, velocity: number, brightness: number, decay: number) {
    const delayLength = this.sampleRate / frequency;
    if (delayLength >= DELAY_MAX) return;

    const delayLine = new Float32Array(DELAY_MAX);

    // Excitation: noise burst combined with comb-filtering to model pluck point
    // Pluck point at 0.15 represents near-bridge pluck
    const pluckPos = 0.15;
    const excitationLength = Math.round(delayLength);

    for (let i = 0; i < excitationLength; i++) {
      // Basic random noise
      const noise = Math.random() * 2 - 1;
      
      // Pluck excitation comb-filtering shape
      const filterEnvelope = Math.sin(Math.PI * i * pluckPos / delayLength);
      delayLine[i] = noise * velocity * Math.abs(filterEnvelope);
    }

    this.voices.set(voiceId, {
      active: true,
      delayLine,
      writePtr: 0,
      delayLength,
      loopGain: decay,
      brightness,
      currentPitchCents: 0,
      targetPitchCents: 0,
      roundingSpeed: 0.15,
      velocity,
      lastFilteredSample: 0
    });
  }

  private updateVoice(voiceId: number, pitchBendCents: number, keyY: number, _keyZ: number) {
    const voice = this.voices.get(voiceId);
    if (!voice) return;

    voice.targetPitchCents = pitchBendCents;
    // vertical sliding modulates string brightness
    voice.brightness = 0.3 + keyY * 0.5;
  }

  private releaseVoice(voiceId: number) {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    
    // Smoothly decay string instead of immediate cut
    voice.loopGain *= 0.8;
    
    // Cleanup reference after 2 seconds
    setTimeout(() => {
      this.voices.delete(voiceId);
    }, 2000);
  }

  // Lagrange 3rd-order fractional delay interpolation
  // Necessary to prevent stepped click noises during sliding bends
  private readFractionalDelay(delayLine: Float32Array, ptr: number, frac: number): number {
    const i0 = (Math.floor(ptr) + DELAY_MAX) % DELAY_MAX;
    const i1 = (i0 + 1) % DELAY_MAX;
    const i2 = (i0 + 2) % DELAY_MAX;
    const i3 = (i0 + 3) % DELAY_MAX;

    const d = frac;

    // Lagrange coefficient calculation
    const c0 = -d * (d - 1) * (d - 2) / 6;
    const c1 = (d + 1) * (d - 1) * (d - 2) / 2;
    const c2 = -(d + 1) * d * (d - 2) / 2;
    const c3 = (d + 1) * d * (d - 1) / 6;

    return (
      delayLine[i0] * c0 +
      delayLine[i1] * c1 +
      delayLine[i2] * c2 +
      delayLine[i3] * c3
    );
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0][0];
    if (!output) return true;

    // Zero out output buffer
    output.fill(0);

    for (const [, voice] of this.voices) {
      if (!voice.active) continue;

      // Exponential convergence of pitch bend cents toward target (continuous Pitch Rounding)
      const bendError = voice.targetPitchCents - voice.currentPitchCents;
      voice.currentPitchCents += bendError * voice.roundingSpeed;

      // Calculate new delay length based on detune/cents offset
      const bendFactor = Math.pow(2, voice.currentPitchCents / 1200);
      const activeDelayLength = voice.delayLength / bendFactor;

      const intDelay = Math.floor(activeDelayLength);
      const fracDelay = activeDelayLength - intDelay;

      for (let i = 0; i < output.length; i++) {
        // Read index in delay ring
        const readIdx = (voice.writePtr - intDelay - 1 + DELAY_MAX) % DELAY_MAX;
        
        // Retrieve sample with fractional interpolation
        const sample = this.readFractionalDelay(voice.delayLine, readIdx, fracDelay);

        // One-pole loop filter: simulates high-frequency energy loss on string
        // Y(n) = loopGain * ( (1 - brightness) * X(n) + brightness * Y(n-1) )
        const filtered = voice.loopGain * (
          (1 - voice.brightness) * sample + 
          voice.brightness * voice.lastFilteredSample
        );

        voice.lastFilteredSample = filtered;
        voice.delayLine[voice.writePtr] = filtered;
        voice.writePtr = (voice.writePtr + 1) % DELAY_MAX;

        // Mix output sample
        output[i] += sample * 0.25;
      }
    }

    return true;
  }
}

registerProcessor('karplus-strong', KarplusStrongProcessor);
