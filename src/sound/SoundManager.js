import { useSyncExternalStore } from 'react';
import { Howl, Howler } from 'howler';

// One place for every sound in the app. Components call play('cardDeal') etc.
// Files and licenses: public/audio/AUDIO_CREDITS.md
const SFX_DIR = '/audio/sfx/';
const MUSIC_DIR = '/audio/music/';

// group decides when a sound is preloaded: 'lobby' right away, 'table' when you sit down.
// Sounds with several files pick one at random so repeats don't sound robotic.
const SFX = {
  click: { files: ['click'], volume: 0.35, group: 'lobby' },
  hover: { files: ['hover'], volume: 0.12, group: 'lobby' },
  swoosh: { files: ['swoosh'], volume: 0.5, group: 'lobby' },
  bump: { files: ['bump'], volume: 0.45, group: 'lobby' },
  seatJoin: { files: ['seat-join'], volume: 0.45, group: 'lobby' },
  tick: { files: ['tick'], volume: 0.5, group: 'lobby' },
  cardDeal: { files: ['card-deal-1', 'card-deal-2', 'card-deal-3'], volume: 0.7, group: 'table' },
  cardFlip: { files: ['card-flip'], volume: 0.6, group: 'table' },
  shuffle: { files: ['shuffle'], volume: 0.55, group: 'table' },
  chipPlace: { files: ['chip-place-1', 'chip-place-2', 'chip-place-3'], volume: 0.7, group: 'table' },
  chipStack: { files: ['chip-stack-1', 'chip-stack-2'], volume: 0.55, group: 'table' },
  win: { files: ['win'], volume: 0.55, group: 'table' },
  blackjack: { files: ['blackjack'], volume: 0.6, group: 'table' },
  lose: { files: ['lose'], volume: 0.45, group: 'table' }
};

const MUSIC = {
  lobby: { file: 'lobby-jazz', volume: 0.35 },
  table: { file: 'table-saloon', volume: 0.3 }
};

const CROSSFADE_MS = 1200;
const SETTINGS_KEY = '21club.sound';
const DEFAULT_SETTINGS = { muted: false, master: 0.8, music: 0.6, sfx: 0.8 };

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
const listeners = new Set();
const howls = new Map();
let unlocked = false;
let wantedMusic = null;
let currentMusic = null; // { name, howl }

function sfxHowl(file) {
  if (!howls.has(file)) {
    // OGG first (smaller), MP3 for browsers without OGG
    howls.set(file, new Howl({ src: [`${SFX_DIR}${file}.ogg`, `${SFX_DIR}${file}.mp3`], preload: true }));
  }
  return howls.get(file);
}

function applyVolumes() {
  Howler.mute(settings.muted);
  Howler.volume(settings.master);
  if (currentMusic) currentMusic.howl.volume(MUSIC[currentMusic.name].volume * settings.music);
}

// Load every sound in a group ahead of time (the rest load on first use)
export function preload(group) {
  Object.values(SFX)
    .filter(sound => sound.group === group)
    .forEach(sound => sound.files.forEach(sfxHowl));
}

export function play(name, { rate = 1, volume = 1 } = {}) {
  const sound = SFX[name];
  if (!sound || !unlocked || settings.muted) return;

  const file = sound.files[Math.floor(Math.random() * sound.files.length)];
  const howl = sfxHowl(file);
  const id = howl.play();
  howl.volume(sound.volume * settings.sfx * volume, id);
  if (rate !== 1) howl.rate(rate, id);
}

function startMusic(name) {
  if (currentMusic?.name === name) return;

  // Fade out whatever is playing
  if (currentMusic) {
    const old = currentMusic.howl;
    old.fade(old.volume(), 0, CROSSFADE_MS);
    old.once('fade', () => old.stop());
    currentMusic = null;
  }
  if (!name) return;

  const track = MUSIC[name];
  // html5 streams the long music files instead of downloading them whole first
  const howl = new Howl({
    src: [`${MUSIC_DIR}${track.file}.ogg`, `${MUSIC_DIR}${track.file}.mp3`],
    html5: true,
    loop: true,
    volume: 0
  });
  howl.play();
  howl.fade(0, track.volume * settings.music, CROSSFADE_MS);
  currentMusic = { name, howl };
}

// 'lobby', 'table' or null. Waits for the first click/keypress (browser autoplay rules).
export function setMusic(name) {
  wantedMusic = name;
  if (unlocked) startMusic(name);
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  applyVolumes();
  startMusic(wantedMusic);
}

export function getSettings() {
  return settings;
}

export function updateSettings(changes) {
  settings = { ...settings, ...changes };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings still apply for this visit
  }
  applyVolumes();
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundSettings() {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

// Clicks and hovers for every button, without touching each component.
// data-sound="none" (or "swoosh" etc.) on a button or a parent overrides it.
// Game controls make their own card/chip sounds, so they skip the click.
let installed = false;
export function installUiSounds() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const firstGesture = () => {
    unlock();
    document.removeEventListener('pointerdown', firstGesture, true);
    document.removeEventListener('keydown', firstGesture, true);
  };
  document.addEventListener('pointerdown', firstGesture, true);
  document.addEventListener('keydown', firstGesture, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button, [role="tab"], a[href]');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (button.closest('.practice-controls')) return;
    const choice = button.closest('[data-sound]')?.dataset.sound ?? 'click';
    if (choice !== 'none') play(choice);
  });

  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const button = event.target.closest?.('button.primary');
    if (!button || button.disabled || button.contains(event.relatedTarget)) return;
    play('hover');
  });

  preload('lobby');
}
