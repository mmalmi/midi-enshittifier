<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  let {
    src,
    alt,
    playing,
    size = 96,
    inline = false,
  }: {
    src: string
    alt: string
    playing: boolean
    size?: number
    inline?: boolean
  } = $props()

  let logoWandering = $state(false)
  let logoReturning = $state(false)
  let logoX = $state(0)
  let logoY = $state(0)
  let logoWrapEl: HTMLDivElement | null = null

  let wanderVx = 0
  let wanderVy = 0
  let cursorX = 0
  let cursorY = 0
  let cursorSeenAt = 0
  let prevPlaying = false

  let wanderDelay: ReturnType<typeof setTimeout> | null = null
  let wanderTicker: ReturnType<typeof setInterval> | null = null
  let returnTicker: ReturnType<typeof setInterval> | null = null

  onMount(() => {
    const onMouseMove = (event: MouseEvent) => {
      cursorX = event.clientX
      cursorY = event.clientY
      cursorSeenAt = Date.now()
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
    }
  })

  $effect(() => {
    if (playing === prevPlaying) return
    prevPlaying = playing
    handlePlaybackState(playing)
  })

  function handlePlaybackState(isPlaying: boolean) {
    if (isPlaying) {
      stopReturning()
      stopWandering()
      wanderDelay = setTimeout(() => {
        if (!playing) return
        logoWandering = true
        if (wanderVx === 0 && wanderVy === 0) {
          wanderVx = (Math.random() - 0.5) * 2
          wanderVy = (Math.random() - 0.5) * 2
        }
        wanderTicker = setInterval(() => {
          if (!playing) return
          stepWander()
        }, 200)
      }, 9000)
      return
    }

    stopWandering()
    startReturn()
  }

  function stepWander() {
    const pad = 100
    const edgeOverflow = Math.max(320, Math.min(window.innerHeight * 0.9, 900))
    const minX = -Math.max(40, window.innerWidth / 2 - pad) - edgeOverflow
    const maxX = Math.max(40, window.innerWidth / 2 - pad) + edgeOverflow
    const rect = logoWrapEl?.getBoundingClientRect()
    const pageHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight,
    )
    const logoHeight = rect?.height ?? 96
    const baseTop = rect ? rect.top + window.scrollY - logoY : 0
    const minY = -baseTop - edgeOverflow
    const maxY = Math.max(minY + 40, pageHeight - baseTop - logoHeight + edgeOverflow)

    // Random walk with gentle direction jitter.
    wanderVx += (Math.random() - 0.5) * 5
    wanderVy += (Math.random() - 0.5) * 3.2
    const len = Math.hypot(wanderVx, wanderVy) || 1
    const speed = 10 + Math.random() * 6
    wanderVx = (wanderVx / len) * speed
    wanderVy = (wanderVy / len) * speed

    // If cursor is nearby, push velocity away from it.
    if (logoWrapEl && Date.now() - cursorSeenAt < 1300) {
      const rect = logoWrapEl.getBoundingClientRect()
      const logoCx = rect.left + rect.width / 2
      const logoCy = rect.top + rect.height / 2
      const dx = logoCx - cursorX
      const dy = logoCy - cursorY
      const dist = Math.hypot(dx, dy)
      if (dist < 220) {
        const repel = (220 - dist) / 220
        const nd = dist || 1
        wanderVx += (dx / nd) * (8 + repel * 16)
        wanderVy += (dy / nd) * (6 + repel * 12)
      }
    }

    let nextX = logoX + wanderVx
    let nextY = logoY + wanderVy

    if (nextX < minX || nextX > maxX) {
      wanderVx *= -1
      nextX = Math.max(minX, Math.min(maxX, nextX))
    }
    if (nextY < minY || nextY > maxY) {
      wanderVy *= -1
      nextY = Math.max(minY, Math.min(maxY, nextY))
    }

    logoX = nextX
    logoY = nextY
  }

  function startReturn() {
    stopReturning()
    if (Math.hypot(logoX, logoY) < 3) {
      logoX = 0
      logoY = 0
      wanderVx = 0
      wanderVy = 0
      return
    }

    logoReturning = true
    returnTicker = setInterval(() => {
      stepReturn()
    }, 210)
  }

  function stepReturn() {
    const dist = Math.hypot(logoX, logoY)
    if (dist < 8) {
      logoX = 0
      logoY = 0
      wanderVx = 0
      wanderVy = 0
      stopReturning()
      return
    }

    const toHomeX = -logoX / dist
    const toHomeY = -logoY / dist
    const pull = 5.5 + Math.min(10, dist * 0.02)

    // Gentle wobble so Pepe "wanders back" instead of sliding on rails.
    wanderVx = wanderVx * 0.72 + toHomeX * pull + (Math.random() - 0.5) * 1.7
    wanderVy = wanderVy * 0.72 + toHomeY * pull + (Math.random() - 0.5) * 1.4

    const speed = Math.hypot(wanderVx, wanderVy) || 1
    const maxStep = 5 + Math.min(9, dist * 0.025)
    if (speed > maxStep) {
      wanderVx = (wanderVx / speed) * maxStep
      wanderVy = (wanderVy / speed) * maxStep
    }

    logoX += wanderVx
    logoY += wanderVy
  }

  function stopWandering() {
    logoWandering = false
    if (wanderDelay != null) {
      clearTimeout(wanderDelay)
      wanderDelay = null
    }
    if (wanderTicker != null) {
      clearInterval(wanderTicker)
      wanderTicker = null
    }
  }

  function stopReturning() {
    logoReturning = false
    if (returnTicker != null) {
      clearInterval(returnTicker)
      returnTicker = null
    }
  }

  onDestroy(() => {
    stopWandering()
    stopReturning()
  })
</script>

<div
  bind:this={logoWrapEl}
  class="logo-wrap"
  class:inline={inline}
  class:wander={logoWandering}
  class:returning={logoReturning}
  style:--logo-x={`${logoX}px`}
  style:--logo-y={`${logoY}px`}
>
  <img
    {src}
    {alt}
    class="app-logo"
    class:jammin={playing}
    style:width={`${size}px`}
    style:max-width={inline ? `${size}px` : '28vw'}
    loading="lazy"
  />
</div>
