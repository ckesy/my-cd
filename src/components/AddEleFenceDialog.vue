<template>
  <el-dialog v-model="visible" :title="isEdit ? '围栏设置 - 编辑' : '围栏设置 - 新增'" width="1050px" top="5vh" destroy-on-close
    append-to-body
    :close-on-click-modal="false" class="fence-dialog" @close="handleClose">
    <div class="dialog-layout">
      <div class="map-panel">
        <div id="fence-map-container" class="map-container"></div>
        <div class="map-glow-bar"></div>
        <div class="map-tip">
          <el-icon>
            <InfoFilled />
          </el-icon>
          {{ mapTipText }}
        </div>
        <div class="locate-btn" @click="locateUser" title="回到我的位置">
          <el-icon>
            <Location />
          </el-icon>
        </div>
        <transition name="fade">
          <div v-if="located" class="locate-radar"></div>
        </transition>
      </div>

      <div class="form-panel">
        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" size="default" class="stagger-form"
          status-icon>
          <el-form-item label="围栏形状">
            <el-radio-group v-model="form.shape" @change="handleShapeChange" :disabled="isEdit">
              <el-radio label="circle">圆形</el-radio>
              <el-radio label="polygon">多边形</el-radio>
              <el-radio label="polyline">线形</el-radio>
              <el-radio label="district">行政区划</el-radio>
            </el-radio-group>
            <div v-if="isEdit" class="edit-hint">编辑模式下不可修改围栏形状</div>
          </el-form-item>

          <el-form-item v-if="form.shape !== 'district'" label="请输入位置">
            <el-input v-model="searchKeyword" placeholder="请先搜索地址" clearable @keyup.enter="handleSearchAddress">
              <template #suffix>
                <el-icon class="search-icon" @click="handleSearchAddress">
                  <Search />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="电子围栏名称" prop="name">
            <el-input v-model="form.name" placeholder="仅支持中文、英文、数字、下划线和横线" maxlength="128" show-word-limit clearable
              @input="handleNameInput" @blur="handleNameBlur">
              <template #suffix>
                <el-icon v-if="nameChecking" class="is-loading name-status-icon">
                  <Loading />
                </el-icon>
                <el-icon v-else-if="nameValidated && !nameExists && form.name" class="name-status-icon success">
                  <CircleCheck />
                </el-icon>
                <el-icon v-else-if="nameExists && form.name" class="name-status-icon error">
                  <CircleClose />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item label="所属机构" prop="org">
            <el-select v-model="form.org" placeholder="请选择所属车队" style="width: 100%;" filterable>
              <el-option v-for="o in orgOptions" :key="o.id" :label="o.name" :value="o.name" />
              <template #empty>
                <div style="padding: 16px; text-align: center; color: #94A3B8; font-size: 12.5px;">
                  暂无机构，请先去"组织管理"创建
                </div>
              </template>
            </el-select>
          </el-form-item>

          <el-form-item label="围栏属性" prop="attr">
            <el-select v-model="form.attr" placeholder="请选择" style="width: 100%;">
              <el-option label="正常运营区域" value="正常运营区域" />
              <el-option label="禁行区域" value="禁行区域" />
              <el-option label="限速区域" value="限速区域" />
            </el-select>
          </el-form-item>

          <el-form-item v-if="form.shape === 'circle'" label="围栏半径" prop="radius">
            <div class="radius-control">
              <el-slider v-model="form.radius" :min="50" :max="50000" :step="50" :marks="radiusMarks"
                :format-tooltip="formatRadiusTooltip" class="radius-slider" />
              <div class="radius-input-row">
                <el-input-number v-model="form.radius" :min="50" :max="50000" :step="100" controls-position="right"
                  size="default" style="width: 140px;" />
                <span class="radius-unit">米</span>
                <span class="radius-hint">({{ (form.radius / 1000).toFixed(2) }} km)</span>
              </div>
            </div>
          </el-form-item>

          <el-form-item v-if="form.shape === 'polyline'" label="沿线偏移距离" prop="bufferradius">
            <div class="radius-control">
              <el-slider v-model="form.bufferradius" :min="1" :max="300" :step="1"
                :marks="{ 1: '1m', 100: '100m', 300: '300m' }" class="radius-slider" />
              <div class="radius-input-row">
                <el-input-number v-model="form.bufferradius" :min="1" :max="300" :step="1" controls-position="right"
                  size="default" style="width: 140px;" />
                <span class="radius-unit">米</span>
              </div>
            </div>
          </el-form-item>

          <template v-if="form.shape === 'district'">
            <el-form-item label="省 / 直辖市" prop="province">
              <el-select v-model="form.province" placeholder="请选择省份" style="width: 100%;"
                @change="handleProvinceChange">
                <el-option v-for="p in provinceOptions" :key="p.adcode" :label="p.name" :value="p.adcode" />
              </el-select>
            </el-form-item>
            <el-form-item label="市 / 区" prop="city">
              <el-select v-model="form.city" placeholder="请选择市/区" style="width: 100%;" @change="handleCityChange">
                <el-option v-for="c in cityOptions" :key="c.adcode" :label="c.name" :value="c.adcode" />
              </el-select>
            </el-form-item>
          </template>

          <el-form-item v-if="form.shape !== 'district'" label="坐标点">
            <el-input v-model="form.pointsDisplay" type="textarea" :rows="2" readonly :placeholder="pointsPlaceholder"
              resize="none" />
          </el-form-item>

          <el-form-item label="地理位置">
            <el-input v-model="form.location" type="textarea" :rows="2" readonly placeholder="绘制后自动显示" resize="none" />
          </el-form-item>

          <el-form-item v-if="form.lastActionTime" label="操作时间">
            <div class="time-tag">
              <el-icon>
                <Clock />
              </el-icon>
              <span>{{ form.lastActionText }}：{{ form.lastActionTime }}</span>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button class="btn-cancel" @click="visible = false">取消</el-button>
        <el-button v-if="!isEdit" class="btn-continue" @click="submitForm(true)" :loading="submitting">
          提交并继续创建
        </el-button>
        <el-button type="primary" class="btn-submit" @click="submitForm(false)" :loading="submitting"
          :disabled="nameExists">
          <span v-if="!submitting">{{ isEdit ? '保存修改' : '提交' }}</span>
          <span v-else>提交中...</span>
        </el-button>
      </div>
    </template>

    <!-- 提交中动画遮罩 -->
    <transition name="loading-fade">
      <div v-if="submitting" class="submit-loading-overlay">
        <div class="submit-loading-content">
          <div class="submit-ring">
            <svg viewBox="0 0 100 100" width="120" height="120">
              <circle cx="50" cy="50" r="42" class="ring-track" />
              <circle cx="50" cy="50" r="42" class="ring-progress" :style="{ strokeDashoffset: ringOffset }" />
            </svg>
            <div class="ring-percent">{{ Math.round(submitProgress) }}%</div>
          </div>
          <div class="submit-text">{{ submitText }}</div>
          <div class="submit-bar">
            <div class="submit-bar-inner" :style="{ width: submitProgress + '%' }"></div>
          </div>
          <div class="submit-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    </transition>

    <!-- 成功对勾动画 -->
    <transition name="success">
      <div v-if="showSuccess" class="success-overlay">
        <div class="success-circle">
          <svg viewBox="0 0 52 52" class="checkmark">
            <circle cx="26" cy="26" r="25" fill="none" />
            <path fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        </div>
        <p class="success-text">{{ isEdit ? '围栏更新成功！' : '围栏创建成功！' }}</p>
      </div>
    </transition>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, nextTick, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, InfoFilled, Location, Clock, Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import AMapLoader from '@amap/amap-jsapi-loader'
