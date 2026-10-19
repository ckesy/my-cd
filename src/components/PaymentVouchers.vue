<template>
  <el-dialog
    :model-value="modelValue"
    :title="title || '付款凭据'"
    width="520px"
    append-to-body
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div v-if="!images.length" class="pv-empty">这次付款没有上传凭据</div>

    <template v-else>
      <div v-if="imgList.length" class="pv-grid">
        <el-image
          v-for="(img, i) in imgList"
          :key="img.fileID"
          :src="img.url"
          :preview-src-list="imgList.map((x) => x.url)"
          :initial-index="i"
          fit="cover"
          class="pv-thumb"
          preview-teleported
        >
          <template #error><div class="pv-thumb-err">图片加载失败</div></template>
        </el-image>
      </div>

      <div v-if="fileList.length" class="pv-files">
        <div v-for="f in fileList" :key="f.fileID" class="pv-file">
          <span class="pv-file-ic">件</span>
          <span class="pv-file-n" :title="f.name">{{ f.name }}</span>
          <a v-if="f.url" :href="f.url" target="_blank" rel="noopener" class="pv-file-a">打开</a>
          <span v-else class="pv-file-a dis">链接失效</span>
        </div>
      </div>

      <div class="pv-tip">凭据存在云存储，链接是临时的；过期后重新打开这个弹窗即可。</div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import app from '@/utils/supabase'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  images: { type: Array, default: () => [] },
  title: { type: String, default: '付款凭据' },
})
const emit = defineEmits(['update:modelValue'])

const urls = ref({})
const loading = ref(false)

const withUrl = computed(() =>
  (props.images || []).map((img) => ({
    ...img,
    url: urls.value[img.fileID] || '',
    isImage: isImageName(img.name || img.fileID),
  }))
)
const imgList = computed(() => withUrl.value.filter((x) => x.isImage && x.url))
/* 非图片，或图片临时链接没拿到 —— 都退化成文件行，别让凭据凭空消失 */
const fileList = computed(() => withUrl.value.filter((x) => !x.isImage || !x.url))

function isImageName(name) {
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(String(name || ''))
}

async function loadUrls() {
  const ids = (props.images || []).map((x) => x.fileID).filter(Boolean)
  if (!ids.length) return
  loading.value = true
  try {
    const res = await app.getTempFileURL({ fileList: ids })
    const map = {}
    ;(res.fileList || []).forEach((f) => {
      if (f.tempFileURL) map[f.fileID] = f.tempFileURL
    })
    urls.value = map
  } catch (e) {
    console.warn('[付款凭据] 临时链接获取失败', e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    const need = (props.images || []).some((x) => x.fileID && !urls.value[x.fileID])
    if (need) loadUrls()
  }
)
</script>

<style scoped>
.pv-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 12.5px;
  color: #94a3b8;
}

.pv-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.pv-thumb {
  width: 96px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eef2f7;
  cursor: zoom-in;
  background: #f8fafc;
}

.pv-thumb-err {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #94a3b8;
}

.pv-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pv-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}

.pv-file-ic {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.pv-file-n {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pv-file-a {
  font-size: 12px;
  color: #c8102e;
  font-weight: 600;
  text-decoration: none;
  flex: 0 0 auto;
}

.pv-file-a.dis { color: #cbd5e1; font-weight: 400; }

.pv-tip {
  margin-top: 12px;
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.7;
}
</style>
