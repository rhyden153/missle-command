<script setup lang="ts">
const props = defineProps<{ score: number; detail: string; names: LeaderboardName[] }>()
defineEmits<{ skip: [] }>()
const { submit, savedInitials } = useLeaderboard()
const initials = ref('')
const input = ref<HTMLInputElement>()
const saving = ref(false)
const error = ref('')
const placed = ref<LeaderboardRanks | null>(null)
const placedText = computed(() => [placed.value?.weekly && `#${placed.value.weekly} this week`, placed.value?.allTime && `#${placed.value.allTime} all time`].filter(Boolean).join(' · ') || 'Score saved')
onMounted(() => {
  initials.value = savedInitials().replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3)
  input.value?.focus({ preventScroll: true })
})
function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  initials.value = target.value = target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3)
}
async function save() {
  if (saving.value || placed.value) return
  if (initials.value.length !== 3) { error.value = 'Enter three letters.'; return }
  saving.value = true
  error.value = ''
  try {
    placed.value = await submit({ initials: initials.value, score: props.score, detail: props.detail }, props.names)
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || 'Couldn’t reach the leaderboard. Try again.'
  } finally { saving.value = false }
}
</script>

<template>
  <div class="leaderboard-submission">
    <p v-if="placed" role="status">{{ placedText }}</p>
    <form v-else @submit.prevent="save">
      <label>YOU MADE THE BOARD. ENTER THREE INITIALS
        <input ref="input" :value="initials" aria-label="Leaderboard initials" maxlength="3" autocomplete="off" autocapitalize="characters" :spellcheck="false" :disabled="saving" @input="onInput">
      </label>
      <div class="score-submit-actions"><button class="text-button" :disabled="saving">{{ saving ? 'SAVING…' : 'SAVE SCORE' }}</button><button type="button" class="text-button" :disabled="saving" @click="$emit('skip')">Skip</button></div>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
  </div>
</template>
