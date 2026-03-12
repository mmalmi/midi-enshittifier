<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import { nip19 } from 'nostr-tools'
  import Avatar from './Avatar.svelte'
  import Name from './Name.svelte'
  import { buildProfileRoute } from '$lib/router'
  import { animalNameFromPubkey } from '$lib/animalName'
  import { fetchUserProfile, profileDisplayName } from '$lib/nostr/profiles'
  import { nostrStore } from '$lib/nostr/store'
  import {
    loginWithExtension,
    loginWithNsec,
    logout,
  } from '$lib/nostr/auth'

  let showNsec = $state(false)
  let nsecInput = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let profile = $state<NDKUserProfile | null>(null)
  let profileRequest = 0
  let lastAutoSubmittedNsec = $state('')

  let isLoggedIn = $derived($nostrStore.isLoggedIn)
  let npub = $derived($nostrStore.npub)
  let pubkey = $derived($nostrStore.pubkey)

  let displayName = $derived(profileDisplayName(profile, animalNameFromPubkey(pubkey)))

  $effect(() => {
    const currentPubkey = pubkey
    const requestId = ++profileRequest

    if (!currentPubkey) {
      profile = null
      return
    }

    void fetchUserProfile(currentPubkey).then((nextProfile) => {
      if (requestId !== profileRequest) return
      profile = nextProfile
    })
  })

  async function doExtensionLogin() {
    busy = true
    error = null
    try {
      const ok = await loginWithExtension()
      if (!ok) error = 'Extension login failed'
    } finally {
      busy = false
    }
  }

  function isValidNsec(value: string): boolean {
    try {
      return nip19.decode(value.trim()).type === 'nsec'
    } catch {
      return false
    }
  }

  function closeNsecLogin(force = false) {
    if (busy && !force) return
    showNsec = false
    nsecInput = ''
    error = null
    lastAutoSubmittedNsec = ''
  }

  function toggleNsecLogin() {
    if (showNsec) {
      closeNsecLogin()
      return
    }

    error = null
    lastAutoSubmittedNsec = ''
    showNsec = true
  }

  async function doNsecLogin(value = nsecInput) {
    const trimmed = value.trim()
    if (!trimmed) return

    busy = true
    error = null
    try {
      const ok = await loginWithNsec(trimmed)
      if (!ok) {
        error = 'Invalid nsec'
        return
      }
      closeNsecLogin(true)
    } finally {
      busy = false
    }
  }

  $effect(() => {
    const trimmed = nsecInput.trim()

    if (!showNsec || busy || !trimmed) return
    if (trimmed === lastAutoSubmittedNsec) return
    if (!isValidNsec(trimmed)) return

    lastAutoSubmittedNsec = trimmed
    void doNsecLogin(trimmed)
  })
</script>

<div class="flex items-center gap-2 text-xs">
  {#if isLoggedIn}
    {#if npub && pubkey}
      <a class="no-underline" href={buildProfileRoute(npub)} title="Open profile">
        <Avatar
          pubkey={pubkey}
          {profile}
          size={28}
          title={displayName}
          wrapperClass="border border-surface-lighter shadow-sm"
        />
      </a>
    {/if}
    <Name {pubkey} {profile} class="text-gray-300" />
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={doExtensionLogin}>Ext</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={toggleNsecLogin}>Nsec</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={logout}>Logout</button>
  {:else}
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={doExtensionLogin}>Login Ext</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={toggleNsecLogin}>Login Nsec</button>
  {/if}
</div>

{#if showNsec}
  <div class="mt-2 flex items-center gap-2">
    <input
      type="password"
      class="w-60 rounded-lg bg-surface-light border border-surface-lighter px-2 py-1 text-xs text-white outline-none focus:border-primary-op50"
      bind:value={nsecInput}
      placeholder="nsec1..."
      autocomplete="off"
      disabled={busy}
    />
    <button class="btn-ghost px-2 py-1 text-xs" disabled={busy} onclick={() => closeNsecLogin()}>Cancel</button>
  </div>
{/if}

{#if error}
  <div class="mt-1 text-xs text-red-400">{error}</div>
{/if}
