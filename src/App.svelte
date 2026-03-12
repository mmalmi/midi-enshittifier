<script lang="ts">
  import { onMount } from 'svelte'
  import { parseMidi, writeMidi } from '$lib/midi'
  import type { MidiFile } from '$lib/midi'
  import { parseHashRoute, buildProfileRoute, type AppRoute } from '$lib/router'
  import { publishSong } from '$lib/songs'
  import { getNostrState, nostrStore } from '$lib/nostr/store'
  import { restoreOrBootstrapSession } from '$lib/nostr/auth'
  import DropZone from './components/DropZone.svelte'
  import EffectsPanel from './components/EffectsPanel.svelte'
  import FeedPage from './components/FeedPage.svelte'
  import JamLogo from './components/JamLogo.svelte'
  import NostrAuth from './components/NostrAuth.svelte'
  import Player from './components/Player.svelte'
  import ProfilePage from './components/ProfilePage.svelte'
  import Recents from './components/Recents.svelte'
  import SongPage from './components/SongPage.svelte'
  import appLogo from './assets/pepe-listening-transparent.png?inline'
  import { effects, enshittify, type EnabledEffect } from '$lib/effects'
  import { getRecents, addRecent, removeRecent, type RecentShare } from '$lib/recents'
  import {
    parseUrlHash,
    loadShareFromNhash,
    shareMidi,
    buildShareUrl,
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
  let copied = $state(false)
  let publishing = $state(false)
  let publishError = $state<string | null>(null)
  let showAdvanced = $state(false)
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
    publishError = null
  }

  function doEnshittify() {
    if (!originalMidi || enabled.length === 0) return
    const result = enshittify(originalMidi, enabled)
    enshittifiedMidi = result.midi
    lastSeed = result.seed
    publishError = null
  }

  function download() {
    if (!enshittifiedMidi) return
    const data = writeMidi(enshittifiedMidi)
    const blob = new Blob([data as BlobPart], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enshittified_${fileName}`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function share() {
    if (!originalMidi) return
    try {
      const payload = await shareMidi(writeMidi(originalMidi), {
        effects: enabled,
        seed: lastSeed ?? 0,
      }, {
        name: shareName,
      })
      const url = buildShareUrl(payload)
      await navigator.clipboard.writeText(url)
      copied = true
      setTimeout(() => (copied = false), 2000)
      recents = addRecent({
        nhash: payload.nhash,
        fileName,
        recordName: shareName.trim() || undefined,
        config: { effects: enabled, seed: lastSeed ?? 0 },
      })
    } catch {
      const info = JSON.stringify({ effects: enabled, seed: lastSeed })
      await navigator.clipboard.writeText(info)
      copied = true
      setTimeout(() => (copied = false), 2000)
    }
  }

  async function publishCurrent() {
    if (!originalMidi || !enshittifiedMidi) return

    publishing = true
    publishError = null

    try {
      if (!getNostrState().pubkey) {
        await restoreOrBootstrapSession()
      }

      const result = await publishSong({
        title: shareName.trim() || defaultRecordName(fileName),
        sourceFileName: fileName || 'song.mid',
        originalData: writeMidi(originalMidi),
        enshittifiedData: writeMidi(enshittifiedMidi),
        seed: lastSeed ?? 0,
        effects: enabled,
      })

      location.hash = buildProfileRoute(result.ownerNpub).slice(1)
    } catch (e) {
      publishError = e instanceof Error ? e.message : 'Publishing failed'
    } finally {
      publishing = false
    }
  }

  function resetState() {
    originalMidi = null
    enshittifiedMidi = null
    fileName = ''
    shareName = ''
    lastSeed = null
    loadError = null
    publishError = null
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

  function trackInfo(midi: MidiFile): string {
    const tracks = midi.tracks.filter((t) => t.notes.length > 0).length
    const notes = midi.tracks.reduce((s, t) => s + t.notes.length, 0)
    let dur = 0
    for (const t of midi.tracks)
      for (const n of t.notes) dur = Math.max(dur, n.time + n.duration)
    const m = Math.floor(dur / 60)
    const s = Math.floor(dur % 60)
    return `${tracks} tracks · ${notes} notes · ${m}:${s.toString().padStart(2, '0')}`
  }

  function handlePlaybackState(playing: boolean) {
    isPlaying = playing
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
  <SongPage npub={route.npub} songId={route.songId} />
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
    <!-- file info -->
    <div class="card mb-4 flex items-center justify-between">
      <div>
        <div class="text-sm font-medium truncate">{fileName}</div>
        <div class="text-xs text-gray-500">{trackInfo(originalMidi)}</div>
      </div>
      <button
        class="text-xs text-gray-500 hover:text-primary"
        onclick={resetState}
      >
        change
      </button>
    </div>

    <!-- enshittify button -->
    <div class="flex gap-2 mb-4">
      <button
        class="btn-primary flex-1 text-lg py-3"
        disabled={enabled.length === 0}
        onclick={doEnshittify}
        data-testid="enshittify-btn"
      >
        {enshittifiedMidi ? 'Re-enshittify' : 'Enshittify'}{enabled.length > 0 ? ` (${enabled.length})` : ''}
      </button>
      {#if enshittifiedMidi}
        <button
          class="btn-secondary px-4 py-3 text-lg"
          onclick={doEnshittify}
          title="Re-roll with new random seed"
          data-testid="reroll-btn"
        >
          🎲
        </button>
      {/if}
    </div>

    <!-- advanced: effects panel -->
    <div class="mb-4">
      <button
        class="text-xs text-gray-500 hover:text-primary flex items-center gap-1 mb-2"
        onclick={() => (showAdvanced = !showAdvanced)}
        data-testid="advanced-toggle"
      >
        <span
          class="inline-block transition-transform duration-150"
          class:rotate-90={showAdvanced}
        >&#9654;</span>
        Advanced
        <span class="text-gray-600">({enabled.length}/{effects.length} effects)</span>
      </button>
      {#if showAdvanced}
        <EffectsPanel {effects} bind:enabled />
      {/if}
    </div>

    <!-- player -->
    <div class="mb-4">
      <Player
        original={originalMidi}
        enshittified={enshittifiedMidi}
        onPlaybackState={handlePlaybackState}
      />
    </div>

    <!-- actions -->
    {#if enshittifiedMidi}
      <div class="mb-2">
        <div class="text-xs text-gray-500 mb-1">Name the masterpiece (optional)</div>
        <input
          type="text"
          class="w-full rounded-lg bg-surface-light border border-surface-lighter px-3 py-2 text-sm text-white outline-none focus:border-primary-op50"
          placeholder="Name the masterpiece"
          bind:value={shareName}
          maxlength="120"
        />
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary flex-1" onclick={download} data-testid="download-btn">
          Download .mid
        </button>
        <button class="btn-ghost flex-1" onclick={share}>
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>
      <div class="flex gap-2 mt-2">
        <button class="btn-primary flex-1" onclick={publishCurrent} disabled={publishing}>
          {publishing ? 'Publishing...' : 'Publish'}
        </button>
      </div>
      {#if publishError}
        <div class="text-center text-xs text-red-400 mt-2">{publishError}</div>
      {/if}
      {#if lastSeed != null}
        <div class="text-center text-xs text-gray-600 mt-2">
          seed: {lastSeed}
        </div>
      {/if}
    {/if}
  {/if}

  <Recents {recents} onload={loadRecent} onremove={handleRemoveRecent} />
{/if}