import dayjs from 'dayjs'
import { supabase } from '@/utils/supabase'

const props = defineProps({
  modelValue: Boolean,
  editData: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'success'])

const visible = ref(false)
const formRef = ref(null)
const submitting = ref(false)
const searchKeyword = ref('')
const located = ref(false)
const showSuccess = ref(false)

const API_BASE = 'https://wuxian-token-d0guymjkpadcd1f22-1447716425.ap-shanghai.app.tcloudbase.com'

// ============================================================
// 当前登录用户 & 机构信息
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const isSubAccount = !!currentUser.isSubAccount
const myAccount = currentUser.masterAccount || currentUser.account || ''

// ⭐ 子账号机构信息
const myOrgName = ref(isSubAccount ? String(currentUser.orgName || '').trim() || null : null)
const myOrgLevel = ref(isSubAccount ? (Number(currentUser.orgLevel) || 1) : null)

const isRootOrgSubAccount = computed(() =>
  isSubAccount && Number(myOrgLevel.value) === 1
)
const needOrgFilter = computed(() =>
  isCustomer && isSubAccount && Number(myOrgLevel.value) >= 2
)

// 兜底反查
const loadMyOrgInfo = async () => {
  if (!isCustomer || !isSubAccount) return
  if (myOrgName.value && myOrgLevel.value) return
  if (!currentUser.orgId) return
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, level')
      .eq('id', currentUser.orgId)
      .maybeSingle()
    if (data) {
      if (data.name) myOrgName.value = String(data.name).trim()
      myOrgLevel.value = Number(data.level) || 1
    }
  } catch (e) { }
}

// ============================================================
// 所属机构下拉选项
//   二级机构子账号：只显示自己机构
//   一级机构子账号 / 主账号 / 管理员：显示全部（按 level 排序）
// ============================================================
const orgOptions = ref([])

const loadOrgOptions = async () => {
  try {
    let q = supabase
      .from('organizations')
      .select('id, name, level, parent_id, is_root, customer_id')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) q = q.eq('owner_account', myAccount)
    const { data, error } = await q
    if (error) throw error

    let list = data || []

    // ⭐ 二级机构子账号：只显示自己机构
    if (needOrgFilter.value && myOrgName.value) {
      list = list.filter(o => o.name === myOrgName.value)
      // 兜底：如果 organizations 表里没有，构造一条虚拟项（但值为真名）
      if (list.length === 0) {
        list = [{ id: '__self__', name: myOrgName.value, level: myOrgLevel.value, isSelf: true }]
      }
    }

    orgOptions.value = list
  } catch (e) {
    console.error('加载组织失败：', e)
  }
}

// ============================================================
// 提交动画进度
// ============================================================
const submitProgress = ref(0)
const submitText = ref('正在准备...')
let progressTimer = null

const isEdit = computed(() => !!(props.editData && props.editData.gfid))

const RING_LENGTH = 263.89
const ringOffset = computed(() => RING_LENGTH * (1 - submitProgress.value / 100))

// ============================================================
// 围栏名称重名校验
// ============================================================
const nameChecking = ref(false)
const nameExists = ref(false)
const nameValidated = ref(false)
let nameCheckTimer = null

const form = reactive({
  shape: 'circle',
  name: '',
  org: '',
  attr: '',
  radius: 1000,
  bufferradius: 50,
  center: '',
  points: '',
  pointsDisplay: '',
  province: '',
  city: '',
  adcode: '',
  location: '',
  lastActionTime: '',
  lastActionText: '',
})

const validateName = async (rule, value, callback) => {
  if (!value) { callback(new Error('请输入围栏名称')); return }
  if (value.length > 128) { callback(new Error('围栏名称不能超过 128 个字符')); return }
  const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/
  if (!validPattern.test(value)) {
    callback(new Error('围栏名称仅支持中文、英文字母、数字、下划线和横线'))
    return
  }
  if (nameExists.value) {
    callback(new Error(`围栏名称「${value}」已存在，请修改后重试`))
    return
  }
  if (!nameValidated.value) {
    const exists = await checkNameExists(value)
    if (exists) {
      nameExists.value = true
      callback(new Error(`围栏名称「${value}」已存在，请修改后重试`))
      return
    }
    nameValidated.value = true
  }
  callback()
}

const checkNameExists = async (name) => {
  try {
    let query = supabase.from('ele_fences').select('id, gfid, name').eq('name', name)
    if (isEdit.value && props.editData && props.editData.id) {
      query = query.neq('id', props.editData.id)
    }
    const { data, error } = await query.limit(1)
    if (error) { console.warn('重名校验失败：', error); return false }
    return data && data.length > 0
  } catch (e) { console.warn('重名校验异常：', e); return false }
}

const handleNameInput = () => {
  nameExists.value = false
  nameValidated.value = false
  if (nameCheckTimer) clearTimeout(nameCheckTimer)

  const currentName = form.name.trim()
  if (!currentName || currentName.length < 2) return

  nameCheckTimer = setTimeout(async () => {
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/
    if (!validPattern.test(currentName)) return

    nameChecking.value = true
    const exists = await checkNameExists(currentName)
    nameChecking.value = false

    if (exists) {
      nameExists.value = true
      nameValidated.value = false
      formRef.value?.validateField('name').catch(() => { })
    } else {
      nameExists.value = false
      nameValidated.value = true
    }
  }, 500)
}

const handleNameBlur = () => {
  if (nameCheckTimer) { clearTimeout(nameCheckTimer); nameCheckTimer = null }
  formRef.value?.validateField('name').catch(() => { })
}

const rules = {
  name: [{ required: true, validator: validateName, trigger: 'blur' }],
  org: [{ required: true, message: '请选择所属机构', trigger: 'change' }],
  attr: [{ required: true, message: '请选择围栏属性', trigger: 'change' }],
}

const radiusMarks = { 50: '50m', 5000: '5km', 10000: '10km', 25000: '25km', 50000: '50km' }
const formatRadiusTooltip = (val) => val < 1000 ? val + '米' : (val / 1000).toFixed(2) + '公里'

const mapTipText = computed(() => {
  if (isEdit.value) return '拖动圆边/顶点调整，保存后同步更新到高德'
  switch (form.shape) {
    case 'circle': return '点击地图或图钉选取圆心，拖动圆边调整半径'
    case 'polygon': return '连续点击地图至少 3 个点，双击结束绘制'
    case 'polyline': return '连续点击地图至少 2 个点，双击结束绘制'
    case 'district': return '选择省市区，自动加载行政边界'
    default: return ''
  }
})

const pointsPlaceholder = computed(() => {
  switch (form.shape) {
    case 'polygon': return '绘制后自动显示多边形顶点坐标'
    case 'polyline': return '绘制后自动显示线形坐标'
    default: return ''
  }
})

