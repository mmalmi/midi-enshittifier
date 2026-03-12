<script lang="ts">
  import type { Effect, EnabledEffect } from '$lib/effects'

  let {
    effects,
    enabled = $bindable([]),
  }: {
    effects: Effect[]
    enabled: EnabledEffect[]
  } = $props()

  function toggle(effect: Effect) {
    const idx = enabled.findIndex((e) => e.id === effect.id)
    if (idx >= 0) {
      enabled = enabled.filter((e) => e.id !== effect.id)
    } else {
      enabled = [...enabled, { id: effect.id, intensity: effect.defaultIntensity }]
    }
  }

  function setIntensity(id: string, v: number) {
    enabled = enabled.map((e) => (e.id === id ? { ...e, intensity: v } : e))
  }

  function isOn(id: string) {
    return enabled.some((e) => e.id === id)
  }

  function intensity(id: string) {
    return enabled.find((e) => e.id === id)?.intensity ?? 0
  }

  function enableAll() {
    enabled = effects.map((e) => ({ id: e.id, intensity: e.defaultIntensity }))
  }

  function disableAll() {
    enabled = []
  }

  function randomize() {
    enabled = effects
      .filter(() => Math.random() < 0.6)
      .map((e) => ({ id: e.id, intensity: Math.round((0.1 + Math.random() * 0.9) * 20) / 20 }))
    // ensure at least one
    if (enabled.length === 0) {
      const e = effects[Math.floor(Math.random() * effects.length)]
      enabled = [{ id: e.id, intensity: Math.round((0.3 + Math.random() * 0.7) * 20) / 20 }]
    }
  }

  function randomizeLevels() {
    if (enabled.length === 0) return
    enabled = enabled.map((effect) => ({
      ...effect,
      intensity: Math.round((0.1 + Math.random() * 0.9) * 20) / 20,
    }))
  }
</script>

<div class="space-y-3">
  <div class="mb-2 flex items-center justify-between gap-3">
    <h2 class="text-sm font-bold uppercase tracking-wider text-gray-300">
      Effects
    </h2>
    <div class="flex flex-wrap gap-2">
      <button class="btn-ghost px-2.5 py-1 text-xs" onclick={randomizeLevels} disabled={enabled.length === 0}>
        🎚 levels
      </button>
      <button class="btn-ghost px-2.5 py-1 text-xs" onclick={randomize}>
        🎲 random
      </button>
      <button class="btn-ghost px-2.5 py-1 text-xs" onclick={enableAll}>
        all
      </button>
      <button class="btn-ghost px-2.5 py-1 text-xs" onclick={disableAll}>
        none
      </button>
    </div>
  </div>

  {#each effects as effect}
    {@const on = isOn(effect.id)}
    <div
      class="card flex items-center gap-3 transition-all duration-150"
      class:border-primary-op30={on}
    >
      <button
        class="w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all duration-150 shrink-0"
        class:bg-primary={on}
        class:shadow-lg={on}
        class:shadow-primary-op25={on}
        class:bg-surface-lighter={!on}
        onclick={() => toggle(effect)}
      >
        {effect.emoji}
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium leading-tight">{effect.name}</div>
        <div class="text-xs text-gray-500 truncate">{effect.description}</div>
      </div>
      {#if on}
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={intensity(effect.id)}
          oninput={(e) => setIntensity(effect.id, parseFloat(e.currentTarget.value))}
          class="w-20 shrink-0"
        />
      {/if}
    </div>
  {/each}
</div>
