<template>
  <el-dialog
    v-model="visible"
    title="围栏设置 - 新增"
    width="1050px"
    top="5vh"
    destroy-on-close
    :close-on-click-modal="false"
    class="fence-dialog"
    @close="handleClose"
  >
    <div class="dialog-layout">
      <!-- 左侧：地图区域 -->
      <div class="map-panel">
        <div id="fence-map-container" class="map-container"></div>

        <!-- 顶部渐变光条 -->
        <div class="map-glow-bar"></div>

        <!-- 提示浮层 -->
        <div class="map-tip">
          <el-icon><InfoFilled /></el-icon>
          点击地图或图钉选取中心点，拖动圆边或滑块调整半径
        </div>

        <!-- 回到我的位置按钮 -->
        <div class="locate-btn" @click="locateUser" title="回到我的位置">
          <el-icon><Location /></el-icon>
        </div>

        <!-- 定位成功后的雷达波纹 -->
        <transition name="fade">
          <div v-if="located" class="locate-radar"></div>
        </transition>
      </div>

      <!-- 右侧：表单区域 -->
      <div class="form-panel">
        <el-form
          :model="form"
          :rules="rules"
          ref="formRef"
          label-position="top"
          size="default"
          class="stagger-form"
        >
          <el-form-item label="围栏形状">
            <el-radio-group v-model="form.shape">
              <el-radio label="circle">圆形</el-radio>
              <el-radio label="custom" disabled>自定义</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="请输入位置">
            <el-input
              v-model="searchKeyword"
              placeholder="请先搜索地址"
              clearable
              @keyup.enter="handleSearchAddress"
            >
              <template #suffix>
                <el-icon class="search-icon" @click="handleSearchAddress"><Search /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="电子围栏名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入围栏名称" maxlength="128" />
          </el-form-item>

          <el-form-item label="所属机构" prop="org">
            <el-select v-model="form.org" placeholder="请选择所属车队" style="width: 100%;">
              <el-option label="西马物流新能源车队" value="西马物流新能源车队" />
              <el-option label="其他机构" value="其他机构" />
            </el-select>
          </el-form-item>

          <el-form-item label="围栏属性" prop="attr">
            <el-select v-model="form.attr" placeholder="请选择" style="width: 100%;">
              <el-option label="正常运营区域" value="正常运营区域" />
              <el-option label="禁行区域" value="禁行区域" />
              <el-option label="限速区域" value="限速区域" />
            </el-select>
          </el-form-item>

          <!-- 👇 半径改为无级滑块 -->
          <el-form-item label="围栏半径" prop="radius">
            <div class="radius-control">
              <el-slider
                v-model="form.radius"
                :min="50"
                :max="50000"
                :step="50"
                :marks="radiusMarks"
                :format-tooltip="formatRadiusTooltip"
                class="radius-slider"
              />
              <div class="radius-input-row">
                <el-input-number
                  v-model="form.radius"
                  :min="50"
                  :max="50000"
                  :step="100"
                  controls-position="right"
                  size="default"
                  style="width: 140px;"
                />
                <span class="radius-unit">米</span>
                <span class="radius-hint">
                  ({{ (form.radius / 1000).toFixed(2) }} km)
                </span>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="地理位置">
            <el-input
              v-model="form.location"
              type="textarea"
              :rows="2"
              readonly
              placeholder="绘制后自动显示"
              resize="none"
            />
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 底部按钮区 -->
    <template #footer>
      <div class="dialog-footer">
        <el-button class="btn-cancel" @click="visible = false">取消</el-button>
        <el-button class="btn-continue" @click="submitForm(true)" :loading="submitting">
          提交并继续创建
        </el-button>
        <el-button type="primary" class="btn-submit" @click="submitForm(false)" :loading="submitting">
          <span v-if="!submitting">提交</span>
          <span v-else>提交中...</span>
        </el-button>
      </div>
    </template>

    <!-- 提交成功的绿色对勾遮罩动画 -->
    <transition name="success">
      <div v-if="showSuccess" class="success-overlay">
        <div class="success-circle">
          <svg viewBox="0 0 52 52" class="checkmark">
            <circle cx="26" cy="26" r="25" fill="none" />
            <path fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        </div>
        <p class="success-text">围栏创建成功！</p>
      </div>
    </transition>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, InfoFilled, Location } from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import { supabase } from '@/utils/supabase'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'success'])

