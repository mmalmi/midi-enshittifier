<script lang="ts">
  import { nostrStore } from '$lib/nostr/store'
  import {
    loginWithExtension,
    loginWithNsec,
    logout,
    switchToLocalAutologin,
  } from '$lib/nostr/auth'

  let showNsec = $state(false)
  let nsecInput = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)

  let isLoggedIn = $derived($nostrStore.isLoggedIn)
  let npub = $derived($nostrStore.npub)
  let loginType = $derived($nostrStore.loginType)

  function shortNpub(value: string | null): string {
    if (!value) return ''
    return `${value.slice(0, 10)}...${value.slice(-6)}`
  }

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

  async function doNsecLogin() {
    busy = true
    error = null
    try {
      const ok = await loginWithNsec(nsecInput)
      if (!ok) {
        error = 'Invalid nsec'
        return
      }
      showNsec = false
      nsecInput = ''
    } finally {
      busy = false
    }
  }

  async function doLocalSwitch() {
    busy = true
    error = null
    try {
      const ok = await switchToLocalAutologin()
      if (!ok) error = 'Could not switch to local account'
    } finally {
      busy = false
    }
  }
</script>

<div class="flex items-center gap-2 text-xs">
  {#if isLoggedIn}
    <span class="text-gray-400">{loginType}</span>
    <span class="text-gray-300">{shortNpub(npub)}</span>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={doExtensionLogin}>Ext</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={() => (showNsec = !showNsec)}>Nsec</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={doLocalSwitch}>Local</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={logout}>Logout</button>
  {:else}
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={doExtensionLogin}>Login Ext</button>
    <button class="btn-ghost px-2 py-1" disabled={busy} onclick={() => (showNsec = !showNsec)}>Login Nsec</button>
  {/if}
</div>

{#if showNsec}
  <div class="mt-2 flex items-center gap-2">
    <input
      type="password"
      class="w-60 rounded-lg bg-surface-light border border-surface-lighter px-2 py-1 text-xs text-white outline-none focus:border-primary-op50"
      bind:value={nsecInput}
      placeholder="nsec1..."
      disabled={busy}
    />
    <button class="btn-secondary px-2 py-1 text-xs" disabled={busy || !nsecInput.trim()} onclick={doNsecLogin}>Use nsec</button>
  </div>
{/if}

{#if error}
  <div class="mt-1 text-xs text-red-400">{error}</div>
{/if}
