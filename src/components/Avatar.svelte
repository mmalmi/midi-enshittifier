<script lang="ts">
  import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
  import { minidenticon } from 'minidenticons'
  import { profileDisplayName, profilePictureUrl } from '$lib/nostr/profiles'

  interface Props {
    pubkey: string
    profile?: NDKUserProfile | null
    size?: number
    title?: string
    wrapperClass?: string
  }

  let {
    pubkey,
    profile = null,
    size = 48,
    title = '',
    wrapperClass = '',
  }: Props = $props()

  let imageLoaded = $state(false)
  let imageFailed = $state(false)

  let fallbackTitle = $derived(`${pubkey.slice(0, 8)}...`)
  let label = $derived(title || profileDisplayName(profile, fallbackTitle))
  let imageUrl = $derived(profilePictureUrl(profile))
  let identiconUrl = $derived(`data:image/svg+xml;utf8,${encodeURIComponent(minidenticon(pubkey))}`)

  $effect(() => {
    pubkey
    imageUrl
    imageLoaded = false
    imageFailed = false
  })
</script>

<div
  class={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-light ${wrapperClass}`}
  style={`width: ${size}px; height: ${size}px;`}
  title={label}
>
  <img class="h-full w-full object-cover" src={identiconUrl} alt={label} />

  {#if imageUrl && !imageFailed}
    <img
      class={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
      src={imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      onload={() => {
        imageLoaded = true
      }}
      onerror={() => {
        imageFailed = true
      }}
    />
  {/if}
</div>
