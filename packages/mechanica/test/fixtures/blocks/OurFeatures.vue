<template>
  <div class="our-features">
    <div v-for="item in props.features" class="our-features__item">
      <div class="title">{{ item.title }}</div>
      <div class="subtitle">{{ item.subtitle }}</div>

    </div>
  </div>
</template>

<script lang="ts" setup>

const props = defineBlock({
  props: {
    features: { 
      type: "array", 
      items: { title: "string", subtitle: "string" } 
    }
  }
})

</script>

<style lang="sass">
.our-features
  min-height: 100px
  display: flex
  max-width: 800px
  margin: 0 auto

.our-features__item
  flex: 1 1 50px

  .title
    font-weight: 700
  

</style>