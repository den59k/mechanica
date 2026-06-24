<template>
  <svg class="vicon" v-bind="attrs[name]" aria-hidden="true" v-html="contents[name]"></svg>
</template>

<script setup lang="ts">
// Icons are individual *.svg files under src/assets/icons, bundled as raw strings
// by the ?svg-glob plugin (colors normalized to currentColor). Add an icon by
// dropping a file there — e.g. a Figma export — then <VIcon name="my-file" />.
import { contents, attrs } from "../icons?svg-glob"

defineProps<{ name: string }>()
</script>

<style lang="sass">
// Default size; per-context CSS (explicit width/height or a parent `svg` rule) overrides.
.vicon
  width: 1em
  height: 1em
  flex: none
</style>
