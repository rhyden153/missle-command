<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  crosshair: 'M12 2v4m0 12v4M2 12h4m12 0h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
  sound: 'm11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'm11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  collapse: 'M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 5 11 7-11 7V5Z',
  restart: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  trophy: 'M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8',
  chevron: 'm9 5 7 7-7 7',
  info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7l1-7Z',
  city: 'M3 21V9h6v12m0-18h7v18m0-9h5v9M1 21h22M5 12h.1M5 16h.1M12 6h.1M12 10h.1M12 14h.1M18 15h.1M18 18h.1',
  keyboard: 'M3 5h18v14H3V5Zm4 4h.1M11 9h.1M15 9h.1M18 9h.1M7 13h.1M11 13h.1M15 13h.1M7 16h10',
  close: 'm6 6 12 12M6 18 18 6',
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.crosshair" /></svg>
</template>
