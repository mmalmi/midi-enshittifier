import { BlossomStore } from '@hashtree/core'
import { signEventTemplate } from './nostr/ndk'
import { getBlossomServers } from './runtimeConfig'

interface SignedBlossomAuthEvent {
  kind: number
  created_at: number
  content: string
  tags: string[][]
  pubkey: string
  id: string
  sig: string
}

export function createBlossomStore(): BlossomStore {
  return new BlossomStore({
    servers: getBlossomServers(),
    signer: async (event): Promise<SignedBlossomAuthEvent> => {
      const signed = await signEventTemplate(event)
      return {
        kind: signed.kind ?? event.kind,
        created_at: signed.created_at ?? event.created_at,
        content: signed.content ?? event.content,
        tags: signed.tags ?? event.tags,
        pubkey: signed.pubkey ?? '',
        id: signed.id ?? '',
        sig: signed.sig ?? '',
      }
    },
  })
}
