import { nip19 } from 'nostr-tools'

const ADJECTIVES = [
  'brave',
  'calm',
  'clever',
  'cosmic',
  'curious',
  'daring',
  'dreamy',
  'electric',
  'fancy',
  'fierce',
  'gentle',
  'glowing',
  'happy',
  'icy',
  'jolly',
  'lively',
  'lucky',
  'mellow',
  'mighty',
  'nimble',
  'playful',
  'proud',
  'quiet',
  'rapid',
  'shiny',
  'sly',
  'smart',
  'snappy',
  'sparkly',
  'swift',
  'wild',
  'witty',
]

const ANIMALS = [
  'alpaca',
  'badger',
  'bear',
  'beaver',
  'bison',
  'cat',
  'cheetah',
  'cougar',
  'coyote',
  'crane',
  'crow',
  'deer',
  'dolphin',
  'eagle',
  'falcon',
  'fox',
  'gecko',
  'goose',
  'hawk',
  'ibex',
  'jaguar',
  'lemur',
  'lynx',
  'moose',
  'otter',
  'owl',
  'panda',
  'panther',
  'raven',
  'seal',
  'shark',
  'tiger',
  'wolf',
  'yak',
  'zebra',
]

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1)
}

function simpleHash(seed: string): [number, number] {
  let h1 = 0
  let h2 = 0

  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i)
    h1 = (h1 * 31 + c) >>> 0
    h2 = (h2 * 37 + c) >>> 0
  }

  return [h1 & 0xff, h2 & 0xff]
}

export function animalName(seed: string): string {
  const clean = seed.trim()
  if (!clean) return 'Anonymous Animal'

  const [h1, h2] = simpleHash(clean)
  const adjective = ADJECTIVES[h1 % ADJECTIVES.length]
  const animal = ANIMALS[h2 % ANIMALS.length]
  return `${capitalize(adjective)} ${capitalize(animal)}`
}

export function pubkeyFromNpub(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub)
    if (decoded.type !== 'npub') return null
    return decoded.data as string
  } catch {
    return null
  }
}

export function animalNameFromNpub(npub: string | null | undefined): string {
  if (!npub) return 'Anonymous Animal'
  const pubkey = pubkeyFromNpub(npub)
  if (!pubkey) return 'Anonymous Animal'
  return animalName(pubkey)
}

export function animalNameFromPubkey(pubkey: string | null | undefined): string {
  if (!pubkey) return 'Anonymous Animal'
  return animalName(pubkey)
}
