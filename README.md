# midi-enshittifier

`midi-enshittifier` is a browser-first Svelte app for turning normal MIDI files into deliberately chaotic versions, previewing both renders, and sharing or publishing the results through Nostr.

There is no custom backend in this repo. The app runs as a static client, stores local data in IndexedDB, pushes shared assets to Blossom-compatible stores, and uses Nostr relays for identity and social features.

## Features

- Drag-and-drop MIDI import
- Real-time "enshittify" pipeline with per-effect intensity controls
- Built-in playback for original and transformed MIDI using Web Audio soundfonts
- Downloadable output MIDI files
- Shareable links backed by HashTree storage
- Recent-share history stored in the browser
- Nostr login via extension, pasted `nsec`, or a locally generated account
- Publish songs to a Nostr-linked profile/feed with follows, likes, and comments

## Included effects

The current effect set includes:

- Drunk Musician
- Tempo Tantrum
- Ghost Drums
- CPU Throttle
- Butter Fingers
- Volume Rollercoaster
- Echo Chamber
- Mood Swing
- Devil's Interval
- Tremolo Terror
- Melody Hijack
- Shred Solo

## Tech stack

- Svelte 5
- Vite
- TypeScript
- UnoCSS
- `soundfont-player` for MIDI preview
- `@hashtree/*` plus Dexie for browser/local asset storage
- Blossom servers for shared and published file distribution
- `@nostr-dev-kit/ndk`, `nostr-tools`, and `nostr-social-graph` for Nostr auth and social features

## Getting started

### Prerequisites

- A recent Node.js release
- `pnpm`

### Install

```bash
pnpm install
```

### Run locally

```bash
pnpm dev
```

Vite will print the local URL, typically `http://localhost:5173`.

### Build

```bash
pnpm build
```

### Preview the production build

```bash
pnpm preview
```

## Quality checks

```bash
pnpm test
pnpm test:e2e
pnpm check
```

## How to use

1. Start the app and drop a `.mid` file onto the upload area.
2. Adjust the enabled effects and their intensity levels.
3. Generate an enshittified version.
4. Preview the original and transformed tracks in the built-in player.
5. Download the result, copy a share link, or publish it to Nostr.

If you do not log in explicitly, the app can bootstrap a local Nostr identity so publishing and interactions still work from the browser.

## Routes

The app uses hash-based routing:

- `#/` for the main upload/editor view
- `#/feed` for the social feed
- `#/u/<npub>` for a user profile
- `#/song/<npub>/<songId>` for a published song page
- `#<nhash>` for legacy share links

## Project layout

- `src/App.svelte`: app shell and top-level workflow
- `src/components/`: UI for upload, playback, feed, profiles, auth, and song pages
- `src/lib/effects/`: effect definitions and registry
- `src/lib/midi.ts`: MIDI parsing and writing
- `src/lib/player.ts`: Web Audio playback engine
- `src/lib/sharing.ts`: share-link packaging and loading
- `src/lib/songs.ts`: published song manifests and storage layout
- `src/lib/nostr/`: auth, relay, follow, and resolver logic
- `e2e/`: Playwright coverage and test fixtures

## Notes

- Sharing and publishing rely on network access to Nostr relays and Blossom servers.
- Playback depends on browser support for Web Audio and soundfont loading.
- The checked-in `dist/` directory is generated build output.