const visible = ref(false)
const formRef = ref(null)
const submitting = ref(false)
const searchKeyword = ref('')
const located = ref(false)
const showSuccess = ref(false)

const form = reactive({
  shape: 'circle',
  name: '',
  org: '',
  attr: '',
  radius: 1000,
  location: '',
  center: '',
})

const rules = {
  name: [{ required: true, message: '请输入围栏名称', trigger: 'blur' }],
  org: [{ required: true, message: '请选择所属机构', trigger: 'change' }],
  attr: [{ required: true, message: '请选择围栏属性', trigger: 'change' }],
  radius: [{ required: true, message: '请调整围栏半径', trigger: 'change' }],
}

// 半径滑块的刻度标记
const radiusMarks = {
  50: '50m',
  5000: '5km',
  10000: '10km',
  25000: '25km',
  50000: '50km',
}

const formatRadiusTooltip = (val) => {
  if (val < 1000) return `${val}米`
  return `${(val / 1000).toFixed(2)}公里`
}

let map = null
let circle = null
let circleEditor = null
let AMapInstance = null
let autoComplete = null
let geocoder = null
let placeSearch = null
let userMarker = null
let userLng = null
let userLat = null

const DEFAULT_CENTER = [114.305, 30.593]

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) nextTick(() => initMap())
  else destroyMap()
})
watch(visible, (val) => emit('update:modelValue', val))

// ============================================
// 初始化地图
// ============================================
const initMap = async () => {
  try {
    AMapInstance = await AMapLoader.load({
      key: '273f5c474604b71906674aac159b8f45',
      version: '2.0',
      plugins: ['AMap.CircleEditor', 'AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geolocation'],
    })
  } catch (e) {
    console.error('SDK 加载失败', e)
    ElMessage.error('高德 SDK 加载失败：' + (e.message || e))
    return
  }

  try {
    map = new AMapInstance.Map('fence-map-container', {
      zoom: 12,
      center: DEFAULT_CENTER,
      viewMode: '2D',
      mapStyle: 'amap://styles/fresh',
    })
    map.on('error', (e) => console.error('【地图错误】', e))
  } catch (e) {
    ElMessage.error('地图创建失败：' + (e.message || e))
    return
  }

  try { geocoder = new AMapInstance.Geocoder() } catch (e) { console.error(e) }
  try {
    autoComplete = new AMapInstance.AutoComplete()
    placeSearch = new AMapInstance.PlaceSearch({ map: map })
  } catch (e) { console.error(e) }

  // 启动定位
  locateUser()

  try {
    // 点击地图空白处 —— 创建/移动围栏
    map.on('click', (e) => {
      drawCircle(e.lnglat.getLng(), e.lnglat.getLat())
    })

    if (autoComplete) {
      autoComplete.on('select', (e) => {
        if (e.poi && e.poi.location) {
          map.setCenter(e.poi.location)
          map.setZoom(14)
          drawCircle(e.poi.location.lng, e.poi.location.lat)
        }
      })
    }

    // 半径实时同步到地图的圆
    watch(() => form.radius, (val) => {
      if (circle) {
        circle.setRadius(val)
        updateFormFromCircle(false) // 不再反向覆盖半径
      }
    })
  } catch (e) { console.error(e) }
}

// ============================================
// 定位
// ============================================
const locateUser = () => {
  if (!AMapInstance || !map) return
  const geolocation = new AMapInstance.Geolocation({
    enableHighAccuracy: true,
    timeout: 8000,
    zoomToAccuracy: true,
    showButton: false,
    showMarker: false,
    showCircle: false,
    panToLocation: false,
  })
  geolocation.getCurrentPosition((status, result) => {
    if (status === 'complete' && result.position) {
      const { lng, lat } = result.position
      userLng = lng
      userLat = lat
      map.setCenter([lng, lat])
      map.setZoom(14)
      addUserLocationMarker(lng, lat)
      located.value = true
    } else {
      map.setCenter(DEFAULT_CENTER)
      map.setZoom(12)
    }
  })
}

