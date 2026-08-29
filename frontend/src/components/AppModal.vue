<script setup lang="ts">
import { Modal } from 'ant-design-vue'
import type { CSSProperties } from 'vue'

withDefaults(
  defineProps<{
    open: boolean
    title?: string
    width?: number | string
    /** 传 null 则隐藏底部按钮区（纯展示/进度弹窗） */
    footer?: 'default' | null
    okText?: string
    cancelText?: string
    okDisabled?: boolean
    okDanger?: boolean
    closable?: boolean
    bodyStyle?: CSSProperties
  }>(),
  {
    title: '',
    width: 600,
    footer: 'default',
    okText: '确定',
    cancelText: '取消',
    okDisabled: false,
    okDanger: false,
    closable: true,
  },
)

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'ok'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <!-- U1 保真封装：AntD Modal 复刻原 modal-overlay 视觉（头部品牌色染/顶部对齐/大圆角），
       同时获得 ESC 关闭、焦点管理、层级管理等 AntD 机制。样式见 style.css 的 .app-modal。
       显式导入 Modal 组件（不依赖全局 Antd 注册，composable 中 h() 调用亦可用）。 -->
  <Modal
    :open="open"
    :title="title"
    :width="width"
    :ok-text="okText"
    :cancel-text="cancelText"
    :ok-button-props="{ disabled: okDisabled, danger: okDanger }"
    :footer="footer === null ? null : undefined"
    :closable="closable"
    :body-style="bodyStyle"
    class="app-modal"
    @update:open="(v: boolean) => emit('update:open', v)"
    @ok="emit('ok')"
    @cancel="emit('cancel')"
  >
    <slot />
  </Modal>
</template>
