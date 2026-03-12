<script lang="ts">
  import { onMount } from 'svelte'
  import { parseMidi } from '$lib/midi'
  import type { MidiFile } from '$lib/midi'
  import { parseHashRoute, buildProfileRoute, type AppRoute } from '$lib/router'
  import { nostrStore } from '$lib/nostr/store'
  import { restoreOrBootstrapSession } from '$lib/nostr/auth'
  import DropZone from './components/DropZone.svelte'
  import FeedPage from './components/FeedPage.svelte'
  import JamLogo from './components/JamLogo.svelte'
  import NostrAuth from './components/NostrAuth.svelte'
  import ProfilePage from './components/ProfilePage.svelte'
  import Recents from './components/Recents.svelte'
  import SongPage from './components/SongPage.svelte'
  import SongWorkbench from './components/SongWorkbench.svelte'
  import appLogo from './assets/pepe-listening-transparent.png?inline'
  import { effects, enshittify, type EnabledEffect } from '$lib/effects'
  import { getRecents, removeRecent, type RecentShare } from '$lib/recents'
  import {
    parseUrlHash,
    loadShareFromNhash,
  } from '$lib/sharing'

  let route = $state<AppRoute>(parseHashRoute(location.hash))

  let originalMidi = $state<MidiFile | null>(null)
  let enshittifiedMidi = $state<MidiFile | null>(null)
  // All effects enabled by default
  let enabled = $state<EnabledEffect[]>(
    effects.map((e) => ({ id: e.id, intensity: e.defaultIntensity })),
  )
  let fileName = $state('')
  let shareName = $state('')
  let lastSeed = $state<number | null>(null)
  let recents = $state<RecentShare[]>(getRecents())
  let loadingShared = $state(false)
  let loadError = $state<string | null>(null)
  let isPlaying = $state(false)

  let currentNpub = $derived($nostrStore.npub)

  function defaultRecordName(name: string): string {
    const n = name.trim()
    if (!n) return ''
    return n.replace(/\.[^/.]+$/, '')
  }

  async function loadLegacyShareFromHash() {
    const { nhash, config: legacyConfig } = parseUrlHash()
    if (!nhash) return

    loadingShared = true
    loadError = null
    try {
      const shared = await loadShareFromNhash(nhash, legacyConfig)
      if (!shared) {
        loadError = 'Could not load shared MIDI'
        return
      }
      const midi = parseMidi(shared.data)
      originalMidi = midi
      fileName = 'shared.mid'
      shareName = shared.name ?? ''

      if (shared.config) {
        enabled = shared.config.effects
        const result = enshittify(midi, shared.config.effects, shared.config.seed)
        enshittifiedMidi = result.midi
        lastSeed = result.seed
      }
    } catch {
      loadError = 'Failed to load shared MIDI'
    } finally {
      loadingShared = false
    }
  }

  function syncRouteFromHash() {
    route = parseHashRoute(location.hash)
    if (route.type === 'legacy-share') {
      void loadLegacyShareFromHash()
    }
  }

  onMount(() => {
    void restoreOrBootstrapSession()

    syncRouteFromHash()
    window.addEventListener('hashchange', syncRouteFromHash)

    return () => {
      window.removeEventListener('hashchange', syncRouteFromHash)
    }
  })

  async function handleFile(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer())
    originalMidi = parseMidi(buf)
    fileName = file.name
    shareName = defaultRecordName(file.name)
    enshittifiedMidi = null
    lastSeed = null
  }

  function resetState() {
    originalMidi = null
    enshittifiedMidi = null
    fileName = ''
    shareName = ''
    lastSeed = null
    loadError = null
    enabled = effects.map((e) => ({ id: e.id, intensity: e.defaultIntensity }))
    history.replaceState(null, '', location.pathname)
    route = parseHashRoute(location.hash)
  }

  async function loadRecent(entry: RecentShare) {
    loadingShared = true
    loadError = null
    try {
      const shared = await loadShareFromNhash(entry.nhash, entry.config)
      if (!shared) {
        loadError = 'Could not load recent share'
        loadingShared = false
        return
      }
      const midi = parseMidi(shared.data)
      originalMidi = midi
      fileName = entry.fileName
      shareName = shared.name ?? entry.recordName ?? defaultRecordName(entry.fileName)
      const cfg = shared.config ?? entry.config
      enabled = cfg.effects
      const result = enshittify(midi, cfg.effects, cfg.seed)
      enshittifiedMidi = result.midi
      lastSeed = result.seed
    } catch {
      loadError = 'Failed to load recent share'
    } finally {
      loadingShared = false
    }
  }

  function handleRemoveRecent(nhash: string) {
    recents = removeRecent(nhash)
  }

  function handlePlaybackState(playing: boolean) {
    isPlaying = playing
  }

  function handleRecentsChanged(nextRecents: RecentShare[]) {
    recents = nextRecents
  }

  function isHomeLike(current: AppRoute): boolean {
    return current.type === 'home' || current.type === 'legacy-share' || current.type === 'unknown'
  }
</script>

<nav class="card mb-4 flex flex-wrap items-center justify-between gap-2">
  <div class="flex items-center gap-2 text-sm">
    <a class="btn-ghost px-3 py-1 no-underline text-white" href="#/">Home</a>
    <a class="btn-ghost px-3 py-1 no-underline text-white" href="#/feed">Feed</a>
    {#if currentNpub}
      <a class="btn-ghost px-3 py-1 no-underline text-white" href={buildProfileRoute(currentNpub)}>Profile</a>
    {/if}
  </div>
  <NostrAuth />
</nav>

{#if route.type === 'feed'}
  <FeedPage />
{:else if route.type === 'profile'}
  <ProfilePage npub={route.npub} />
{:else if route.type === 'song'}
  <SongPage npub={route.npub} songId={route.songId} onRecentsChanged={handleRecentsChanged} />
{:else if isHomeLike(route)}
  <header class="text-center mb-8">
    <JamLogo src={appLogo} alt="Pepe listening to music" playing={isPlaying} />
    <h1 class="text-3xl font-bold mb-1">
      <span class="text-primary">MIDI</span> Enshittifier
    </h1>
    <p class="text-gray-500 text-sm">make any MIDI file objectively worse</p>
  </header>

  {#if loadingShared}
    <div class="text-center py-12 text-gray-400" data-testid="loading-shared">
      <span class="inline-block spin-unicorn" aria-hidden="true">🦄</span>
      Summoning shared MIDI...
    </div>
  {:else if !originalMidi}
    {#if loadError}
      <div class="text-center text-red-400 text-sm mb-4" data-testid="load-error">{loadError}</div>
    {/if}
    <DropZone onfile={handleFile} />
  {:else}
    <SongWorkbench
      {originalMidi}
      {fileName}
      bind:enabled
      bind:shareName
      bind:enshittifiedMidi
      bind:lastSeed
      allowReset
      onReset={resetState}
      onPlaybackState={handlePlaybackState}
      onRecentsChanged={handleRecentsChanged}
    />
  {/if}

  <Recents {recents} onload={loadRecent} onremove={handleRemoveRecent} />
{/if}
