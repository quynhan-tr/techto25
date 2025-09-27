// Audio engine for vocal-like SATB synthesis
export class VocalAudioEngine {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private currentVoices: Map<string, VocalVoice> = new Map();
  private isInitialized = false;

  constructor() {
    // AudioContext will be created lazily on first user interaction
    this.audioContext = null!;
    this.masterGain = null!;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.setValueAtTime(0.5, this.audioContext.currentTime); // Default master volume
      this.isInitialized = true;
      
      // Resume context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw error;
    }
  }

  async playChord(soprano: number, alto: number, tenor: number, bass: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Stop all current voices
    this.stopAll();

    // Play all 4 voices simultaneously
    this.currentVoices.set('soprano', new VocalVoice(this.audioContext, this.masterGain, soprano, 'soprano'));
    this.currentVoices.set('alto', new VocalVoice(this.audioContext, this.masterGain, alto, 'alto'));
    this.currentVoices.set('tenor', new VocalVoice(this.audioContext, this.masterGain, tenor, 'tenor'));
    this.currentVoices.set('bass', new VocalVoice(this.audioContext, this.masterGain, bass, 'bass'));

    // Start all voices
    Array.from(this.currentVoices.values()).forEach(voice => {
      voice.start();
    });
  }

  stopAll(): void {
    Array.from(this.currentVoices.values()).forEach(voice => {
      voice.stop();
    });
    this.currentVoices.clear();
  }

  setMasterVolume(volume: number): void {
    if (!this.isInitialized || !this.masterGain) return;
    
    // Clamp volume between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    // Apply smooth transition to avoid clicks
    const now = this.audioContext.currentTime;
    const transitionTime = 0.05; // 50ms smooth transition
    
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(clampedVolume, now + transitionTime);
  }

  getMasterVolume(): number {
    if (!this.isInitialized || !this.masterGain) return 0.5;
    return this.masterGain.gain.value;
  }

  destroy(): void {
    this.stopAll();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

class VocalVoice {
  private audioContext: AudioContext;
  private oscillator1: OscillatorNode;
  private oscillator2: OscillatorNode;
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;
  private frequency: number;
  private voiceType: string;

  constructor(audioContext: AudioContext, destination: AudioNode, midiNote: number, voiceType: string) {
    this.audioContext = audioContext;
    this.frequency = this.midiToFrequency(midiNote);
    this.voiceType = voiceType;

    // Create audio nodes
    this.oscillator1 = audioContext.createOscillator();
    this.oscillator2 = audioContext.createOscillator();
    this.gainNode = audioContext.createGain();
    this.filterNode = audioContext.createBiquadFilter();

    // Configure oscillators for vocal-like sound
    this.oscillator1.type = 'sawtooth';
    this.oscillator2.type = 'triangle';
    
    // Set frequencies with slight detuning for richness
    this.oscillator1.frequency.setValueAtTime(this.frequency, audioContext.currentTime);
    this.oscillator2.frequency.setValueAtTime(this.frequency * 1.002, audioContext.currentTime);

    // Configure filter for vocal formants
    this.setupVocalFilter(voiceType);

    // Configure gain envelope
    this.setupGainEnvelope();

    // Connect audio graph
    this.oscillator1.connect(this.filterNode);
    this.oscillator2.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(destination);
  }

  private midiToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  private setupVocalFilter(voiceType: string): void {
    // Set different formant frequencies for different voice types
    let filterFreq: number;
    const filterQ = 2.0;

    switch (voiceType) {
      case 'soprano':
        filterFreq = 1200; // Higher formant for soprano
        break;
      case 'alto':
        filterFreq = 900; // Medium-high formant for alto
        break;
      case 'tenor':
        filterFreq = 650; // Medium formant for tenor
        break;
      case 'bass':
        filterFreq = 400; // Lower formant for bass
        break;
      default:
        filterFreq = 800;
    }

    this.filterNode.type = 'bandpass';
    this.filterNode.frequency.setValueAtTime(filterFreq, this.audioContext.currentTime);
    this.filterNode.Q.setValueAtTime(filterQ, this.audioContext.currentTime);
  }

  private setupGainEnvelope(): void {
    const now = this.audioContext.currentTime;
    const attackTime = 0.05; // Quick attack
    const sustainLevel = 0.25; // Equal volume for all voices

    // Set up ADSR envelope
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime);
  }

  start(): void {
    const now = this.audioContext.currentTime;
    this.oscillator1.start(now);
    this.oscillator2.start(now);
  }

  stop(): void {
    const now = this.audioContext.currentTime;
    const releaseTime = 0.1;

    // Fade out
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(0, now + releaseTime);

    // Stop oscillators after fade out
    this.oscillator1.stop(now + releaseTime);
    this.oscillator2.stop(now + releaseTime);
  }
}

// Singleton instance
export const audioEngine = new VocalAudioEngine();