let map = null
let circle = null
let circleEditor = null
let polygon = null
let polygonEditor = null
let polyline = null
let polylineEditor = null
let districtPolygon = null
let AMapInstance = null
let autoComplete = null
let geocoder = null
let placeSearch = null
let mouseTool = null
let userMarker = null
let userLng = null
let userLat = null

const DEFAULT_CENTER = [114.206, 30.581]
const provinceOptions = ref([])
const cityOptions = ref([])

// ============================================================
// 提交进度动画
// ============================================================
const startProgressAnimation = () => {
  submitProgress.value = 0
  submitText.value = '正在连接高德服务器...'
  progressTimer = setInterval(() => {
    if (submitProgress.value < 85) {
      submitProgress.value = Math.min(85, submitProgress.value + Math.random() * 6 + 2)
    }
    if (submitProgress.value < 30) submitText.value = '正在连接高德服务器...'
    else if (submitProgress.value < 55) submitText.value = '正在创建围栏数据...'
    else if (submitProgress.value < 80) submitText.value = '正在同步到本地数据库...'
    else submitText.value = '即将完成，请稍候...'
  }, 220)
}

const finishProgressAnimation = () => {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  submitProgress.value = 100
  submitText.value = '完成！'
}

const resetProgressAnimation = () => {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  submitProgress.value = 0
  submitText.value = '正在准备...'
}

// ============================================================
// ⭐ 围栏改名 → 同步 ele_fence_alerts.fence_name
//    提醒配置里存的是围栏名字快照（JSON 数组），改名后要同步
// ============================================================
const syncFenceNameToAlerts = async () => {
  const oldName = String(props.editData?.name || '').trim()
  const newName = String(form.name || '').trim()
  const fenceId = props.editData?.id
  if (!oldName || !newName || oldName === newName || !fenceId) return

  try {
    // 查所有含这个围栏 ID 的提醒配置
    let q = supabase
      .from('ele_fence_alerts')
      .select('id, fence_id, fence_name')
      .like('fence_id', `%${fenceId}%`)
    if (isCustomer && myAccount) q = q.eq('owner_account', myAccount)

    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) return

    const updates = []
    for (const row of data) {
      try {
        const ids = JSON.parse(row.fence_id || '[]')
        const names = JSON.parse(row.fence_name || '[]')
        if (!Array.isArray(ids) || !Array.isArray(names)) continue

        const idx = ids.indexOf(fenceId)
        if (idx === -1) continue
        // 位置对齐，替换为新名字
        if (names[idx] === oldName || names[idx] === undefined) {
          names[idx] = newName
        }

        updates.push(
          supabase
            .from('ele_fence_alerts')
            .update({ fence_name: JSON.stringify(names) })
            .eq('id', row.id)
        )
      } catch (e) {
        console.warn('[Fence] 解析 fence_id/fence_name 失败', row.id, e)
      }
    }

    if (updates.length) {
      await Promise.all(updates)
      console.log(`[Fence] 围栏改名同步完成，影响 ${updates.length} 条提醒配置`)
    }
  } catch (e) {
    console.warn('[Fence] 围栏改名同步失败（不影响主流程）:', e)
  }
}

// ============================================================
// 监听弹窗显隐
// ============================================================
watch(() => props.modelValue, async (val) => {
  visible.value = val
  if (val) {
    if (isCustomer && isSubAccount) await loadMyOrgInfo()
    await loadOrgOptions()
    await nextTick()
    await initMap()
    if (props.editData) {
      loadEditData()
    } else {
      // ⭐ 新增时：二级机构子账号默认选中自己机构
      if (needOrgFilter.value && myOrgName.value) {
        form.org = myOrgName.value
      }
    }
  } else {
    destroyMap()
  }
})
watch(visible, (val) => emit('update:modelValue', val))

// ============================================================
// 初始化地图
// ============================================================
const initMap = async () => {
  try {
    AMapInstance = await AMapLoader.load({
      key: '273f5c474604b71906674aac159b8f45',
      version: '2.0',
      plugins: [
        'AMap.CircleEditor', 'AMap.PolygonEditor', 'AMap.PolylineEditor',
        'AMap.AutoComplete', 'AMap.PlaceSearch', 'AMap.Geolocation',
        'AMap.MouseTool', 'AMap.DistrictSearch',
      ],
    })
  } catch (e) {
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
  } catch (e) {
    ElMessage.error('地图创建失败：' + (e.message || e))
    return
  }

  try { geocoder = new AMapInstance.Geocoder() } catch (e) { console.error(e) }
  try {
    autoComplete = new AMapInstance.AutoComplete()
    placeSearch = new AMapInstance.PlaceSearch({ map: map })
    mouseTool = new AMapInstance.MouseTool(map)
  } catch (e) { console.error(e) }

  loadProvinces()
  if (!isEdit.value) locateUser()

  try {
    if (autoComplete) {
      autoComplete.on('select', (e) => {
        if (e.poi && e.poi.location) {
          map.setCenter(e.poi.location)
          map.setZoom(14)
          if (form.shape === 'circle' && !isEdit.value) drawCircle(e.poi.location.lng, e.poi.location.lat)
        }
      })
    }

    if (!isEdit.value) {
      if (form.shape === 'circle') {
        map.on('click', onMapClickCircle)
      } else if (form.shape === 'polygon') {
        startPolygonDraw()
      } else if (form.shape === 'polyline') {
        startPolylineDraw()
      }
    }

    watch(() => form.radius, (val) => {
      if (circle) circle.setRadius(val)
    })
  } catch (e) { console.error(e) }
}

// ============================================================
// 编辑模式：加载已有数据
// ============================================================
const loadEditData = () => {
  const d = props.editData
  if (!d) return

  form.shape = d.shape || 'circle'
  form.name = d.name || ''
  form.org = d.org || ''
  form.attr = d.attr || d.desc || ''
  form.radius = d.radius || 1000
  form.bufferradius = d.bufferradius || 50
  form.center = d.center || ''
  form.points = d.points || ''
  form.pointsDisplay = (d.points || '').split(';').filter(Boolean).join('\n')
  form.adcode = d.adcode || ''
  form.location = d.location || ''
  form.province = ''
  form.city = ''
  form.lastActionTime = d.updated_at ? dayjs(d.updated_at).format('YYYY-MM-DD HH:mm:ss') : ''
  form.lastActionText = '上次修改时间'

  nameValidated.value = true
  nameExists.value = false

  if (mouseTool) mouseTool.close(false)

  if (d.shape === 'district' && d.adcode) {
    nextTick(() => {
      const districtSearch = new AMapInstance.DistrictSearch({ level: 'district', extensions: 'base' })
      districtSearch.search(d.adcode.toString(), (status, result) => {
        if (status === 'complete' && result.districtList && result.districtList[0]) {
          const provincePrefix = String(d.adcode).substring(0, 2)
          const matchedProvince = provinceOptions.value.find(p => String(p.adcode).startsWith(provincePrefix))
          if (matchedProvince) {
            form.province = matchedProvince.adcode
            const provinceSearch = new AMapInstance.DistrictSearch({ level: 'province', subdistrict: 1, extensions: 'all' })
            provinceSearch.search(matchedProvince.adcode.toString(), (s, r) => {
              if (s === 'complete' && r.districtList && r.districtList[0]) {
                cityOptions.value = (r.districtList[0].districtList || []).map(c => ({ name: c.name, adcode: c.adcode }))
                const cityPrefix = String(d.adcode).substring(0, 4)
                const matchedCity = cityOptions.value.find(c =>
                  String(c.adcode).startsWith(cityPrefix) || c.adcode === d.adcode
                )
                if (matchedCity) form.city = matchedCity.adcode
              }
            })
          }
        }
      })
    })
  }

  nextTick(() => {
    setTimeout(() => {
      if (d.shape === 'circle' && d.center) {
        const [lng, lat] = d.center.split(',').map(Number)
        drawCircle(lng, lat)
        // ⭐ 圆形也要把地图定位到围栏中心
        //（drawCircle 只设了 Circle 对象的中心，不会移动地图；多边形/线形走 setFitView 所以能跳）
        if (!isNaN(lng) && !isNaN(lat)) {
          map.setCenter([lng, lat])
          map.setZoom(14)
        }
      } else if (d.shape === 'polygon' && d.points) {
        drawPolygonFromPoints(d.points)
      } else if (d.shape === 'polyline' && d.points) {
        drawPolylineFromPoints(d.points)
      } else if (d.shape === 'district' && d.adcode) {
        loadDistrictBoundary(d.adcode)
      }
    }, 300)
  })
}