// ============================================
// 添加"我的位置"红色图钉（更精致的高分辨率 SVG）
// ============================================
const addUserLocationMarker = (lng, lat) => {
  if (userMarker && map) {
    map.remove(userMarker)
    userMarker = null
  }

  const container = document.createElement('div')
  container.className = 'user-location-marker'
  container.innerHTML = `
    <div class="pulse-ring"></div>
    <div class="pin-wrapper">
      <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pinGradient2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#F87171"/>
            <stop offset="45%" stop-color="#EF4444"/>
            <stop offset="100%" stop-color="#B91C1C"/>
          </linearGradient>
          <radialGradient id="pinHighlight" cx="35%" cy="25%" r="40%">
            <stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </radialGradient>
        </defs>
        <!-- 图钉主体 -->
        <path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20s12-11.5 12-20c0-6.627-5.373-12-12-12z"
              fill="url(#pinGradient2)"
              stroke="#ffffff"
              stroke-width="1.2"
              stroke-linejoin="round"/>
        <!-- 顶部高光 -->
        <path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20s12-11.5 12-20c0-6.627-5.373-12-12-12z"
              fill="url(#pinHighlight)"/>
        <!-- 内部白点 -->
        <circle cx="12" cy="11.5" r="4.2" fill="#ffffff"/>
        <circle cx="12" cy="11.5" r="2.4" fill="#EF4444"/>
      </svg>
    </div>
  `

  userMarker = new AMapInstance.Marker({
    position: [lng, lat],
    content: container,
    // 让图钉尖端对准坐标
    offset: new AMapInstance.Pixel(-12, -32),
    zIndex: 200,
    map: map,
  })

  // 点击图钉：弹出气泡 + 以图钉为中心创建围栏
  const infoWindow = new AMapInstance.InfoWindow({
    content: `
      <div style="padding:8px 14px; font-size:13px; color:#1E293B; line-height:1.5;">
        <div style="font-weight:600; color:#D32F2F;">📍 您当前的位置</div>
        <div style="font-size:11px; color:#64748B; margin-top:2px;">点击即可在此创建围栏</div>
      </div>
    `,
    offset: new AMapInstance.Pixel(0, -36),
  })

  userMarker.on('click', () => {
    // 1. 弹出气泡
    infoWindow.open(map, [lng, lat])

    // 2. 以图钉为中心创建围栏
    map.setCenter([lng, lat])
    drawCircle(lng, lat)

    // 3. 提示用户可继续调整
    ElMessage.success({
      message: '已以您的位置为中心创建围栏',
      duration: 2000,
    })
  })

  // 定位后 1 秒自动展开气泡，提示用户可点击
  setTimeout(() => {
    if (map) infoWindow.open(map, [lng, lat])
    setTimeout(() => infoWindow.close(), 3000)
  }, 600)
}

// ============================================
// 绘制/更新圆形围栏
// ============================================
const drawCircle = (lng, lat) => {
  form.center = `${lng.toFixed(6)},${lat.toFixed(6)}`

  if (circle) {
    circle.setCenter([lng, lat])
    circle.setRadius(form.radius)
    circleEditor.setTarget(circle)
  } else {
    circle = new AMapInstance.Circle({
      center: [lng, lat],
      radius: form.radius,
      strokeColor: '#D32F2F',
      strokeWeight: 2,
      strokeOpacity: 0.85,
      fillColor: '#D32F2F',
      fillOpacity: 0.12,
      zIndex: 10,
    })
    map.add(circle)

    circleEditor = new AMapInstance.CircleEditor(map, circle)
    circleEditor.open()
    circleEditor.on('move', updateFormFromCircle)
    circleEditor.on('adjust', updateFormFromCircle)
  }

  geocodeAddress(lng, lat)
}

