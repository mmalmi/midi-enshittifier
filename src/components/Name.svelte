<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import { animalNameFromNpub, animalNameFromPubkey } from '$lib/animalName'
  import { fetchUserProfile, profileDisplayName, pubkeyFromProfileInput } from '$lib/nostr/profiles'

  interface Props {
    pubkey?: string | null
    npub?: string | null
    profile?: NDKUserProfile | null
    class?: string
  }

  let {
    pubkey = null,
    npub = null,
    profile: suppliedProfile = null,
    class: className = '',
  }: Props = $props()

  let loadedProfile = $state<NDKUserProfile | null>(null)
  let requestId = 0

  let resolvedPubkey = $derived(pubkeyFromProfileInput(pubkey) ?? pubkeyFromProfileInput(npub))
  let fallbackName = $derived(
    resolvedPubkey ? animalNameFromPubkey(resolvedPubkey) : animalNameFromNpub(npub),
  )
  let activeProfile = $derived(suppliedProfile ?? loadedProfile)
  let explicitName = $derived(profileDisplayName(activeProfile, ''))
  let hasProfileName = $derived(Boolean(explicitName.trim()))
  let displayName = $derived(hasProfileName ? explicitName : fallbackName)
  let classes = $derived(hasProfileName ? className : `${className} italic opacity-70`.trim())

  $effect(() => {
    loadedProfile = suppliedProfile ?? null
  })

  $effect(() => {
    const currentPubkey = resolvedPubkey
    const nextRequestId = ++requestId

    if (!currentPubkey) {
      loadedProfile = null
      return
    }

    if (suppliedProfile) return

    loadedProfile = null

    void fetchUserProfile(currentPubkey).then((nextProfile) => {
      if (nextRequestId !== requestId) return
      if (suppliedProfile) return
      loadedProfile = nextProfile
    })
  })
</script>

<span class={classes}>{displayName}</span>