const drawPolygonFromPoints = (pointsStr) => {
  const path = pointsStr.split(';').filter(Boolean).map(p => {
    const [lng, lat] = p.split(',').map(Number)
    return [lng, lat]
  })
  if (path.length < 3) return

  polygon = new AMapInstance.Polygon({
    path,
    strokeColor: '#D32F2F', strokeWeight: 2,
    fillColor: '#D32F2F', fillOpacity: 0.12, zIndex: 10,
  })
  map.add(polygon)
  polygonEditor = new AMapInstance.PolygonEditor(map, polygon)
  polygonEditor.open()
  polygonEditor.on('adjust', updatePolygonData)
  polygonEditor.on('move', updatePolygonData)
  map.setFitView(polygon)
}

const drawPolylineFromPoints = (pointsStr) => {
  const path = pointsStr.split(';').filter(Boolean).map(p => {
    const [lng, lat] = p.split(',').map(Number)
    return [lng, lat]
  })
  if (path.length < 2) return

  polyline = new AMapInstance.Polyline({
    path,
    strokeColor: '#D32F2F', strokeWeight: 4, strokeOpacity: 0.8, zIndex: 10,
  })
  map.add(polyline)
  polylineEditor = new AMapInstance.PolylineEditor(map, polyline)
  polylineEditor.open()
  polylineEditor.on('adjust', updatePolylineData)
  polylineEditor.on('move', updatePolylineData)
  map.setFitView(polyline)
}

const loadDistrictBoundary = (adcode) => {
  const districtSearch = new AMapInstance.DistrictSearch({ level: 'district', extensions: 'all' })
  districtSearch.search(adcode.toString(), (status, result) => {
    if (status === 'complete' && result.districtList && result.districtList[0]) {
      const boundaries = result.districtList[0].boundaries
      if (boundaries) {
        if (districtPolygon) map.remove(districtPolygon)
        districtPolygon = new AMapInstance.Polygon({
          path: boundaries,
          strokeColor: '#D32F2F', strokeWeight: 2,
          fillColor: '#D32F2F', fillOpacity: 0.12, zIndex: 10,
        })
        map.add(districtPolygon)
        map.setFitView(districtPolygon)
      }
    }
  })
}

// ============================================================
// 切换形状
// ============================================================
const handleShapeChange = () => {
  if (isEdit.value) return
  clearDrawings()

  if (!map || !mouseTool) {
    console.warn('[Fence] map 或 mouseTool 未初始化')
    return
  }

  try { mouseTool.close(false) } catch (e) { /* ignore */ }
  try { map.off('click', onMapClickCircle) } catch (e) { /* ignore */ }

  nextTick(() => {
    if (form.shape === 'circle') {
      map.on('click', onMapClickCircle)
    } else if (form.shape === 'polygon') {
      startPolygonDraw()
    } else if (form.shape === 'polyline') {
      startPolylineDraw()
    }
  })
}

const onMapClickCircle = (e) => {
  if (form.shape !== 'circle') return
  drawCircle(e.lnglat.getLng(), e.lnglat.getLat())
}

const startPolygonDraw = () => {
  if (!mouseTool) return
  try { mouseTool.off && mouseTool.off('draw') } catch (e) { /* ignore */ }

  mouseTool.polygon({
    strokeColor: '#D32F2F', strokeWeight: 2,
    fillColor: '#D32F2F', fillOpacity: 0.12,
  })

  mouseTool.on('draw', (event) => {
    if (polygon && map) {
      try { map.remove(polygon) } catch (e) { /* ignore */ }
    }
    polygon = event.obj

    polygonEditor = new AMapInstance.PolygonEditor(map, polygon)
    polygonEditor.open()
    updatePolygonData()
    polygonEditor.on('adjust', updatePolygonData)
    polygonEditor.on('move', updatePolygonData)

    try { mouseTool.close(false) } catch (e) { /* ignore */ }
  })
}

const updatePolygonData = () => {
  if (!polygon) return
  const path = polygon.getPath()
  if (!path || path.length === 0) return

  const coords = path.map(p => p.getLng().toFixed(6) + ',' + p.getLat().toFixed(6))
  form.points = coords.join(';')
  form.pointsDisplay = coords.join('\n')

  const lngs = path.map(p => p.getLng())
  const lats = path.map(p => p.getLat())
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  geocodeAddress(centerLng, centerLat)
}

const startPolylineDraw = () => {
  if (!mouseTool) return
  try { mouseTool.off && mouseTool.off('draw') } catch (e) { /* ignore */ }

  mouseTool.polyline({
    strokeColor: '#D32F2F', strokeWeight: 4, strokeOpacity: 0.8,
  })

  mouseTool.on('draw', (event) => {
    if (polyline && map) {
      try { map.remove(polyline) } catch (e) { /* ignore */ }
    }
    polyline = event.obj

    polylineEditor = new AMapInstance.PolylineEditor(map, polyline)
    polylineEditor.open()
    updatePolylineData()
    polylineEditor.on('adjust', updatePolylineData)
    polylineEditor.on('move', updatePolylineData)

    try { mouseTool.close(false) } catch (e) { /* ignore */ }
  })
}

const updatePolylineData = () => {
  if (!polyline) return
  const path = polyline.getPath()
  if (!path || path.length === 0) return

  const coords = path.map(p => p.getLng().toFixed(6) + ',' + p.getLat().toFixed(6))
  form.points = coords.join(';')
  form.pointsDisplay = coords.join('\n')

  if (path.length > 0) {
    geocodeAddress(path[0].getLng(), path[0].getLat())
  }
}

// ============================================================
// 省市区加载
// ============================================================
const loadProvinces = () => {
  if (!AMapInstance) return
  const districtSearch = new AMapInstance.DistrictSearch({ level: 'country', subdistrict: 1, extensions: 'base' })
  districtSearch.search('中国', (status, result) => {
    if (status === 'complete' && result.districtList && result.districtList[0]) {
      provinceOptions.value = result.districtList[0].districtList.map(p => ({ name: p.name, adcode: p.adcode }))
    }
  })
}

