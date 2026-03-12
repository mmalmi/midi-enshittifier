<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import { onMount } from 'svelte'
  import { parseMidi, writeMidi, type MidiFile } from '$lib/midi'
  import { downloadBytes } from '$lib/download'
  import { loadSong, updateSongTitle } from '$lib/songs'
  import { buildProfileRoute, buildSongRoute } from '$lib/router'
  import type { EnabledEffect } from '$lib/effects'
  import type { RecentShare } from '$lib/recents'
  import { formatRelativeTime, trackInfo } from '$lib/songPresentation'
  import { fetchUserProfile, profileDisplayName } from '$lib/nostr/profiles'
  import Avatar from './Avatar.svelte'
  import Name from './Name.svelte'
  import SongWorkbench from './SongWorkbench.svelte'
  import {
    publishComment,
    subscribeComments,
    subscribeLikes,
    toggleLike,
    type CommentItem,
  } from '$lib/interactions'
  import { getNostrState, nostrStore } from '$lib/nostr/store'
  import { followPubkey, getFollowsForPubkey, unfollowPubkey } from '$lib/nostr/follows'

  interface Props {
    npub: string
    songId: string
    onRecentsChanged?: (next: RecentShare[]) => void
    onPlaybackState?: (playing: boolean) => void
  }

  let { npub, songId, onRecentsChanged, onPlaybackState }: Props = $props()

  let loading = $state(true)
  let error = $state<string | null>(null)
  let originalMidi = $state<MidiFile | null>(null)
  let enshittifiedMidi = $state<MidiFile | null>(null)
  let title = $state('')
  let fileName = $state('')
  let ownerPubkey = $state<string | null>(null)
  let ownerProfile = $state<NDKUserProfile | null>(null)
  let ownerProfileRequest = 0
  let titleEditorEl = $state<HTMLDivElement | null>(null)
  let editorEnabled = $state<EnabledEffect[]>([])
  let editorSeed = $state<number | null>(null)
  let editorShareName = $state('')
  let titleSaveBusy = $state(false)
  let titleSaveVersion = $state(0)
  let titleError = $state<string | null>(null)
  let shareBusy = $state(false)
  let shareCopied = $state(false)
  let shareError = $state<string | null>(null)

  let likeCount = $state(0)
  let userLiked = $state(false)
  let comments = $state<CommentItem[]>([])
  let commentInput = $state('')
  let postingComment = $state(false)
  let likeBusy = $state(false)

  let isFollowingOwner = $state(false)
  let followBusy = $state(false)

  let likeUnsub: (() => void) | null = null
  let commentUnsub: (() => void) | null = null

  const identifier = $derived(`${npub}/songs/${songId}`)
  const ownerDisplayName = $derived(profileDisplayName(ownerProfile))
  const currentPubkey = $derived($nostrStore.pubkey)
  const canEditTitle = $derived(Boolean(ownerPubkey && currentPubkey && ownerPubkey === currentPubkey))

  function normalizeTitleInput(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
  }

  function syncTitleEditor(value: string) {
    if (!titleEditorEl) return
    if (titleEditorEl.textContent === value) return
    titleEditorEl.textContent = value
  }

  $effect(() => {
    const currentOwnerPubkey = ownerPubkey
    const requestId = ++ownerProfileRequest

    if (!currentOwnerPubkey) {
      ownerProfile = null
      return
    }

    void fetchUserProfile(currentOwnerPubkey).then((nextProfile) => {
      if (requestId !== ownerProfileRequest) return
      ownerProfile = nextProfile
    })
  })

  $effect(() => {
    title
    if (typeof document !== 'undefined' && document.activeElement === titleEditorEl) return
    syncTitleEditor(title)
  })

  async function refreshSong() {
    loading = true
    error = null
    ownerProfile = null
    titleError = null
    shareCopied = false
    shareError = null

    try {
      const loaded = await loadSong(npub, songId)
      if (!loaded) {
        error = 'Song not found'
        return
      }

      originalMidi = parseMidi(loaded.original)
      enshittifiedMidi = parseMidi(loaded.enshittified)
      title = loaded.manifest.title
      fileName = loaded.manifest.sourceFileName
      ownerPubkey = loaded.manifest.ownerPubkey
      editorEnabled = loaded.manifest.effects.map((effect) => ({ ...effect }))
      editorSeed = loaded.manifest.seed
      editorShareName = loaded.manifest.title

      if (loaded.manifest.ownerPubkey && getNostrState().pubkey) {
        const follows = await getFollowsForPubkey(getNostrState().pubkey!)
        isFollowingOwner = follows.includes(loaded.manifest.ownerPubkey)
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load song'
    } finally {
      loading = false
    }
  }

  async function saveTitle() {
    if (!canEditTitle || titleSaveBusy) {
      syncTitleEditor(title)
      return
    }

    const nextTitle = normalizeTitleInput(titleEditorEl?.textContent ?? title) || 'Untitled song'

    if (nextTitle === title) {
      syncTitleEditor(title)
      return
    }

    titleSaveBusy = true
    titleError = null
    const previousTitle = title

    try {
      const updated = await updateSongTitle(songId, nextTitle)
      if (!updated) {
        titleError = 'Song not found.'
        await refreshSong()
        return
      }

      title = updated.title
      titleSaveVersion += 1
      if (!editorShareName.trim() || editorShareName.trim() === previousTitle.trim()) {
        editorShareName = updated.title
      }
    } catch (e) {
      titleError = e instanceof Error ? e.message : 'Failed to rename song'
      title = previousTitle
    } finally {
      titleSaveBusy = false
      syncTitleEditor(title)
    }
  }

  async function shareSong() {
    if (shareBusy) return

    shareBusy = true
    shareError = null

    try {
      const url = typeof location === 'undefined' ? buildSongRoute(npub, songId) : location.href

      if (navigator.share) {
        await navigator.share({
          title,
          text: title,
          url,
        })
        return
      }

      await navigator.clipboard.writeText(url)
      shareCopied = true
      window.setTimeout(() => {
        shareCopied = false
      }, 2000)
    } catch (e) {
      const err = e instanceof Error ? e : null
      if (err?.name === 'AbortError') return
      shareError = err?.message || 'Failed to share song'
    } finally {
      shareBusy = false
    }
  }

  function download(kind: 'original' | 'enshittified') {
    const midi = kind === 'original' ? originalMidi : enshittifiedMidi
    if (!midi) return

    downloadBytes(`${kind}_${songId}.mid`, writeMidi(midi), 'audio/midi')
  }

  async function doLike() {
    if (likeBusy) return
    likeBusy = true
    try {
      await toggleLike(identifier, {
        ownerPubkey,
        currentlyLiked: userLiked,
      })

      if (!userLiked) {
        userLiked = true
        likeCount += 1
      }
    } finally {
      likeBusy = false
    }
  }

  async function postComment() {
    if (postingComment || !commentInput.trim()) return
    postingComment = true

    try {
      await publishComment(identifier, commentInput, { ownerPubkey })
      commentInput = ''
    } finally {
      postingComment = false
    }
  }

  async function toggleFollowOwner() {
    if (!ownerPubkey || followBusy) return
    followBusy = true
    try {
      if (isFollowingOwner) {
        const ok = await unfollowPubkey(ownerPubkey)
        if (ok) isFollowingOwner = false
      } else {
        const ok = await followPubkey(ownerPubkey)
        if (ok) isFollowingOwner = true
      }
    } finally {
      followBusy = false
    }
  }

  onMount(() => {
    void refreshSong()

    likeUnsub = subscribeLikes(identifier, (snapshot) => {
      likeCount = snapshot.count
      userLiked = snapshot.userLiked
    })

    commentUnsub = subscribeComments(identifier, (rows) => {
      comments = rows
    })

    return () => {
      likeUnsub?.()
      commentUnsub?.()
    }
  })
</script>

{#if loading}
  <div class="card text-gray-400">Loading song...</div>
{:else if error}
  <div class="card text-red-400">{error}</div>
  {:else if originalMidi && enshittifiedMidi}
  <div class="space-y-4">
    <div class="card">
      {#if canEditTitle}
        <div
          bind:this={titleEditorEl}
          class="min-w-0 rounded-lg border border-transparent px-1 py-0.5 text-xl font-semibold text-white outline-none transition-colors focus:border-primary-op40 focus:bg-surface-light/60 hover:border-white/10"
          contenteditable="true"
          role="textbox"
          tabindex="0"
          spellcheck="false"
          data-testid="song-title-editor"
          data-save-version={titleSaveVersion}
          aria-label="Song title"
          oninput={() => {
            titleError = null
          }}
          onblur={saveTitle}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              titleEditorEl?.blur()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              titleError = null
              syncTitleEditor(title)
              titleEditorEl?.blur()
            }
          }}
        >
          {title}
        </div>
      {:else}
        <div class="text-xl font-semibold">{title}</div>
      {/if}
      <div class="mt-1 text-xs text-gray-500">{trackInfo(originalMidi)}</div>
      {#if titleSaveBusy}
        <div class="mt-2 text-xs text-gray-400">Saving title...</div>
      {:else if titleError}
        <div class="mt-2 text-xs text-red-400">{titleError}</div>
      {/if}

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        {#if ownerPubkey}
          <a
            class="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface px-3 py-1 no-underline text-white transition-colors hover:bg-surface-lighter"
            href={buildProfileRoute(npub)}
            title={`Open ${ownerDisplayName} profile`}
          >
            <Avatar
              pubkey={ownerPubkey}
              profile={ownerProfile}
              size={24}
              title={ownerDisplayName}
              wrapperClass="border border-surface-lighter shadow-sm"
            />
            <Name npub={npub} profile={ownerProfile} class="min-w-0 text-xs font-medium text-white" />
          </a>
        {/if}
        {#if ownerPubkey && ownerPubkey !== getNostrState().pubkey}
          <button class="btn-secondary px-3 py-1" onclick={toggleFollowOwner} disabled={followBusy}>
            {followBusy ? '...' : isFollowingOwner ? 'Unfollow' : 'Follow'}
          </button>
        {/if}
        <button class="btn-ghost px-3 py-1" onclick={doLike} disabled={likeBusy}>
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill={userLiked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20.5 4.9 13.9a4.77 4.77 0 0 1 0-6.82 4.57 4.57 0 0 1 6.66 0L12 7.53l.44-.45a4.57 4.57 0 0 1 6.66 0 4.77 4.77 0 0 1 0 6.82L12 20.5Z" />
          </svg>
          {userLiked ? 'Liked' : 'Like'} ({likeCount})
        </button>
        <button class="btn-ghost px-3 py-1" onclick={shareSong} disabled={shareBusy}>
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 8.5 19.5 4m0 0H16m3.5 0V7.5" />
            <path d="M19 13v4.25c0 .97-.78 1.75-1.75 1.75H6.75A1.75 1.75 0 0 1 5 17.25V6.75C5 5.78 5.78 5 6.75 5H11" />
          </svg>
          {shareBusy ? 'Sharing...' : shareCopied ? 'Copied' : 'Share'}
        </button>
        <button class="btn-secondary px-3 py-1" onclick={() => download('original')}>
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4.5v10" />
            <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
            <path d="M5 18.5h14" />
          </svg>
          Download Original
        </button>
      </div>
      {#if shareError}
        <div class="mt-2 text-xs text-red-400">{shareError}</div>
      {/if}
    </div>

    <SongWorkbench
      {originalMidi}
      fileName={fileName || `${songId}.mid`}
      bind:enabled={editorEnabled}
      bind:shareName={editorShareName}
      bind:enshittifiedMidi
      bind:lastSeed={editorSeed}
      showFileCard={false}
      onRecentsChanged={onRecentsChanged}
      {onPlaybackState}
    />

    <div class="card">
      <div class="text-sm font-medium mb-2">Comments ({comments.length})</div>

      <div class="flex gap-2 mb-3">
        <input
          type="text"
          class="flex-1 rounded-lg bg-surface-light border border-surface-lighter px-3 py-2 text-sm text-white outline-none focus:border-primary-op50"
          placeholder="Write a comment"
          bind:value={commentInput}
        />
        <button class="btn-secondary px-3 py-2 text-xs" disabled={postingComment || !commentInput.trim()} onclick={postComment}>Post</button>
      </div>

      {#if comments.length === 0}
        <div class="text-xs text-gray-400">No comments yet.</div>
      {:else}
        <div class="space-y-2">
          {#each comments as comment (comment.id)}
            <div class="rounded-lg bg-surface p-2">
              <div class="text-xs text-gray-400"><Name pubkey={comment.pubkey} /> · {formatRelativeTime(comment.createdAt)}</div>
              <div class="text-sm mt-1">{comment.content}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
