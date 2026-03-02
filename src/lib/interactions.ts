import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk'
import { getNdk } from './nostr/ndk'
import { getNostrState } from './nostr/store'

interface InteractionEventLike {
  id?: string
  pubkey: string
  content: string
  tags: string[][]
  created_at?: number
}

interface Runtime {
  subscribe: (filter: NDKFilter, onEvent: (event: InteractionEventLike) => void) => () => void
  publish: (event: { kind: number; content: string; tags: string[][]; created_at?: number }) => Promise<void>
  currentUserPubkey: () => string | null
  nowUnix: () => number
}

function createDefaultRuntime(): Runtime {
  return {
    subscribe: (filter, onEvent) => {
      const ndk = getNdk()
      const sub = ndk.subscribe(filter, { closeOnEose: false })
      sub.on('event', (event: NDKEvent) => {
        onEvent({
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          tags: event.tags,
          created_at: event.created_at,
        })
      })
      return () => sub.stop()
    },
    publish: async (event) => {
      const ndk = getNdk()
      const ndkEvent = new NDKEvent(ndk)
      ndkEvent.kind = event.kind
      ndkEvent.content = event.content
      ndkEvent.tags = event.tags
      if (event.created_at) ndkEvent.created_at = event.created_at
      await ndkEvent.publish()
    },
    currentUserPubkey: () => getNostrState().pubkey,
    nowUnix: () => Math.floor(Date.now() / 1000),
  }
}

let runtime: Runtime = createDefaultRuntime()

export interface LikeSnapshot {
  count: number
  pubkeys: Set<string>
  userLiked: boolean
}

export interface CommentItem {
  id: string
  pubkey: string
  content: string
  createdAt: number
}

export function subscribeLikes(
  identifier: string,
  onUpdate: (snapshot: LikeSnapshot) => void,
): () => void {
  const likes = new Set<string>()
  const filter = {
    kinds: [17],
    '#i': [identifier],
  } as unknown as NDKFilter

  return runtime.subscribe(
    filter,
    (event) => {
      const content = event.content?.trim() || '+'
      if (content !== '+' && content !== '') return
      likes.add(event.pubkey)

      const me = runtime.currentUserPubkey()
      onUpdate({
        count: likes.size,
        pubkeys: new Set(likes),
        userLiked: !!me && likes.has(me),
      })
    },
  )
}

export interface ToggleLikeContext {
  ownerPubkey?: string | null
  nhash?: string | null
  currentlyLiked: boolean
}

export function buildLikeTags(identifier: string, ctx: Omit<ToggleLikeContext, 'currentlyLiked'>): string[][] {
  const tags: string[][] = [
    ['i', identifier],
    ['k', 'song'],
  ]
  if (ctx.nhash) tags.push(['i', ctx.nhash])
  if (ctx.ownerPubkey) tags.push(['p', ctx.ownerPubkey])
  return tags
}

export async function toggleLike(identifier: string, ctx: ToggleLikeContext): Promise<boolean> {
  const me = runtime.currentUserPubkey()
  if (!me) throw new Error('Must be logged in to like')

  await runtime.publish({
    kind: 17,
    content: ctx.currentlyLiked ? '' : '+',
    tags: buildLikeTags(identifier, ctx),
    created_at: runtime.nowUnix(),
  })

  return true
}

export function subscribeComments(
  identifier: string,
  onUpdate: (comments: CommentItem[]) => void,
): () => void {
  const byId = new Map<string, CommentItem>()

  return runtime.subscribe(
    {
      kinds: [1111],
      '#i': [identifier],
    },
    (event) => {
      if (!event.id) return
      byId.set(event.id, {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at ?? 0,
      })

      const comments = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt)
      onUpdate(comments)
    },
  )
}

export interface PublishCommentContext {
  ownerPubkey?: string | null
  nhash?: string | null
}

export function buildCommentTags(identifier: string, ctx: PublishCommentContext): string[][] {
  const tags: string[][] = [
    ['i', identifier],
    ['k', 'song'],
  ]
  if (ctx.nhash) tags.push(['i', ctx.nhash])
  if (ctx.ownerPubkey) tags.push(['p', ctx.ownerPubkey])
  return tags
}

export async function publishComment(
  identifier: string,
  content: string,
  ctx: PublishCommentContext,
): Promise<void> {
  const me = runtime.currentUserPubkey()
  if (!me) throw new Error('Must be logged in to comment')
  const trimmed = content.trim()
  if (!trimmed) throw new Error('Comment cannot be empty')

  await runtime.publish({
    kind: 1111,
    content: trimmed,
    tags: buildCommentTags(identifier, ctx),
    created_at: runtime.nowUnix(),
  })
}

export function __setInteractionsRuntimeForTests(next: Runtime): void {
  runtime = next
}

export function __resetInteractionsRuntimeForTests(): void {
  runtime = createDefaultRuntime()
}