const handleProvinceChange = (adcode) => {
  form.city = ''
  form.adcode = ''
  cityOptions.value = []

  if (!adcode || !AMapInstance) return
  const districtSearch = new AMapInstance.DistrictSearch({ level: 'province', subdistrict: 1, extensions: 'all' })
  districtSearch.search(adcode.toString(), (status, result) => {
    if (status === 'complete' && result.districtList && result.districtList[0]) {
      cityOptions.value = (result.districtList[0].districtList || []).map(c => ({ name: c.name, adcode: c.adcode }))
    }
  })
}

const handleCityChange = (adcode) => {
  form.adcode = adcode
  if (!adcode) return
  loadDistrictBoundary(adcode)
  const name = cityOptions.value.find(c => c.adcode === adcode)?.name || ''
  form.location = name
}

// ============================================================
// 圆形绘制
// ============================================================
const drawCircle = (lng, lat) => {
  form.center = lng.toFixed(6) + ',' + lat.toFixed(6)

  if (circle) {
    circle.setCenter([lng, lat])
    circle.setRadius(form.radius)
    if (circleEditor) circleEditor.setTarget(circle)
  } else {
    circle = new AMapInstance.Circle({
      center: [lng, lat],
      radius: form.radius,
      strokeColor: '#D32F2F', strokeWeight: 2, strokeOpacity: 0.85,
      fillColor: '#D32F2F', fillOpacity: 0.12, zIndex: 10,
    })
    map.add(circle)

    circleEditor = new AMapInstance.CircleEditor(map, circle)
    circleEditor.open()
    circleEditor.on('move', () => {
      const c = circle.getCenter()
      form.center = c.getLng().toFixed(6) + ',' + c.getLat().toFixed(6)
      geocodeAddress(c.getLng(), c.getLat())
    })
    circleEditor.on('adjust', () => {
      form.radius = Math.round(circle.getRadius())
    })
  }
  geocodeAddress(lng, lat)
}

const geocodeAddress = (lng, lat) => {
  if (!geocoder) return
  geocoder.getAddress([lng, lat], (status, result) => {
    if (status === 'complete' && result.regeocode) {
      form.location = result.regeocode.formattedAddress
    }
  })
}

const handleSearchAddress = () => {
  if (!searchKeyword.value) { ElMessage.warning('请输入要搜索的地址'); return }
  if (!placeSearch) return
  placeSearch.search(searchKeyword.value, (status, result) => {
    if (status === 'complete' && result.poiList && result.poiList.pois.length > 0) {
      const poi = result.poiList.pois[0]
      map.setCenter(poi.location)
      map.setZoom(14)
      if (form.shape === 'circle' && !isEdit.value) drawCircle(poi.location.lng, poi.location.lat)
    } else {
      ElMessage.warning('未找到该地址')
    }
  })
}

// ============================================================
// 定位
// ============================================================
const locateUser = async () => {
  if (!AMapInstance || !map) return
  const loadingMsg = ElMessage({ message: '正在获取您的位置...', duration: 0, icon: 'el-icon-loading' })

  try {
    const r = await tryNativeGeolocation()
    if (r) {
      loadingMsg.close()
      applyLocation(r.lng, r.lat, 'GPS 定位', r.accuracy, false)
      return
    }
  } catch (e) { console.warn('GPS 定位失败:', e.message) }

  try {
    const r = await tryAmapGeolocation()
    if (r) {
      loadingMsg.close()
      applyLocation(r.lng, r.lat, 'IP 定位', 0, false)
      ElMessage.info('GPS 不可用，已使用 IP 定位')
      return
    }
  } catch (e) { console.warn('IP 定位失败:', e.message) }

  loadingMsg.close()
  applyLocation(DEFAULT_CENTER[0], DEFAULT_CENTER[1], '默认位置（东风集团）', 0, true)
  ElMessage.warning('当前位置获取失败，默认位置为东风集团所在地')
}

const applyLocation = (lng, lat, method, accuracy, isDefault) => {
  userLng = lng
  userLat = lat
  map.setCenter([lng, lat])
  map.setZoom(14)
  addUserLocationMarker(lng, lat, isDefault)
  located.value = true
}

const tryNativeGeolocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('浏览器不支持')); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const wgsLng = pos.coords.longitude
        const wgsLat = pos.coords.latitude
        AMapInstance.convertFrom([wgsLng, wgsLat], 'gps', (status, result) => {
          if (status === 'complete' && result.locations.length > 0) {
            resolve({ lng: result.locations[0].getLng(), lat: result.locations[0].getLat(), accuracy: pos.coords.accuracy })
          } else {
            resolve({ lng: wgsLng, lat: wgsLat, accuracy: pos.coords.accuracy })
          }
        })
      },
      (err) => reject(new Error(err.message || 'GPS 失败')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  })
}

const tryAmapGeolocation = () => {
  return new Promise((resolve, reject) => {
    const geo = new AMapInstance.Geolocation({
      enableHighAccuracy: false, timeout: 8000, useNative: false,
      showButton: false, showMarker: false, showCircle: false, panToLocation: false,
    })
    geo.getCurrentPosition((status, result) => {
      if (status === 'complete' && result.position) {
        resolve({ lng: result.position.lng, lat: result.position.lat })
      } else {
        reject(new Error(result.message || 'IP 定位失败'))
      }
    })
  })
}

const addUserLocationMarker = (lng, lat, isDefault = false) => {
  if (userMarker && map) { map.remove(userMarker); userMarker = null }

  const gradId = isDefault ? 'pinGradientDefault' : 'pinGradientUser'
  const colorTop = isDefault ? '#FCD34D' : '#F87171'
  const colorMid = isDefault ? '#F59E0B' : '#EF4444'
  const colorBottom = isDefault ? '#B45309' : '#B91C1C'
  const dotColor = isDefault ? '#F59E0B' : '#EF4444'

  const container = document.createElement('div')
  container.className = isDefault ? 'location-marker default-location-marker' : 'location-marker user-location-marker'

  container.innerHTML = '<div class="pulse-ring"></div>'
    + '<div class="pin-wrapper">'
    + '<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">'
    + '<defs>'
    + '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="' + colorTop + '"/>'
    + '<stop offset="45%" stop-color="' + colorMid + '"/>'
    + '<stop offset="100%" stop-color="' + colorBottom + '"/>'
    + '</linearGradient>'
    + '<radialGradient id="pinHighlight_' + gradId + '" cx="35%" cy="25%" r="40%">'
    + '<stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>'
    + '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>'
    + '</radialGradient>'
    + '</defs>'
    + '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20s12-11.5 12-20c0-6.627-5.373-12-12-12z" fill="url(#' + gradId + ')" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>'
    + '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20s12-11.5 12-20c0-6.627-5.373-12-12-12z" fill="url(#pinHighlight_' + gradId + ')"/>'
    + '<circle cx="12" cy="11.5" r="4.2" fill="#ffffff"/>'
    + '<circle cx="12" cy="11.5" r="2.4" fill="' + dotColor + '"/>'
    + '</svg>'
    + '</div>'

  userMarker = new AMapInstance.Marker({
    position: [lng, lat],
    content: container,
    offset: new AMapInstance.Pixel(-12, -32),
    zIndex: 200,
    map: map,
  })

  userMarker.on('click', () => {
    if (form.shape !== 'circle' || isEdit.value) {
      ElMessage.info('当前模式下请在地图上直接绘制围栏')
      return
    }
    map.setCenter([lng, lat])
    drawCircle(lng, lat)
    ElMessage.success({
      message: isDefault ? '已以默认位置（东风集团）为中心创建围栏' : '已以您的位置为中心创建围栏',
      duration: 2000,
    })
  })
}

