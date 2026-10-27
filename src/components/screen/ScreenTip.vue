<template>
  <div v-show="tip.show" class="screen-tip" :class="{ fl: tip.flip, up: tip.up }"
    :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
    <div class="st-hd" v-if="tip.title || tip.sub">
      <b>{{ tip.title }}</b>
      <em v-if="tip.sub">{{ tip.sub }}</em>
    </div>
    <div class="st-row" v-for="(r, i) in tip.rows" :key="i">
      <span class="st-k">
        <i v-if="r.c" :style="{ background: r.c }"></i>{{ r.k }}
      </span>
      <span class="st-v">{{ r.v }}</span>
    </div>
    <div class="st-ft" v-if="tip.foot">{{ tip.foot }}</div>
  </div>
</template>

<script setup>
/* 纯展示：状态由父组件的 useScreenTip() 持有并传入 */
defineProps({ tip: { type: Object, required: true } })
</script>

<style scoped>
.screen-tip{
  position:absolute;z-index:999;pointer-events:none;
  min-width:150px;max-width:300px;padding:8px 10px;
  background:linear-gradient(160deg,rgba(10,20,34,.97),rgba(6,12,22,.97));
  border:1px solid rgba(84,144,214,.42);border-left:2px solid rgba(255,51,85,.7);
  box-shadow:0 12px 32px rgba(0,0,0,.55);
  color:#DCE9F9;font-family:'PingFang SC',-apple-system,sans-serif;
}
.screen-tip.fl{transform:translateX(-100%)}
.screen-tip.up{transform:translateY(-100%)}
.screen-tip.fl.up{transform:translate(-100%,-100%)}

.st-hd{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;padding-bottom:5px;
  border-bottom:1px solid rgba(90,150,220,.16)}
.st-hd b{font-size:12.5px;font-weight:700;color:#F2F8FF;letter-spacing:.4px}
.st-hd em{font-style:normal;font-size:11px;color:#7E97B4;margin-left:auto}

.st-row{display:flex;align-items:baseline;gap:10px;padding:2px 0;font-size:11.5px}
.st-k{color:#7E97B4;display:flex;align-items:center;gap:5px;white-space:nowrap}
.st-k i{width:6px;height:6px;border-radius:50%;flex:0 0 auto}
.st-v{margin-left:auto;font-family:var(--num-font,ui-monospace);color:#EAF4FF;
  font-variant-numeric:tabular-nums;white-space:nowrap}

.st-ft{margin-top:6px;padding-top:5px;border-top:1px dashed rgba(90,150,220,.16);
  font-size:10.5px;color:#5E7895;line-height:1.5}
</style>
