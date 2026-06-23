<template>
  <div class="headline" :class="cn({ align: props.alignment[0] })">
    <h1>{{ props.name }}</h1>
    <div>{{ props.subtitle }}</div>
    <div>{{ props.subtitle2 }}</div>
    <div>{{ props.alignment }}</div>
    <video v-if="props.video" :src="props.video.src" muted autoplay style="height: 300px"/>
  </div>
</template> 

<script lang="ts" setup>
import { cn } from 'mechanica';

const props = defineBlock({
  group: "layout",
  name: "Заглавный блок",
  props: {
    name: { type: "string", name: "Название" },
    video: { type: "file?", accept: "video/*" },
    subtitle: { type: "string" },
    subtitle2: { type: "string" },
    alignment: { type: "array", format: "multiselect", items: { type: "string", enum: [ "left", "center", "right" ] } }
  }
})

</script>

<style lang="sass">
.headline
  height: 300px
  display: flex
  align-items: center
  width: 800px
  margin: 0 auto 
  display: flex
  flex-direction: column
  text-align: center

  &.align-left
    text-align: left
    align-items: flex-start

  &.align-right
    text-align: right
    align-items: flex-end

</style>