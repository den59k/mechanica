<template>
  <div class="article-block">
    <h1>{{ props.title }}</h1>
    <TextEditorView :model-value="props.text" :decorator="defaultDecorator" :renderer="defaultRenderer">
      <template #code="{ block }">
        <TextEditorView class="code-block" :model-value="parseCode(block.text)" :decorator="codeDecorator" :parser="codeParser" />
      </template>
      <template #image="{ block }">
        <img v-if="block.image" :src="block.image?.src" height="300" />
      </template>
    </TextEditorView>
  </div>
</template>

<script lang="ts" setup>
import { TextEditorView } from 'vuewrite';

import { defaultDecorator, defaultRenderer } from '../../../common/utils/richTextComponents'
import { codeParser, codeDecorator } from '../../../common/utils/richTextCodeComponents'


const props = defineBlock({
  id: "article",
  props: {
    title: { type: "string", name: "Заголовок" },
    text: { type: "richText", name: "Описание" }
  }
})

const parseCode = (code: string) => {
  return code.split("\n").map(text => ({ text }))
}

</script>

<style lang="sass">
.article-block
  min-height: 100px
  width: 800px
  margin: 0 auto

  white-space: pre-wrap

  .code-block
    background-color: #FAFAFA  
    border-radius: 4px
    padding: 12px

</style>