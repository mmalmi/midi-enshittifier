<script lang="ts">
  import { writeMidi, type MidiFile } from '$lib/midi'
  import { downloadBytes } from '$lib/download'
  import { effects, enshittify, type EnabledEffect } from '$lib/effects'
  import { publishSong } from '$lib/songs'
  import { getNostrState } from '$lib/nostr/store'
  import { restoreOrBootstrapSession } from '$lib/nostr/auth'
  import { addRecent, type RecentShare } from '$lib/recents'
  import { defaultRecordName, trackInfo } from '$lib/songPresentation'
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
    showFileCard?: boolean
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
    showFileCard = true,
    allowReset = false,
    onReset,
    onPlaybackState,
    onRecentsChanged,
  }: Props = $props()

  let copied = $state(false)
  let publishing = $state(false)
  let publishError = $state<string | null>(null)
  let showAdvanced = $state(false)

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
    downloadBytes(`enshittified_${fileName}`, writeMidi(enshittifiedMidi), 'audio/midi')
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

{#if showFileCard}
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
{/if}

<div class="mb-4">
  <Player
    original={originalMidi}
    enshittified={enshittifiedMidi}
    {onPlaybackState}
  />
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

<div class="mb-4 overflow-hidden rounded-2xl border border-surface-lighter bg-surface">
  <button
    class="flex w-full cursor-pointer items-center justify-between gap-4 border-none bg-transparent px-4 py-3 text-left transition-all duration-150 hover:bg-surface-light"
    onclick={() => (showAdvanced = !showAdvanced)}
    data-testid="advanced-toggle"
    aria-expanded={showAdvanced}
  >
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-lighter bg-surface-light text-sm text-white transition-transform duration-150"
        class:rotate-90={showAdvanced}
      >
        &#9654;
      </div>
      <div class="min-w-0">
        <div class="text-sm font-semibold text-white">Effect Stack</div>
        <div class="text-xs text-gray-400">
          Show, hide, and tune the MIDI damage.
        </div>
      </div>
    </div>
    <div class="shrink-0 rounded-full border border-primary-op30 bg-primary-op10 px-3 py-1 text-xs font-medium text-white">
      {enabled.length}/{effects.length} active
    </div>
  </button>
  {#if showAdvanced}
    <div class="border-t border-surface-lighter px-3 py-3">
      <EffectsPanel {effects} bind:enabled />
    </div>
  {/if}
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