// ============================================================
// 清空绘制
// ============================================================
const clearDrawings = () => {
  if (!map) return
  if (circle) { try { map.remove(circle) } catch (e) { } circle = null; circleEditor = null }
  if (polygon) { try { map.remove(polygon) } catch (e) { } polygon = null; polygonEditor = null }
  if (polyline) { try { map.remove(polyline) } catch (e) { } polyline = null; polylineEditor = null }
  if (districtPolygon) { try { map.remove(districtPolygon) } catch (e) { } districtPolygon = null }
  form.points = ''
  form.pointsDisplay = ''
  form.center = ''
  form.location = ''
}

const destroyMap = () => {
  if (map) { try { map.destroy() } catch (e) { } map = null }
  circle = null; circleEditor = null
  polygon = null; polygonEditor = null
  polyline = null; polylineEditor = null
  districtPolygon = null
  geocoder = null; autoComplete = null; placeSearch = null; mouseTool = null
  userMarker = null; located.value = false
  userLng = null; userLat = null
}

const handleClose = () => {
  visible.value = false
  formRef.value?.resetFields()
  Object.assign(form, {
    shape: 'circle', name: '', org: '', attr: '',
    radius: 1000, bufferradius: 50, center: '',
    points: '', pointsDisplay: '', province: '', city: '', adcode: '',
    location: '', lastActionTime: '', lastActionText: '',
  })
  searchKeyword.value = ''
  showSuccess.value = false
  resetProgressAnimation()
  nameExists.value = false
  nameValidated.value = false
  nameChecking.value = false
  if (nameCheckTimer) { clearTimeout(nameCheckTimer); nameCheckTimer = null }
}

