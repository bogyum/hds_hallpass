/**
 * Web Audio API 기반 알림음 합성기
 * 별도 음원 파일 없이 브라우저에서 직접 합성
 */

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

/**
 * 경쾌한 띵 소리 (학생 호출 성공, ~0.4초)
 */
export function playDing(volume = 0.7): void {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.2);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}

let chimeBuffer: AudioBuffer | null = null;

export function playChime(volume = 0.7): void {
  try {
    const ctx = getAudioContext();
    
    // 처음 한 번만 파일을 가져와서 디코딩 캐싱
    if (!chimeBuffer) {
      fetch("/sounds/call_chime.mp3")
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          chimeBuffer = buffer;
          playBuffer(ctx, buffer, volume);
        })
        .catch((e) => console.warn("Failed to load chime:", e));
    } else {
      playBuffer(ctx, chimeBuffer, volume);
    }
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, volume: number) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = Math.min(Math.max(volume, 0), 1);
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(0);
}

/**
 * 단순 비프음 (0.3초)
 */
export function playBeep(volume = 0.7): void {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}

/**
 * 명확한 알림음 (새로운 띠링~ 소리)
 */
export function playAlert(volume = 0.8): void {
  try {
    const ctx = getAudioContext();
    const freqs = [783.99, 1046.50]; // G5, C6
    
    freqs.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);

      const startTime = ctx.currentTime + i * 0.15;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    });
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}

import type { SoundType } from "@/types";

export function playSound(type: SoundType, volume = 0.7): void {
  switch (type) {
    case "ding":
      playDing(volume);
      break;
    case "chime":
      playChime(volume);
      break;
    case "beep":
      playBeep(volume);
      break;
  }
}