// 从圆形编辑器同步数据到表单
// syncRadius=false 时不覆盖 radius（避免用户手动滑动滑块被反向覆盖）
const updateFormFromCircle = (syncRadius = true) => {
  if (!circle) return
  const c = circle.getCenter()
  form.center = `${c.getLng().toFixed(6)},${c.getLat().toFixed(6)}`
  if (syncRadius) {
    form.radius = Math.round(circle.getRadius())
  }
  geocodeAddress(c.getLng(), c.getLat())
}

const geocodeAddress = (lng, lat) => {
  if (!geocoder) return
  geocoder.getAddress([lng, lat], (status, result) => {
    if (status === 'complete' && result.regeocode) {
      form.location = result.regeocode.formattedAddress
    } else {
      form.location = `${lng}, ${lat}`
    }
  })
}

const handleSearchAddress = () => {
  if (!searchKeyword.value) {
    ElMessage.warning('请输入要搜索的地址')
    return
  }
  if (!placeSearch) return
  placeSearch.search(searchKeyword.value, (status, result) => {
    if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
      const poi = result.poiList.pois[0]
      map.setCenter(poi.location)
      map.setZoom(14)
      drawCircle(poi.location.lng, poi.location.lat)
    } else {
      ElMessage.warning('未找到该地址，请尝试更具体的关键词')
    }
  })
}

const destroyMap = () => {
  if (map) {
    map.destroy()
    map = null
    circle = null
    circleEditor = null
    geocoder = null
    autoComplete = null
    placeSearch = null
    userMarker = null
    located.value = false
    userLng = null
    userLat = null
  }
}

const handleClose = () => {
  visible.value = false
  formRef.value?.resetFields()
  Object.assign(form, {
    shape: 'circle', name: '', org: '', attr: '',
    radius: 1000, location: '', center: '',
  })
  searchKeyword.value = ''
  showSuccess.value = false
}

// ============================================
// 提交表单
// ============================================
const submitForm = (isContinue) => {
  formRef.value.validate(async (valid) => {
    if (!valid) return
    if (!form.center) {
      ElMessage.warning('请在地图上选取中心点')
      return
    }
    submitting.value = true
    try {
      const { data, error } = await supabase.functions.invoke('amap-geofence', {
        body: {
          name: form.name,
          desc: form.attr,
          center: form.center,
          radius: form.radius,
        },
      })
      if (error) throw error

      if (data.errcode === 0) {
        showSuccess.value = true
        emit('success')

        setTimeout(() => {
          showSuccess.value = false

          if (isContinue) {
            formRef.value.resetFields()
            Object.assign(form, {
              shape: 'circle', name: '', org: '', attr: '',
              radius: 1000, location: '', center: '',
            })
            searchKeyword.value = ''
            if (circle && map) { map.remove(circle); circle = null }
            if (circleEditor) { circleEditor.close(); circleEditor = null }
          } else {
            visible.value = false
          }
        }, 1200)
      } else {
        ElMessage.error(`创建失败：${data.errmsg || '未知错误'}`)
      }
    } catch (err) {
      console.error(err)
      ElMessage.error('请求失败：' + (err.message || '请检查网络'))
    } finally {
      submitting.value = false
    }
  })
}
</script>

<style scoped>
/* ==========================================
   弹窗整体
   ========================================== */
