<template>
  <div class="mech-composer__component-fields">
    <template v-for="(sub, key) in properties" :key="key">
      <!-- Leaf field: editable *and* bindable to a block variable (⚡). A bound
           field shows its chip instead of the control, so $bind values never
           reach a control that expects a scalar. -->
      <div v-if="isLeaf(sub)" class="mech-composer__field">
        <span class="mech-composer__field-label">{{ sub.label ?? humanize(String(key)) }}</span>
        <BindField :node-id="node.id" :field-key="String(key)" :schema="sub" :name="String(key)">
          <FieldControl
            :model-value="node.data[key]"
            :schema="sub"
            @update:model-value="set(String(key), $event)"
          />
        </BindField>
      </div>
      <!-- Object / array props keep the standard nested form (no binding yet). -->
      <SchemaField v-else :model="node.data" :prop="String(key)" :schema="sub" :label="sub.label ?? humanize(String(key))" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ContentBlock } from 'mechanica-shared'
import { composerStoreKey } from '../lib/keys'
import { humanize } from '../../props-panel/humanize'
import FieldControl from '../../fields/FieldControl.vue'
import SchemaField from '../../props-panel/SchemaField.vue'
import BindField from './BindField.vue'

const props = defineProps<{ node: ContentBlock; schema: Record<string, any> }>()
const store = inject(composerStoreKey)!

const properties = computed<Record<string, any>>(() => props.schema.properties ?? {})
const isLeaf = (schema: Record<string, any>): boolean =>
  !!schema.format || (schema.type !== 'object' && schema.type !== 'array')
const set = (key: string, value: unknown) => store.setData(props.node.id, { [key]: value })
</script>
