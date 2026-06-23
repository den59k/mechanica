<template>
  <div class="new-block">
    {{ props.name }}
    <img :src="props.image.src" width="400"/>
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>

const props = defineBlock({
  id: "newBlock",
  name: "Блок с картинкой",
  props: {
    name: { type: "string" },
    image: { type: "image" }
  }
})

</script>

<style lang="sass">
.new-block
  margin-top: 50px
  text-align: center
  min-height: 40px
  display: flex
  flex-direction: column
  align-items: center
</style>