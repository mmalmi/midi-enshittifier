<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { parseMidi } from '$lib/midi'
  import type { MidiFile } from '$lib/midi'
  import { parseHashRoute, type AppRoute } from '$lib/router'
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
  import { defaultRecordName } from '$lib/songPresentation'
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
  let feedSectionEl = $state<HTMLElement | null>(null)

  const BRAND_LABEL = 'Enshittifier'
  const TAGLINE = 'make any MIDI file objectively worse'
  const CHAOS_STORAGE_KEY = 'midi-enshittifier-chaos-mode'
  const TRAIL_GLYPHS = ['☯', '♪', '✦']

  type TrailMark = {
    id: number
    x: number
    y: number
    glyph: string
    twist: number
    size: number
    hue: number
  }

  let chaosMode = $state(false)
  let prefersReducedMotion = $state(false)
  let finePointer = $state(false)
  let pageVisible = $state(true)
  let pointerTrail = $state<TrailMark[]>([])

  let iconLink: HTMLLinkElement | null = null
  let faviconTimer: ReturnType<typeof setInterval> | null = null
  let faviconFrame = 0
  let trailSerial = 0
  let lastTrailAt = 0
  let lastTrailX = -999
  let lastTrailY = -999
  const trailTimers = new Map<number, ReturnType<typeof setTimeout>>()

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

  function clearTrail() {
    pointerTrail = []
    for (const timer of trailTimers.values()) clearTimeout(timer)
    trailTimers.clear()
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  function setChaosMode(next: boolean) {
    chaosMode = next
    try {
      localStorage.setItem(CHAOS_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Ignore storage failures in private mode / locked-down contexts.
    }
  }

  function toggleChaosMode() {
    setChaosMode(!chaosMode)
  }

  function ensureIconLink(): HTMLLinkElement {
    if (iconLink?.isConnected) return iconLink
    const existing = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
    if (existing) {
      iconLink = existing
      return existing
    }
    const created = document.createElement('link')
    created.rel = 'icon'
    document.head.appendChild(created)
    iconLink = created
    return created
  }

  function faviconHref(frame: number, mode: 'idle' | 'chaos' | 'playback'): string {
    if (mode === 'idle') return '/pepe-listening-transparent.png'

    const accent = mode === 'playback'
      ? ['#e040fb', '#61f3ff', '#ffde59', '#ff8bd8'][frame % 4]
      : ['#ffde59', '#e040fb', '#9efc89', '#61f3ff'][frame % 4]
    const glyph = mode === 'chaos' ? '☯' : '♪'
    const tilt = mode === 'playback' ? [-10, -4, 5, 10][frame % 4] : [-6, 6, 0, 8][frame % 4]
    const pulse = mode === 'playback' ? [0, -2, 1, -1][frame % 4] : [0, 1, 0, -1][frame % 4]
    const rings = mode === 'playback' ? [18, 20, 22, 20][frame % 4] : [16, 18, 17, 19][frame % 4]
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="16" fill="#120f24"/>
        <circle cx="32" cy="32" r="${rings}" fill="none" stroke="${accent}" stroke-width="4" opacity="0.28"/>
        <circle cx="48" cy="16" r="5" fill="${accent}" opacity="0.88"/>
        <g transform="translate(32 32) rotate(${tilt}) translate(-32 -32)">
          <text x="32" y="${40 + pulse}" text-anchor="middle" font-size="32" fill="#ffffff" font-family="ui-sans-serif, system-ui, sans-serif">${glyph}</text>
        </g>
      </svg>
    `
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }

  function stopFaviconAnimation() {
    if (faviconTimer != null) {
      clearInterval(faviconTimer)
      faviconTimer = null
    }
  }

  function updateFavicon(mode: 'idle' | 'chaos' | 'playback') {
    ensureIconLink().href = faviconHref(faviconFrame, mode)
  }

  function isHomeLike(current: AppRoute): boolean {
    return current.type === 'home' || current.type === 'feed' || current.type === 'legacy-share' || current.type === 'unknown'
  }

  let showPointerTrail = $derived(isHomeLike(route) && !originalMidi && finePointer && !prefersReducedMotion)

  function pushTrail(x: number, y: number) {
    if (!showPointerTrail) return

    const now = Date.now()
    if (now - lastTrailAt < 52 && Math.hypot(x - lastTrailX, y - lastTrailY) < 18) return

    lastTrailAt = now
    lastTrailX = x
    lastTrailY = y

    const mark: TrailMark = {
      id: ++trailSerial,
      x,
      y,
      glyph: TRAIL_GLYPHS[trailSerial % TRAIL_GLYPHS.length],
      twist: (Math.random() - 0.5) * 24,
      size: chaosMode ? 18 + Math.random() * 8 : 14 + Math.random() * 5,
      hue: chaosMode ? Math.random() * 120 : Math.random() * 40,
    }

    pointerTrail = [...pointerTrail.slice(-6), mark]
    const timer = setTimeout(() => {
      pointerTrail = pointerTrail.filter((item) => item.id !== mark.id)
      trailTimers.delete(mark.id)
    }, chaosMode ? 800 : 620)
    trailTimers.set(mark.id, timer)
  }

  function attachMediaListener(query: MediaQueryList, listener: () => void): () => void {
    if ('addEventListener' in query) {
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    }
    const legacyQuery = query as MediaQueryList & {
      addListener?: (listener: () => void) => void
      removeListener?: (listener: () => void) => void
    }
    legacyQuery.addListener?.(listener)
    return () => legacyQuery.removeListener?.(listener)
  }

  onMount(() => {
    void restoreOrBootstrapSession()

    try {
      chaosMode = localStorage.getItem(CHAOS_STORAGE_KEY) === '1'
    } catch {
      chaosMode = false
    }

    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const syncEnv = () => {
      prefersReducedMotion = reduceMotionQuery.matches
      finePointer = finePointerQuery.matches
      pageVisible = !document.hidden
    }

    const onVisibilityChange = () => {
      pageVisible = !document.hidden
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return
      if (event.key === '§' || event.key === '½') {
        event.preventDefault()
        toggleChaosMode()
      }
    }

    const onMouseMove = (event: MouseEvent) => {
      pushTrail(event.clientX, event.clientY)
    }

    syncEnv()
    ensureIconLink()
    updateFavicon(chaosMode ? 'chaos' : 'idle')
    syncRouteFromHash()

    const detachMotion = attachMediaListener(reduceMotionQuery, syncEnv)
    const detachPointer = attachMediaListener(finePointerQuery, syncEnv)

    window.addEventListener('hashchange', syncRouteFromHash)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      detachMotion()
      detachPointer()
      window.removeEventListener('hashchange', syncRouteFromHash)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

  onDestroy(() => {
    stopFaviconAnimation()
    clearTrail()
    document.body.classList.remove('playback-active', 'chaos-mode')
  })

  $effect(() => {
    if (route.type !== 'feed') return

    void tick().then(() => {
      feedSectionEl?.scrollIntoView({ block: 'start' })
    })
  })

  $effect(() => {
    if (!showPointerTrail) clearTrail()
  })

  $effect(() => {
    document.body.classList.toggle('playback-active', isPlaying)
    document.body.classList.toggle('chaos-mode', chaosMode)
    return () => {
      document.body.classList.remove('playback-active', 'chaos-mode')
    }
  })

  $effect(() => {
    const mode = isPlaying ? 'playback' : chaosMode ? 'chaos' : 'idle'
    stopFaviconAnimation()
    faviconFrame = 0
    updateFavicon(mode)

    if (mode === 'playback' && !prefersReducedMotion && pageVisible) {
      faviconTimer = setInterval(() => {
        faviconFrame = (faviconFrame + 1) % 4
        updateFavicon(mode)
      }, 260)
    }

    return () => stopFaviconAnimation()
  })
</script>

<div class="app-shell" class:playback-active={isPlaying} class:chaos-mode={chaosMode}>
  <header class="card mb-4 flex flex-col items-center gap-4 text-center">
    <a class="flex min-w-0 flex-col items-center gap-3 no-underline text-white" href="#/">
      <JamLogo
        src={appLogo}
        alt="Pepe listening to music"
        playing={isPlaying}
        chaos={chaosMode}
        size={96}
        inline
      />
      <div class="min-w-0 text-center">
        <div class="app-title text-2xl font-bold leading-tight">
          <span class="text-primary">MIDI</span> {BRAND_LABEL}
        </div>
        <div class="app-tagline text-sm text-gray-500">{TAGLINE}</div>
      </div>
    </a>

    <div class="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav class="flex flex-wrap items-center justify-center gap-2 text-sm">
        <a
          class="btn-ghost group px-3 py-2 no-underline text-white transition-transform duration-150 hover:translate-x-0.5 hover:rotate-4 hover:skew-x-6"
          href="#/"
          aria-label="Home"
          title="Home"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-4 w-4 transition-transform duration-150 group-hover:-rotate-8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3.5 10.5 12 4l8.5 6.5" />
            <path d="M6.5 9.5V20h11V9.5" />
            <path d="M10 20v-5h4v5" />
          </svg>
        </a>
      </nav>
      <div class="flex min-w-0 w-full justify-center sm:w-auto sm:justify-end">
        <NostrAuth />
      </div>
    </div>
  </header>

  {#if route.type === 'profile'}
    <ProfilePage npub={route.npub} onPlaybackState={handlePlaybackState} />
  {:else if route.type === 'song'}
    <SongPage
      npub={route.npub}
      songId={route.songId}
      onRecentsChanged={handleRecentsChanged}
      onPlaybackState={handlePlaybackState}
    />
  {:else if isHomeLike(route)}
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

    <div class="space-y-6">
      <Recents {recents} onload={loadRecent} onremove={handleRemoveRecent} />

      <div bind:this={feedSectionEl}>
        <FeedPage onPlaybackState={handlePlaybackState} />
      </div>
    </div>
  {/if}

  <footer class="mt-8 pb-4 text-center text-xs text-gray-500">
    <a
      class="text-gray-400 no-underline transition-colors hover:text-primary"
      href="https://files.iris.to/#/npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/midi-enshittifier"
      target="_blank"
      rel="noreferrer"
    >
      Source
    </a>
    <div class="mt-2">
      <button
        type="button"
        class="egg-toggle"
        class:active={chaosMode}
        aria-pressed={chaosMode}
        title="Keyboard shortcut: §"
        onclick={toggleChaosMode}
      >
        {chaosMode ? 'extra cursed mode on' : 'press § for extra cursed mode'}
      </button>
    </div>
  </footer>

  {#if showPointerTrail && pointerTrail.length > 0}
    <div class="pointer-trail-layer" aria-hidden="true">
      {#each pointerTrail as mark (mark.id)}
        <span
          class="pointer-trail-mark"
          class:chaos={chaosMode}
          style:left={`${mark.x}px`}
          style:top={`${mark.y}px`}
          style:--trail-twist={`${mark.twist}deg`}
          style:--trail-size={`${mark.size}px`}
          style:--trail-hue={`${mark.hue}deg`}
        >
          {mark.glyph}
        </span>
      {/each}
    </div>
  {/if}
</div>
