class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.sfxEnabled = true;
    this.musicEnabled = false; // Off by default to avoid issues
    this.musicInterval = null;
    this.tempo = 110; // BPM
    this.stepCount = 0;
    this.masterVolume = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    
    // Master volume node
    this.masterVolume = this.ctx.createGain();
    this.masterVolume.gain.setValueAtTime(0.3, this.ctx.currentTime); // Low master volume
    this.masterVolume.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Generate white noise for whooshes, explosions, sizzles, or drum beats
  createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // SFX: Wood Chop
  playChop() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    
    // Pitch pop (wood impact)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start(t);
    osc.stop(t + 0.15);

    // Crackle noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const noiseGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, t);
    
    noiseGain.gain.setValueAtTime(0.15, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterVolume);
    
    noise.start(t);
    noise.stop(t + 0.1);
  }

  // SFX: Stone Mine
  playMine() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    
    // High-pitched metal ring
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.25);
    
    // Add minor resonance
    const resOsc = this.ctx.createOscillator();
    const resGain = this.ctx.createGain();
    resOsc.type = 'triangle';
    resOsc.frequency.setValueAtTime(2200, t);
    resGain.gain.setValueAtTime(0.08, t);
    resGain.gain.exponentialRampToValueAtTime(0.005, t + 0.08);

    osc.connect(gain);
    resOsc.connect(resGain);
    gain.connect(this.masterVolume);
    resGain.connect(this.masterVolume);
    
    osc.start(t);
    resOsc.start(t);
    osc.stop(t + 0.3);
    resOsc.stop(t + 0.1);
  }

  // SFX: Cook Sizzle
  playCook() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1500, t);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);
    
    noise.start(t);
    noise.stop(t + 0.4);
  }

  // SFX: Tribal Horn Alarm
  playHorn() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    const duration = 1.2;
    
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(98, t); // G2
    osc1.frequency.linearRampToValueAtTime(110, t + duration * 0.4); // Modulate pitch slightly
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(98.5, t); // Detuned second voice
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(550, t + 0.2);
    filter.frequency.linearRampToValueAtTime(100, t + duration);
    
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.6, t + 0.15); // Swell
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);
    
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);
  }

  // SFX: Birth Chimes
  playBirth() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    
    // Notes: C5 - E5 - G5 - C6 rapid arpeggio
    const freqs = [523.25, 659.25, 783.99, 1046.50];
    freqs.forEach((freq, idx) => {
      const startTime = t + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.005, startTime + 0.4);
      
      osc.connect(gain);
      gain.connect(this.masterVolume);
      
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  // SFX: Combat Hit
  playCombatHit() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    
    // Bass thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    osc.start(t);
    osc.stop(t + 0.2);

    // Noise punch
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const noiseGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterVolume);
    
    noise.start(t);
    noise.stop(t + 0.1);
  }

  // SFX: Arrow Shoot
  playShoot() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    
    // Whoosh frequency sweep
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(1500, t + 0.1);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.15);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);
    
    noise.start(t);
    noise.stop(t + 0.2);
  }

  // SFX: Death (sad slide)
  playDeath() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.6);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start(t);
    osc.stop(t + 0.7);
  }

  // SFX: Shaman Magic Spell
  playShamanHeal() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    
    // Upward bubble sounds
    for (let i = 0; i < 6; i++) {
      const delay = i * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300 + (i * 120), t + delay);
      
      gain.gain.setValueAtTime(0.1, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.15);
      
      osc.connect(gain);
      gain.connect(this.masterVolume);
      
      osc.start(t + delay);
      osc.stop(t + delay + 0.16);
    }
  }

  // SFX: Click
  playClick() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.setValueAtTime(1000, t + 0.02);
    
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // Procedural Music Engine (Background Loop)
  toggleMusic(forceState = null) {
    this.init();
    this.resume();

    const targetState = (forceState !== null) ? forceState : !this.musicEnabled;
    this.musicEnabled = targetState;

    if (this.musicEnabled) {
      if (this.musicInterval) clearInterval(this.musicInterval);
      const stepDuration = 60 / this.tempo / 2; // 8th notes
      this.stepCount = 0;
      this.musicInterval = setInterval(() => this.playMusicStep(), stepDuration * 1000);
    } else {
      if (this.musicInterval) {
        clearInterval(this.musicInterval);
        this.musicInterval = null;
      }
    }
    return this.musicEnabled;
  }

  playMusicStep() {
    if (!this.musicEnabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const step = this.stepCount % 16;
    
    // Bass Drum on 1, 5, 9, 13
    if (step === 0 || step === 8 || step === 4 || step === 12) {
      this.synthDrum(t, 55, 0.45); // Deep bass drum
    }
    
    // Double kick syncopation
    if (step === 10 || step === 14) {
      this.synthDrum(t, 60, 0.25);
    }

    // Shakers / High percussion on off-beats
    if (step % 2 === 1) {
      this.synthShaker(t, 0.015);
    }

    // Woodblock/Rimshot on 5 and 13
    if (step === 4 || step === 12) {
      this.synthWoodBlock(t, 880, 0.08);
    }
    if (step === 6 || step === 14) {
      this.synthWoodBlock(t, 660, 0.05);
    }

    // Simple tribal bassline melody
    // Pentatonic scale (G, Bb, C, D, F) in low octave
    const bassline = [
      98, 98, 0, 116.5, 98, 0, 130.8, 146.8,
      98, 98, 0, 146.8, 174.6, 0, 146.8, 116.5
    ];
    const pitch = bassline[step];
    if (pitch > 0 && step % 2 === 0) {
      // 30% chance to skip note to sound organic
      if (Math.random() > 0.15) {
        this.synthBassNote(t, pitch, 0.25);
      }
    }

    // High flute note (Pentatonic G pentatonic G4-G5) occasionally
    if (step === 2 || step === 10) {
      if (Math.random() > 0.4) {
        const fluteScale = [392.00, 440.00, 466.16, 523.25, 587.33, 783.99]; // G4, A4, Bb4, C5, D5, G5
        const fPitch = fluteScale[Math.floor(Math.random() * fluteScale.length)];
        this.synthFluteNote(t, fPitch, 0.6); // Long soft note
      }
    }

    this.stepCount++;
  }

  // Synthesizers for the Music Engine
  synthDrum(time, freq, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  synthShaker(time, vol) {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);
    
    noise.start(time);
    noise.stop(time + 0.05);
  }

  synthWoodBlock(time, freq, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    
    osc.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start(time);
    osc.stop(time + 0.09);
  }

  synthBassNote(time, freq, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(vol * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, time);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);
    
    osc.start(time);
    osc.stop(time + 0.32);
  }

  synthFluteNote(time, freq, duration) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const vibrato = this.ctx.createOscillator();
    const vibratoGain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.005, time); // Detuned double

    // Vibrato
    vibrato.frequency.setValueAtTime(6, time); // 6 Hz vibrato
    vibratoGain.gain.setValueAtTime(5, time); // pitch depth
    
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc1.frequency);
    vibratoGain.connect(osc2.frequency);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.1); // Slow attack
    gain.gain.setValueAtTime(0.12, time + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, time);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);

    vibrato.start(time);
    osc1.start(time);
    osc2.start(time);
    
    vibrato.stop(time + duration);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }
}

export const gameAudio = new AudioSynthesizer();