// ============================================================
// 提交表单
// ============================================================
const submitForm = (isContinue) => {
  formRef.value.validate(async (valid) => {
    if (!valid) return

    if (nameExists.value) {
      ElMessage.error(`围栏名称「${form.name}」已存在，请修改后重试`)
      return
    }

    if (form.shape === 'circle' && !form.center) { ElMessage.warning('请在地图上选取圆心'); return }
    if (form.shape === 'polygon' && !form.points) { ElMessage.warning('请在地图上绘制多边形'); return }
    if (form.shape === 'polyline' && !form.points) { ElMessage.warning('请在地图上绘制线形'); return }
    if (form.shape === 'district' && !form.adcode) { ElMessage.warning('请选择行政区划'); return }

    submitting.value = true
    startProgressAnimation()

    try {
      // ============================================================
      // 1️⃣ 构造高德请求 payload
      // ============================================================
      const amapPayload = {
        shape: form.shape,
        name: form.name,
        desc: form.attr,
      }

      let polygonPointsForDB = null

      if (form.shape === 'circle') {
        amapPayload.center = form.center
        amapPayload.radius = form.radius
      } else if (form.shape === 'polygon') {
        let list = String(form.points || '')
          .split(';')
          .map(s => s.trim())
          .filter(Boolean)
        if (list.length >= 3 && list[0] !== list[list.length - 1]) {
          list.push(list[0])
        }
        amapPayload.points = list.join(';')
        polygonPointsForDB = amapPayload.points
      } else if (form.shape === 'polyline') {
        amapPayload.points = form.points
        amapPayload.bufferradius = form.bufferradius
      } else if (form.shape === 'district') {
        amapPayload.adcode = form.adcode
      }

      let functionName = 'amap-geofence'
      if (isEdit.value) {
        amapPayload.gfid = props.editData.gfid
        functionName = 'amap-geofence-update'
      }

      // ============================================================
      // 2️⃣ 构造数据库 payload
      // ⭐⭐⭐ 关键：确定 org 字段的值
      //   新增 + 二级机构子账号 → 强制本机构名
      //   其他 → 用户从下拉选的值
      // ============================================================
      let finalOrg = form.org
      if (!isEdit.value && needOrgFilter.value && myOrgName.value) {
        // 二级机构子账号新增时强制本机构
        finalOrg = myOrgName.value
        console.log('[Fence] 二级机构子账号新增 → 强制 org =', finalOrg)
      }

      const now = new Date().toISOString()
      const dbPayload = {
        name: form.name,
        desc: form.attr,
        shape: form.shape,
        org: finalOrg,
        attr: form.attr,
        location: form.location,
        owner_account: myAccount,
        updated_at: now,
      }
      if (form.shape === 'circle') {
        dbPayload.radius = form.radius
        dbPayload.center = form.center
      } else if (form.shape === 'polygon') {
        dbPayload.points = polygonPointsForDB
      } else if (form.shape === 'polyline') {
        dbPayload.points = form.points
        dbPayload.bufferradius = form.bufferradius
      } else if (form.shape === 'district') {
        dbPayload.adcode = form.adcode
      }

      // ============================================================
      // 3️⃣ 分支：新增 vs 编辑
      // ============================================================
      let dbRecordId = null

      if (!isEdit.value) {
        const { data: dbData, error: dbErr } = await supabase
          .from('ele_fences')
          .insert({
            ...dbPayload,
            gfid: null,
            created_at: now,
          })
          .select('id')
          .single()

        if (dbErr) {
          console.error('数据库写入失败：', dbErr)
          finishProgressAnimation()
          setTimeout(() => {
            submitting.value = false
            resetProgressAnimation()
            ElMessage.error('保存失败：' + dbErr.message)
          }, 400)
          return
        }

        dbRecordId = dbData.id
        console.log('[新增围栏] 数据库已写入，id =', dbRecordId)
      }

      // ============================================================
      // 4️⃣ 调高德
      // ============================================================
      let amapSuccess = false
      let amapData = null
      let amapErrorMsg = ''

      try {
        const response = await fetch(`${API_BASE}/${functionName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(amapPayload),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        amapData = await response.json()

        amapSuccess = amapData.errcode === 0 || amapData.errcode === 10000 || amapData.errcode === 20003
        if (!amapSuccess) {
          amapErrorMsg = String(amapData.errmsg || '未知错误')
        }
      } catch (netErr) {
        amapErrorMsg = netErr.message || '网络异常'
      }

      // ============================================================
      // 5️⃣ 高德失败 → 回滚数据库
      // ============================================================
      if (!amapSuccess) {
        console.error('【高德返回】', amapData || amapErrorMsg)

        if (!isEdit.value && dbRecordId) {
          try {
            const { error: rollbackErr } = await supabase
              .from('ele_fences')
              .delete()
              .eq('id', dbRecordId)
            if (rollbackErr) {
              console.error('回滚数据库失败：', rollbackErr)
            } else {
              console.log('[新增围栏] 高德失败，已回滚数据库记录 id =', dbRecordId)
            }
          } catch (e) {
            console.error('回滚异常：', e)
          }
        }

        finishProgressAnimation()
        setTimeout(() => {
          submitting.value = false
          resetProgressAnimation()

          let friendlyMsg = (isEdit.value ? '更新' : '创建') + '失败：' + (amapErrorMsg || '未知错误')

          if (amapData && typeof amapData.errmsg === 'string') {
            const errmsg = amapData.errmsg
            if (errmsg.includes('EXISTING_ELEMENT') || errmsg.includes('DUPLICATE') || errmsg.includes('existed')) {
              friendlyMsg = `围栏名称「${form.name}」已存在，请修改名称后重试`
              nameExists.value = true
            } else if (amapData.errcode === 20001 || amapData.errcode === 20800) {
              friendlyMsg = '参数错误，请检查围栏参数或名称是否合法'
            }
          }

          ElMessage({ type: 'error', message: friendlyMsg, duration: 5000, showClose: true })
        }, 400)
        return
      }

      // ============================================================
      // 6️⃣ 高德成功
      // ============================================================
      console.log('【高德返回】', amapData)

      if (!isEdit.value && dbRecordId) {
        const newGfid = (amapData && amapData.data && amapData.data.gfid) || (amapData && amapData.gfid) || null
        if (newGfid) {
          const { error: updateErr } = await supabase
            .from('ele_fences')
            .update({ gfid: newGfid })
            .eq('id', dbRecordId)
          if (updateErr) {
            console.error('回填 gfid 失败：', updateErr)
            ElMessage.warning('信息暂时没有同步成功哈～～')
          } else {
            console.log('[新增围栏] 回填 gfid =', newGfid)
          }
        } else {
          console.warn('[新增围栏] 高德返回没有 gfid')
        }
      } else if (isEdit.value) {
        const { error: dbErr } = await supabase
          .from('ele_fences')
          .update(dbPayload)
          .eq('gfid', props.editData.gfid)
        if (dbErr) {
          console.error('数据库更新失败：', dbErr)
          ElMessage.warning('信息暂时没有同步成功哈～～')
        } else {
          // ⭐ 围栏改名 → 同步 ele_fence_alerts.fence_name
          await syncFenceNameToAlerts()
        }
      }

      finishProgressAnimation()

      setTimeout(() => {
        submitting.value = false
        resetProgressAnimation()

        form.lastActionTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
        form.lastActionText = isEdit.value ? '围栏修改时间' : '围栏创建时间'

        showSuccess.value = true
        emit('success')

        setTimeout(() => {
          showSuccess.value = false
          if (isContinue && !isEdit.value) {
            const savedTime = form.lastActionTime
            const savedText = form.lastActionText
            formRef.value.resetFields()
            // ⭐ 重置时保留 org（二级机构子账号继续用本机构）
            const preservedOrg = (needOrgFilter.value && myOrgName.value) ? myOrgName.value : ''
            Object.assign(form, {
              shape: 'circle', name: '', org: preservedOrg, attr: '',
              radius: 1000, bufferradius: 50, center: '',
              points: '', pointsDisplay: '', province: '', city: '', adcode: '',
              location: '', lastActionTime: savedTime, lastActionText: savedText,
            })
            searchKeyword.value = ''
            clearDrawings()
            nameExists.value = false
            nameValidated.value = false
          } else {
            visible.value = false
          }
        }, 1200)
      }, 300)
    } catch (err) {
      console.error(err)
      finishProgressAnimation()
      setTimeout(() => {
        submitting.value = false
        resetProgressAnimation()
        ElMessage.error('请求失败：' + (err.message || '请检查网络'))
      }, 400)
    }
  })
}
</script>

<style scoped>
/* ⭐ 弹窗外壳规则已移到文件末尾的全局 <style> 块：
   class 会被合并到 .el-dialog 自身，且 scoped 的 :deep() 需要祖先带 scope 属性，
   原写法 `:deep(.fence-dialog .el-dialog)` 永远不会匹配。 */

@keyframes dialogBounceIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes headerGlow {

  0%,
  100% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }
}

.dialog-layout {
  display: flex;
  /* 兜底高度（父级非 flex 容器时生效） */
  height: 68vh;
  /* ⭐ 父级为 flex 时吃满弹窗剩余高度，不再用 68vh/540px 硬撑 */
  flex: 1;
  min-height: 0;
}

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
  from {
    opacity: 0;
    transform: scale(0.98);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.map-glow-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, rgba(211, 47, 47, 0) 0%, rgba(211, 47, 47, 0.8) 50%, rgba(211, 47, 47, 0) 100%);
  box-shadow: 0 2px 8px rgba(211, 47, 47, 0.3);
  z-index: 50;
  animation: glowSlide 3s ease-in-out infinite;
}

@keyframes glowSlide {

  0%,
  100% {
    transform: translateX(-20%);
    opacity: 0.6;
  }

  50% {
    transform: translateX(20%);
    opacity: 1;
  }
}

.map-tip {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.95);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--brand-primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  animation: tipSlideIn 0.6s ease-out 0.3s both;
}

@keyframes tipSlideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
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
}

.locate-btn:hover {
  color: var(--brand-primary);
  box-shadow: 0 4px 14px rgba(211, 47, 47, 0.25);
  transform: translateY(-2px) scale(1.08);
}

.locate-radar {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(circle at center, rgba(211, 47, 47, 0.06) 0%, rgba(211, 47, 47, 0) 60%);
  animation: radarFlash 1.5s ease-out;
}

@keyframes radarFlash {
  0% {
    opacity: 0;
  }

  30% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.form-panel {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background-color: #FFFFFF;
}

.form-panel::-webkit-scrollbar {
  width: 4px;
}

.form-panel::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 2px;
}

.stagger-form :deep(.el-form-item) {
  margin-bottom: 12px;
  animation: fieldSlideIn 0.4s ease-out backwards;
}

.stagger-form :deep(.el-form-item:nth-child(1)) {
  animation-delay: 0.05s;
}

.stagger-form :deep(.el-form-item:nth-child(2)) {
  animation-delay: 0.10s;
}

.stagger-form :deep(.el-form-item:nth-child(3)) {
  animation-delay: 0.15s;
}

.stagger-form :deep(.el-form-item:nth-child(4)) {
  animation-delay: 0.20s;
}

.stagger-form :deep(.el-form-item:nth-child(5)) {
  animation-delay: 0.25s;
}

.stagger-form :deep(.el-form-item:nth-child(6)) {
  animation-delay: 0.30s;
}

.stagger-form :deep(.el-form-item:nth-child(7)) {
  animation-delay: 0.35s;
}

@keyframes fieldSlideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

:deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 13px;
  color: #475569;
  font-weight: 500;
}

.edit-hint {
  font-size: 11px;
  color: #94A3B8;
  margin-top: 4px;
}

:deep(.el-input__wrapper) {
  border-radius: 6px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--brand-primary) inset;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(211, 47, 47, 0.15), 0 0 0 1px var(--brand-primary) inset !important;
}

.search-icon {
  cursor: pointer;
  color: #94A3B8;
  transition: all 0.25s;
}

.search-icon:hover {
  color: var(--brand-primary);
  transform: scale(1.15) rotate(10deg);
}

.name-status-icon {
  font-size: 16px;
  transition: all 0.2s;
}

.name-status-icon.success {
  color: #10B981;
}

.name-status-icon.error {
  color: #EF4444;
}

.name-status-icon.is-loading {
  color: #94A3B8;
  animation: rotating 1.2s linear infinite;
}

@keyframes rotating {
  to {
    transform: rotate(360deg);
  }
}

.radius-control {
  width: 100%;
}

.radius-slider {
  padding: 0 4px;
  margin-bottom: 4px;
}

.radius-slider :deep(.el-slider__runway) {
  background: linear-gradient(90deg, var(--brand-primary-light) 0%, var(--brand-primary-light) 100%);
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
  border: 3px solid var(--brand-primary);
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

.time-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
  border-radius: 6px;
  color: #15803D;
  font-size: 12px;
  font-weight: 500;
  animation: timePulse 0.6s ease-out;
}

.time-tag .el-icon {
  color: #10B981;
}

@keyframes timePulse {
  0% {
    opacity: 0;
    transform: scale(0.9);
  }

  60% {
    transform: scale(1.02);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

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
  background: linear-gradient(90deg, rgba(211, 47, 47, 0) 0%, rgba(211, 47, 47, 0.6) 50%, rgba(211, 47, 47, 0) 100%);
}

:deep(.dialog-footer .el-button) {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  border-radius: 6px;
}

:deep(.dialog-footer .el-button:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.15);
}

.btn-cancel {
  border-color: #E2E8F0;
  color: #64748B;
}

.btn-cancel:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-primary-light);
}

.btn-continue {
  background-color: var(--brand-primary-light);
  border-color: #FECACA;
  color: var(--brand-primary);
}

.btn-continue:hover {
  background-color: #FEE2E2;
  border-color: #FCA5A5;
  color: #B91C1C;
}

.btn-submit {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
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

  0%,
  100% {
    left: -100%;
  }

  50% {
    left: 100%;
  }
}

.btn-submit:hover {
  background-color: #B91C1C;
  border-color: #B91C1C;
  box-shadow: 0 6px 16px rgba(211, 47, 47, 0.35) !important;
}

.btn-submit:disabled {
  background-color: #FCA5A5;
  border-color: #FCA5A5;
  cursor: not-allowed;
}

.submit-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  border-radius: 12px;
}

.submit-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: submitFadeIn 0.4s ease-out;
}

@keyframes submitFadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.submit-ring {
  position: relative;
  width: 120px;
  height: 120px;
}

.submit-ring svg {
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: #FEE2E2;
  stroke-width: 6;
}

.ring-progress {
  fill: none;
  stroke: var(--brand-primary);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 263.89;
  transition: stroke-dashoffset 0.3s ease-out;
  filter: drop-shadow(0 2px 6px rgba(211, 47, 47, 0.4));
}

.ring-percent {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 26px;
  font-weight: 700;
  color: var(--brand-primary);
  letter-spacing: 1px;
  text-shadow: 0 2px 8px rgba(211, 47, 47, 0.2);
}

.submit-text {
  font-size: 14px;
  color: #475569;
  font-weight: 500;
  animation: textPulse 1.6s ease-in-out infinite;
}

@keyframes textPulse {

  0%,
  100% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }
}

.submit-bar {
  width: 240px;
  height: 6px;
  background: #FEE2E2;
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.submit-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, #EF4444, #B91C1C);
  border-radius: 3px;
  transition: width 0.3s ease-out;
  position: relative;
}

.submit-bar-inner::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: barShine 1.5s ease-in-out infinite;
}

@keyframes barShine {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

.submit-dots {
  display: flex;
  gap: 6px;
}

.submit-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand-primary);
  animation: dotBounce 1.4s ease-in-out infinite;
}

.submit-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.submit-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotBounce {

  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }

  40% {
    transform: scale(1.1);
    opacity: 1;
  }
}

.loading-fade-enter-active,
.loading-fade-leave-active {
  transition: opacity 0.35s ease;
}

.loading-fade-enter-from,
.loading-fade-leave-to {
  opacity: 0;
}

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
  100% {
    stroke-dashoffset: 0;
  }
}

.success-text {
  font-size: 16px;
  font-weight: 600;
  color: #10B981;
  margin: 0;
  animation: successTextIn 0.5s ease-out 0.8s both;
}

@keyframes successTextIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.success-enter-active {
  transition: opacity 0.3s;
}

.success-leave-active {
  transition: opacity 0.4s;
}

.success-enter-from,
.success-leave-to {
  opacity: 0;
}
</style>

<style>
.location-marker {
  position: relative;
  width: 24px;
  height: 32px;
  cursor: pointer;
}

.location-marker .pin-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  animation: pinDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  transition: transform 0.25s ease;
}

@keyframes pinDrop {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.location-marker:hover .pin-wrapper {
  transform: scale(1.2);
}

.location-marker .pulse-ring {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  transform: translate(-50%, 50%);
  animation: userPulse 2s ease-out infinite;
  z-index: 1;
}

.user-location-marker .pin-wrapper {
  filter: drop-shadow(0 3px 6px rgba(185, 28, 28, 0.5));
}

.user-location-marker:hover .pin-wrapper {
  filter: drop-shadow(0 4px 10px rgba(185, 28, 28, 0.7));
}

.user-location-marker .pulse-ring {
  background: rgba(211, 47, 47, 0.5);
}

.default-location-marker .pin-wrapper {
  filter: drop-shadow(0 3px 6px rgba(180, 83, 9, 0.5));
}

.default-location-marker:hover .pin-wrapper {
  filter: drop-shadow(0 4px 10px rgba(180, 83, 9, 0.7));
}

.default-location-marker .pulse-ring {
  background: rgba(245, 158, 11, 0.5);
}

@keyframes userPulse {
  0% {
    transform: translate(-50%, 50%) scale(0.5);
    opacity: 0.9;
  }

  100% {
    transform: translate(-50%, 50%) scale(6);
    opacity: 0;
  }
}

/* ============================================================
   ⭐ 围栏弹窗外壳
   el-dialog 会把 class 合并到 .el-dialog 元素自身（不是父级），
   所以外壳必须用「同元素」选择器 `.fence-dialog.el-dialog`；
   header/body/title 是其子元素，用后代选择器即可。
   ============================================================ */
.fence-dialog.el-dialog {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: dialogBounceIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-width: 94vw;
  /* ⭐ 自适应高度 + 纵向 flex：高度 = min(上限, 视口 − 上边距 − 下边距 − 安全余量)
     地图/表单区吃满剩余空间，保证整窗放得下、不出现外层滚动 */
  display: flex;
  flex-direction: column;
  height: min(820px, calc(96vh - 80px));
}

.fence-dialog .el-dialog__header {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid #F1F5F9;
  position: relative;
  flex-shrink: 0;
}

.fence-dialog .el-dialog__header::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, rgba(211, 47, 47, 0) 0%, rgba(211, 47, 47, 0.7) 50%, rgba(211, 47, 47, 0) 100%);
  animation: headerGlow 2.5s ease-in-out infinite;
}

.fence-dialog .el-dialog__title {
  font-size: 16px;
  font-weight: 600;
  color: #1E293B;
}

.fence-dialog .el-dialog__body {
  padding: 0;
  position: relative;
  /* ⭐ 撑满头部/底部之外的剩余高度，内部交给 .dialog-layout */
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.fence-dialog .el-dialog__footer {
  flex-shrink: 0;
}
</style>