:deep(.fence-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: dialogBounceIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes dialogBounceIn {
  from { opacity: 0; transform: scale(0.92) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
:deep(.fence-dialog .el-dialog__header) {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
  position: relative;
}
:deep(.fence-dialog .el-dialog__header::after) {
  content: '';
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg,
    rgba(211, 47, 47, 0) 0%,
    rgba(211, 47, 47, 0.7) 50%,
    rgba(211, 47, 47, 0) 100%);
  animation: headerGlow 2.5s ease-in-out infinite;
}
@keyframes headerGlow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
:deep(.fence-dialog .el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1E293B;
}
:deep(.fence-dialog .el-dialog__body) { padding: 0; }

/* ==========================================
   左右分栏
   ========================================== */
.dialog-layout {
  display: flex;
  height: 65vh;
  min-height: 520px;
}

/* ==========================================
   左侧地图
   ========================================== */
.map-panel {
  flex: 1.6;
  position: relative;
  background-color: #F8FAFC;
  border-right: 1px solid #F1F5F9;
  overflow: hidden;
}
.map-container {
  width: 100%;
  height: 100%;
  animation: mapZoomIn 0.8s ease-out;
}
@keyframes mapZoomIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

.map-glow-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg,
    rgba(211, 47, 47, 0) 0%,
    rgba(211, 47, 47, 0.8) 50%,
    rgba(211, 47, 47, 0) 100%);
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.3);
  z-index: 50;
  animation: glowSlide 3s ease-in-out infinite;
}
@keyframes glowSlide {
  0%, 100% { transform: translateX(-20%); opacity: 0.6; }
  50% { transform: translateX(20%); opacity: 1; }
}

.map-tip {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.95);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #D32F2F;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  animation: tipSlideIn 0.6s ease-out 0.3s both;
}
@keyframes tipSlideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

.locate-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  background: #ffffff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  color: #64748B;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 100;
  animation: tipSlideIn 0.6s ease-out 0.4s both;
}
.locate-btn:hover {
  color: #D32F2F;
  box-shadow: 0 4px 14px rgba(211, 47, 47, 0.25);
  transform: translateY(-2px) scale(1.08);
}
.locate-btn:active { transform: scale(0.95); }

.locate-radar {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(circle at center,
    rgba(211, 47, 47, 0.06) 0%,
    rgba(211, 47, 47, 0) 60%);
  animation: radarFlash 1.5s ease-out;
}
@keyframes radarFlash {
  0% { opacity: 0; }
  30% { opacity: 1; }
  100% { opacity: 0; }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ==========================================
   右侧表单
   ========================================== */
.form-panel {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background-color: #FFFFFF;
}
.form-panel::-webkit-scrollbar { width: 4px; }
.form-panel::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }

.stagger-form :deep(.el-form-item) {
  margin-bottom: 18px;
  animation: fieldSlideIn 0.4s ease-out backwards;
}
.stagger-form :deep(.el-form-item:nth-child(1)) { animation-delay: 0.05s; }
.stagger-form :deep(.el-form-item:nth-child(2)) { animation-delay: 0.10s; }
.stagger-form :deep(.el-form-item:nth-child(3)) { animation-delay: 0.15s; }
.stagger-form :deep(.el-form-item:nth-child(4)) { animation-delay: 0.20s; }
.stagger-form :deep(.el-form-item:nth-child(5)) { animation-delay: 0.25s; }
.stagger-form :deep(.el-form-item:nth-child(6)) { animation-delay: 0.30s; }
.stagger-form :deep(.el-form-item:nth-child(7)) { animation-delay: 0.35s; }

@keyframes fieldSlideIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

:deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 13px;
  color: #475569;
  font-weight: 500;
}
:deep(.el-input__wrapper) {
  border-radius: 6px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #D32F2F inset;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(211, 47, 47, 0.15), 0 0 0 1px #D32F2F inset !important;
}
.search-icon {
  cursor: pointer;
  color: #94A3B8;
  transition: all 0.25s;
}
.search-icon:hover {
  color: #D32F2F;
  transform: scale(1.15) rotate(10deg);
}

/* ==========================================
   半径滑块（无级调节）
   ========================================== */
