<template>
  <div class="codeblock">
    <span v-if="props.language" class="codeblock__lang">{{ props.language }}</span>
    <pre class="codeblock__pre"><code>{{ props.code }}</code></pre>
  </div>
</template>

<script setup lang="ts">
const props = defineBlock({
  name: 'Code block',
  category: 'Docs',
  description: 'A monospaced code sample with an optional language label',
  props: {
    language: { type: 'string', default: 'bash', label: 'Language' },
    code: { type: 'string', format: 'text', default: 'bun install\nbun run dev' },
  },
})
</script>

<style scoped>
.codeblock {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--ink-section);
  overflow: hidden;
}
.codeblock__lang {
  position: absolute;
  top: 9px;
  right: 13px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #888da0;
}
.codeblock__pre {
  margin: 0;
  padding: 18px 20px;
  overflow-x: auto;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 13.5px;
  line-height: 1.65;
  color: #e7e9f2;
}
.codeblock__pre code {
  white-space: pre;
}
</style>
