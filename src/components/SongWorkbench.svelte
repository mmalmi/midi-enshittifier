<script lang="ts">
  import { writeMidi, type MidiFile } from '$lib/midi'
  import { effects, enshittify, type EnabledEffect } from '$lib/effects'
  import { publishSong } from '$lib/songs'
  import { getNostrState } from '$lib/nostr/store'
  import { restoreOrBootstrapSession } from '$lib/nostr/auth'
  import { addRecent, type RecentShare } from '$lib/recents'
  import { buildShareUrl, shareMidi } from '$lib/sharing'
  import EffectsPanel from './EffectsPanel.svelte'
  import Player from './Player.svelte'

  interface Props {
    originalMidi: MidiFile
    fileName: string
    enabled?: EnabledEffect[]
    shareName?: string
    enshittifiedMidi?: MidiFile | null
    lastSeed?: number | null
    allowReset?: boolean
    onReset?: () => void
    onPlaybackState?: (playing: boolean) => void
    onRecentsChanged?: (next: RecentShare[]) => void
  }

  let {
    originalMidi,
    fileName,
    enabled = $bindable([]),
    shareName = $bindable(''),
    enshittifiedMidi = $bindable<MidiFile | null>(null),
    lastSeed = $bindable<number | null>(null),
    allowReset = false,
    onReset,
    onPlaybackState,
    onRecentsChanged,
  }: Props = $props()

  let copied = $state(false)
  let publishing = $state(false)
  let publishError = $state<string | null>(null)
  let showAdvanced = $state(false)

  function defaultRecordName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return ''
    return trimmed.replace(/\.[^/.]+$/, '')
  }

  function trackInfo(midi: MidiFile): string {
    const tracks = midi.tracks.filter((t) => t.notes.length > 0).length
    const notes = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
    let duration = 0

    for (const track of midi.tracks) {
      for (const note of track.notes) {
        duration = Math.max(duration, note.time + note.duration)
      }
    }

    const minutes = Math.floor(duration / 60)
    const seconds = Math.floor(duration % 60)
    return `${tracks} tracks · ${notes} notes · ${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  $effect(() => {
    originalMidi
    fileName
    copied = false
    publishError = null
    showAdvanced = false
  })

  function doEnshittify() {
    if (enabled.length === 0) return
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

      const nextRecents = addRecent({
        nhash: payload.nhash,
        fileName,
        recordName: shareName.trim() || undefined,
        config: { effects: enabled, seed: lastSeed ?? 0 },
      })

      onRecentsChanged?.(nextRecents)
    } catch {
      const info = JSON.stringify({ effects: enabled, seed: lastSeed })
      await navigator.clipboard.writeText(info)
      copied = true
      setTimeout(() => (copied = false), 2000)
    }
  }

  async function publishCurrent() {
    if (!enshittifiedMidi) return

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

      location.hash = `#/u/${encodeURIComponent(result.ownerNpub)}`
    } catch (e) {
      publishError = e instanceof Error ? e.message : 'Publishing failed'
    } finally {
      publishing = false
    }
  }
</script>

<div class="card mb-4 flex items-center justify-between">
  <div>
    <div class="text-sm font-medium truncate">{fileName}</div>
    <div class="text-xs text-gray-500">{trackInfo(originalMidi)}</div>
  </div>
  {#if allowReset && onReset}
    <button class="text-xs text-gray-500 hover:text-primary" onclick={() => onReset()}>
      change
    </button>
  {/if}
</div>

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

<div class="mb-4">
  <Player
    original={originalMidi}
    enshittified={enshittifiedMidi}
    {onPlaybackState}
  />
</div>

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
