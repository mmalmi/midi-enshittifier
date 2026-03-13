<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { MidiFile } from '$lib/midi'
  import { parseMidi } from '$lib/midi'
  import { MidiPlayer } from '$lib/player'
  import { buildSongRoute } from '$lib/router'
  import { formatRelativeTime } from '$lib/songPresentation'
  import { loadSong, type SongSummary } from '$lib/songs'
  import Avatar from './Avatar.svelte'
  import Name from './Name.svelte'
  import ListRow from './ListRow.svelte'

  interface Props {
    song: SongSummary
    showOwner?: boolean
    showDelete?: boolean
    deleteBusy?: boolean
    activePlaybackId?: string | null
    onActivatePlayback?: ((id: string) => void) | null
    onPlaybackState?: ((id: string, playing: boolean) => void) | null
    onDelete?: ((song: SongSummary) => void) | null
  }

  let {
    song,
    showOwner = false,
    showDelete = false,
    deleteBusy = false,
    activePlaybackId = null,
    onActivatePlayback = null,
    onPlaybackState = null,
    onDelete = null,
  }: Props = $props()

  let player: MidiPlayer | null = null

  let originalMidi = $state<MidiFile | null>(null)
  let enshittifiedMidi = $state<MidiFile | null>(null)
  let loadingAudio = $state(false)
  let playing = $state(false)
  let playError = $state<string | null>(null)
  let which = $state<'original' | 'enshittified' | null>(null)
  let playReq = $state(0)
  let currentTime = $state(0)
  let duration = $state(0)

  let rowId = $derived(`${song.ownerNpub}:${song.id}`)
  let route = $derived(buildSongRoute(song.ownerNpub, song.id))
  let originalLoading = $derived(which === 'original' && loadingAudio)
  let enshittifiedLoading = $derived(which === 'enshittified' && loadingAudio)
  let originalPlaying = $derived(which === 'original' && playing)
  let enshittifiedPlaying = $derived(which === 'enshittified' && playing)
  let playbackProgress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0)

  function getPlayer(): MidiPlayer {
    if (player) return player

    player = new MidiPlayer()
    player.onProgress((t, d) => {
      currentTime = t
      duration = d
    })
    player.onEnd(() => {
      if (playing) {
        playing = false
        onPlaybackState?.(rowId, false)
      }
      currentTime = 0
      duration = 0
      which = null
      loadingAudio = false
      originalMidi = null
      enshittifiedMidi = null
    })

    return player
  }

  onDestroy(() => {
    stop()
  })

  function stop(clearWhich = true, cancelPending = true, releaseMidi = true) {
    if (cancelPending) playReq += 1
    const wasPlaying = playing
    player?.stop()
    playing = false
    loadingAudio = false
    playError = null
    currentTime = 0
    duration = 0
    if (clearWhich) which = null
    if (releaseMidi) {
      originalMidi = null
      enshittifiedMidi = null
    }
    if (wasPlaying) {
      onPlaybackState?.(rowId, false)
    }
  }

  async function ensureLoaded() {
    if (originalMidi && enshittifiedMidi) return

    const loaded = await loadSong(song.ownerNpub, song.id)
    if (!loaded) throw new Error('Song not found')

    originalMidi = parseMidi(loaded.original)
    enshittifiedMidi = parseMidi(loaded.enshittified)
  }

  async function play(version: 'original' | 'enshittified') {
    const req = playReq + 1
    stop(false, false, false)
    playReq = req
    onActivatePlayback?.(rowId)
    loadingAudio = true
    playError = null
    currentTime = 0
    duration = 0
    which = version

    try {
      await ensureLoaded()
      const midi = version === 'original' ? originalMidi : enshittifiedMidi
      if (!midi || req !== playReq) return

      const activePlayer = getPlayer()
      await activePlayer.play(midi)
      if (req !== playReq || which !== version) return

      loadingAudio = false
      playing = activePlayer.playing
      duration = activePlayer.duration
      if (playing) {
        onPlaybackState?.(rowId, true)
      }
    } catch (e) {
      if (req !== playReq) return
      loadingAudio = false
      playing = false
      which = null
      playError = e instanceof Error ? e.message : 'Playback failed'
      originalMidi = null
      enshittifiedMidi = null
      onPlaybackState?.(rowId, false)
    }
  }

  function toggle(version: 'original' | 'enshittified') {
    if (loadingAudio) return
    if (which === version && playing) {
      stop()
      return
    }
    void play(version)
  }

  $effect(() => {
    if (activePlaybackId && activePlaybackId !== rowId && (playing || loadingAudio)) {
      stop()
    }
  })

  function seekToRatio(ratio: number) {
    if (!player || !which || duration <= 0) return
    const nextTime = Math.max(0, Math.min(duration, duration * ratio))
    currentTime = nextTime
    player.seek(nextTime)
  }