.radius-control {
  width: 100%;
}
.radius-slider {
  padding: 0 4px;
  margin-bottom: 4px;
}
.radius-slider :deep(.el-slider__runway) {
  background: linear-gradient(90deg, #FEE2E2 0%, #FECACA 100%);
  height: 6px;
  border-radius: 3px;
}
.radius-slider :deep(.el-slider__bar) {
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  height: 6px;
  border-radius: 3px;
}
.radius-slider :deep(.el-slider__button) {
  width: 18px;
  height: 18px;
  border: 3px solid #D32F2F;
  background: #FFFFFF;
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.35);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.radius-slider :deep(.el-slider__button:hover) {
  transform: scale(1.25);
  box-shadow: 0 4px 14px rgba(211, 47, 47, 0.5);
}
.radius-slider :deep(.el-slider__marks-text) {
  font-size: 10px;
  color: #94A3B8;
  margin-top: 8px;
}
.radius-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.radius-unit {
  font-size: 13px;
  color: #475569;
}
.radius-hint {
  font-size: 12px;
  color: #94A3B8;
  margin-left: auto;
}

/* ==========================================
   底部按钮区
   ========================================== */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  background: #F8FAFC;
  border-top: 1px solid #F1F5F9;
  position: relative;
}
.dialog-footer::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg,
    rgba(211, 47, 47, 0) 0%,
    rgba(211, 47, 47, 0.6) 50%,
    rgba(211, 47, 47, 0) 100%);
}
:deep(.dialog-footer .el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 6px;
}
:deep(.dialog-footer .el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.15);
}
:deep(.dialog-footer .el-button:active) {
  transform: translateY(0) scale(0.97);
}
.btn-cancel {
  border-color: #E2E8F0;
  color: #64748B;
}
.btn-cancel:hover {
  border-color: #D32F2F;
  color: #D32F2F;
  background: #FEF2F2;
}
.btn-continue {
  background-color: #FEF2F2;
  border-color: #FECACA;
  color: #D32F2F;
}
.btn-continue:hover {
  background-color: #FEE2E2;
  border-color: #FCA5A5;
  color: #B91C1C;
}
.btn-submit {
  background-color: #D32F2F;
  border-color: #D32F2F;
  color: #FFF;
  position: relative;
  overflow: hidden;
}
.btn-submit::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  animation: btnShine 3s ease-in-out infinite;
}
@keyframes btnShine {
  0%, 100% { left: -100%; }
  50% { left: 100%; }
}
.btn-submit:hover {
  background-color: #B91C1C;
  border-color: #B91C1C;
  box-shadow: 0 6px 16px rgba(211, 47, 47, 0.35) !important;
}

/* ==========================================
   提交成功遮罩动画
   ========================================== */
.success-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  border-radius: 12px;
}
.success-circle {
  width: 80px;
  height: 80px;
  margin-bottom: 16px;
}
.checkmark {
  width: 100%;
  height: 100%;
  stroke: #10B981;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  filter: drop-shadow(0 4px 12px rgba(16, 185, 129, 0.3));
}
.checkmark circle {
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}
.checkmark path {
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: stroke 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
}
@keyframes stroke {
  100% { stroke-dashoffset: 0; }
}
.success-text {
  font-size: 16px;
  font-weight: 600;
  color: #10B981;
  margin: 0;
  animation: successTextIn 0.5s ease-out 0.8s both;
}
@keyframes successTextIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.success-enter-active { transition: opacity 0.3s; }
.success-leave-active { transition: opacity 0.4s; }
.success-enter-from, .success-leave-to { opacity: 0; }
</style>

<!-- ==========================================
     非 scoped：地图上的红色图钉（高分辨率 SVG）
     ========================================== -->
<style>
.user-location-marker {
  position: relative;
  width: 24px;
  height: 32px;
  cursor: pointer;
}

.user-location-marker .pin-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  filter: drop-shadow(0 3px 6px rgba(185, 28, 28, 0.5));
  animation: pinDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition: transform 0.25s ease;
}
@keyframes pinDrop {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.user-location-marker:hover .pin-wrapper {
  transform: scale(1.2);
  filter: drop-shadow(0 4px 10px rgba(185, 28, 28, 0.7));
}

.user-location-marker .pulse-ring {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(211, 47, 47, 0.5);
  transform: translate(-50%, 50%);
  animation: userPulse 2s ease-out infinite;
  z-index: 1;
}
@keyframes userPulse {
  0% { transform: translate(-50%, 50%) scale(0.5); opacity: 0.9; }
  100% { transform: translate(-50%, 50%) scale(6); opacity: 0; }
}
</style>