</script>

<ListRow
  href={route}
  showPlaybackTrack={playing}
  playbackActive={playing}
  playbackLoading={loadingAudio}
  playbackProgress={playbackProgress}
  playbackInteractive={Boolean(which) && duration > 0}
  onPlaybackSeek={seekToRatio}
>
  {#snippet body()}
    <div class="min-w-0 w-full">
      <div class="truncate text-sm font-medium">{song.title}</div>
      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
        {#if showOwner}
          <div class="flex min-w-0 items-center gap-2">
            <Avatar
              pubkey={song.ownerPubkey}
              size={18}
              wrapperClass="border border-surface-lighter shadow-sm"
            />
            <Name
              npub={song.ownerNpub}
              class="inline-block max-w-40 overflow-hidden text-ellipsis whitespace-nowrap align-bottom text-gray-400 sm:max-w-56"
            />
          </div>
          <span aria-hidden="true" class="text-gray-500">·</span>
        {/if}
        <span class="shrink-0">{formatRelativeTime(song.createdAt)}</span>
      </div>
      {#if playError}
        <div class="mt-1 text-xs text-red-400">{playError}</div>
      {/if}
    </div>
  {/snippet}

  {#snippet actions()}
    <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
      <button
        type="button"
        class="btn-ghost min-w-16 px-3 py-1.5 text-xs"
        onclick={() => toggle('original')}
        disabled={loadingAudio}
        aria-label={originalPlaying ? `Stop original ${song.title}` : `Play original ${song.title}`}
        title="Play original"
      >
        {#if originalLoading}
          🦄
        {:else if originalPlaying}
          ⏹ Orig
        {:else}
          ▶ Orig
        {/if}
      </button>

      <button
        type="button"
        class="btn-secondary min-w-16 px-3 py-1.5 text-xs"
        onclick={() => toggle('enshittified')}
        disabled={loadingAudio}
        aria-label={enshittifiedPlaying ? `Stop enshittified ${song.title}` : `Play enshittified ${song.title}`}
        title="Play enshittified"
      >
        {#if enshittifiedLoading}
          🦄
        {:else if enshittifiedPlaying}
          ⏹ Ensh
        {:else}
          ▶ Ensh
        {/if}
      </button>

      {#if showDelete && onDelete}
        <button
          type="button"
          class="btn-ghost col-span-2 px-2 py-2 text-red-300 hover:text-red-100 sm:col-span-1"
          onclick={() => onDelete(song)}
          disabled={deleteBusy}
          aria-label={`Delete ${song.title}`}
          title="Delete song"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4.75C8 4.34 8.34 4 8.75 4h6.5c.41 0 .75.34.75.75V6" />
            <path d="M6.75 6l.9 12.08A2 2 0 0 0 9.64 20h4.72a2 2 0 0 0 1.99-1.92L17.25 6" />
            <path d="M10 10.25v5.5" />
            <path d="M14 10.25v5.5" />
          </svg>
        </button>
      {/if}
    </div>
  {/snippet}
</ListRow>
