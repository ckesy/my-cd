<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { Search, Plus, Delete, Edit, Key, Van, Upload, Download, CircleClose, CircleCheck } from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

// ============================================================
// 超时防御
// ============================================================
const withTimeout = (promise, timeoutMs = 10000, errorMessage = '请求超时，请稍后重试') => {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId))
}

// ============================================================
// 省市区数据
// ============================================================
const provinceOptions = [
  { value: '北京市', label: '北京市', cities: ['北京市'] },
  { value: '天津市', label: '天津市', cities: ['天津市'] },
  { value: '上海市', label: '上海市', cities: ['上海市'] },
  { value: '重庆市', label: '重庆市', cities: ['重庆市'] },
  { value: '河北省', label: '河北省', cities: ['石家庄市','唐山市','秦皇岛市','邯郸市','邢台市','保定市','张家口市','承德市','沧州市','廊坊市','衡水市'] },
  { value: '山西省', label: '山西省', cities: ['太原市','大同市','阳泉市','长治市','晋城市','朔州市','晋中市','运城市','忻州市','临汾市','吕梁市'] },
  { value: '内蒙古自治区', label: '内蒙古自治区', cities: ['呼和浩特市','包头市','乌海市','赤峰市','通辽市','鄂尔多斯市','呼伦贝尔市','巴彦淖尔市','乌兰察布市','兴安盟','锡林郭勒盟','阿拉善盟'] },
  { value: '辽宁省', label: '辽宁省', cities: ['沈阳市','大连市','鞍山市','抚顺市','本溪市','丹东市','锦州市','营口市','阜新市','辽阳市','盘锦市','铁岭市','朝阳市','葫芦岛市'] },
  { value: '吉林省', label: '吉林省', cities: ['长春市','吉林市','四平市','辽源市','通化市','白山市','松原市','白城市','延边朝鲜族自治州'] },
  { value: '黑龙江省', label: '黑龙江省', cities: ['哈尔滨市','齐齐哈尔市','鸡西市','鹤岗市','双鸭山市','大庆市','伊春市','佳木斯市','七台河市','牡丹江市','黑河市','绥化市','大兴安岭地区'] },
  { value: '江苏省', label: '江苏省', cities: ['南京市','无锡市','徐州市','常州市','苏州市','南通市','连云港市','淮安市','盐城市','扬州市','镇江市','泰州市','宿迁市'] },
  { value: '浙江省', label: '浙江省', cities: ['杭州市','宁波市','温州市','嘉兴市','湖州市','绍兴市','金华市','衢州市','舟山市','台州市','丽水市'] },
  { value: '安徽省', label: '安徽省', cities: ['合肥市','芜湖市','蚌埠市','淮南市','马鞍山市','淮北市','铜陵市','安庆市','黄山市','滁州市','阜阳市','宿州市','六安市','亳州市','池州市','宣城市'] },
  { value: '福建省', label: '福建省', cities: ['福州市','厦门市','莆田市','三明市','泉州市','漳州市','南平市','龙岩市','宁德市'] },
  { value: '江西省', label: '江西省', cities: ['南昌市','景德镇市','萍乡市','九江市','新余市','鹰潭市','赣州市','吉安市','宜春市','抚州市','上饶市'] },
  { value: '山东省', label: '山东省', cities: ['济南市','青岛市','淄博市','枣庄市','东营市','烟台市','潍坊市','济宁市','泰安市','威海市','日照市','临沂市','德州市','聊城市','滨州市','菏泽市'] },
  { value: '河南省', label: '河南省', cities: ['郑州市','开封市','洛阳市','平顶山市','安阳市','鹤壁市','新乡市','焦作市','濮阳市','许昌市','漯河市','三门峡市','南阳市','商丘市','信阳市','周口市','驻马店市','济源市'] },
  { value: '湖北省', label: '湖北省', cities: ['武汉市','黄石市','十堰市','宜昌市','襄阳市','鄂州市','荆门市','孝感市','荆州市','黄冈市','咸宁市','随州市','恩施土家族苗族自治州','仙桃市','潜江市','天门市','神农架林区'] },
  { value: '湖南省', label: '湖南省', cities: ['长沙市','株洲市','湘潭市','衡阳市','邵阳市','岳阳市','常德市','张家界市','益阳市','郴州市','永州市','怀化市','娄底市','湘西土家族苗族自治州'] },
  { value: '广东省', label: '广东省', cities: ['广州市','韶关市','深圳市','珠海市','汕头市','佛山市','江门市','湛江市','茂名市','肇庆市','惠州市','梅州市','汕尾市','河源市','阳江市','清远市','东莞市','中山市','潮州市','揭阳市','云浮市'] },
  { value: '广西壮族自治区', label: '广西壮族自治区', cities: ['南宁市','柳州市','桂林市','梧州市','北海市','防城港市','钦州市','贵港市','玉林市','百色市','贺州市','河池市','来宾市','崇左市'] },
  { value: '海南省', label: '海南省', cities: ['海口市','三亚市','三沙市','儋州市'] },
  { value: '四川省', label: '四川省', cities: ['成都市','自贡市','攀枝花市','泸州市','德阳市','绵阳市','广元市','遂宁市','内江市','乐山市','南充市','眉山市','宜宾市','广安市','达州市','雅安市','巴中市','资阳市','阿坝藏族羌族自治州','甘孜藏族自治州','凉山彝族自治州'] },
  { value: '贵州省', label: '贵州省', cities: ['贵阳市','六盘水市','遵义市','安顺市','毕节市','铜仁市','黔西南布依族苗族自治州','黔东南苗族侗族自治州','黔南布依族苗族自治州'] },
  { value: '云南省', label: '云南省', cities: ['昆明市','曲靖市','玉溪市','保山市','昭通市','丽江市','普洱市','临沧市','楚雄彝族自治州','红河哈尼族彝族自治州','文山壮族苗族自治州','西双版纳傣族自治州','大理白族自治州','德宏傣族景颇族自治州','怒江傈僳族自治州','迪庆藏族自治州'] },
  { value: '西藏自治区', label: '西藏自治区', cities: ['拉萨市','日喀则市','昌都市','林芝市','山南市','那曲市','阿里地区'] },
  { value: '陕西省', label: '陕西省', cities: ['西安市','铜川市','宝鸡市','咸阳市','渭南市','延安市','汉中市','榆林市','安康市','商洛市'] },
  { value: '甘肃省', label: '甘肃省', cities: ['兰州市','嘉峪关市','金昌市','白银市','天水市','武威市','张掖市','平凉市','酒泉市','庆阳市','定西市','陇南市','临夏回族自治州','甘南藏族自治州'] },
  { value: '青海省', label: '青海省', cities: ['西宁市','海东市','海北藏族自治州','黄南藏族自治州','海南藏族自治州','果洛藏族自治州','玉树藏族自治州','海西蒙古族藏族自治州'] },
  { value: '宁夏回族自治区', label: '宁夏回族自治区', cities: ['银川市','石嘴山市','吴忠市','固原市','中卫市'] },
  { value: '新疆维吾尔自治区', label: '新疆维吾尔自治区', cities: ['乌鲁木齐市','克拉玛依市','吐鲁番市','哈密市','昌吉回族自治州','博尔塔拉蒙古自治州','巴音郭楞蒙古自治州','阿克苏地区','克孜勒苏柯尔克孜自治州','喀什地区','和田地区','伊犁哈萨克自治州','塔城地区','阿勒泰地区','石河子市','阿拉尔市','图木舒克市','五家渠市','北屯市','铁门关市','双河市','可克达拉市','昆玉市','胡杨河市'] },
  { value: '香港特别行政区', label: '香港特别行政区', cities: ['香港'] },
  { value: '澳门特别行政区', label: '澳门特别行政区', cities: ['澳门'] },
  { value: '台湾省', label: '台湾省', cities: ['台北市','高雄市','台中市','台南市','新北市','桃园市','基隆市','新竹市','嘉义市'] },
]

const cityOptions = ref([])

// ============================================================
// 客户端权限配置
// ============================================================
const clientPermissions = [
  { label: '首页 / 数据总览',         value: 'home' },
  { label: '行车管理 / 全图监控',     value: 'driving_fullmap' },
  { label: '车辆故障管理',            value: 'vehicle_fault' },
  { label: '外观巡检管理',            value: 'appearance_inspect' },
  { label: '电子围栏管理',            value: 'ele_fence' },
  { label: '运营管理',                value: 'operation' },
  { label: '运输管理 / 运单管理',     value: 'waybill' },
  { label: '车队运营报告',            value: 'report' },
  { label: '基础数据管理 / 车辆档案', value: 'vehicle_archive' },
  { label: '基础数据管理 / 司机档案', value: 'driver_archive' },
  { label: '系统管理',                value: 'system' },
]

const isAllPermsSelected = computed(() => {
  if (!clientPermissions.length) return false
  return clientPermissions.every(p => form.clientPerms.includes(p.value))
})

const toggleAllPerms = () => {
  if (isAllPermsSelected.value) {
    form.clientPerms = []
  } else {
    form.clientPerms = clientPermissions.map(p => p.value)
  }
}

// ============================================================
// 筛选
// ============================================================
const filters = ref({
  name: '', phone: '', contactPerson: '', contactPhone: '',
  platform: '', status: '',
})

const platformFilterOptions = [
  { label: '全部平台', value: '' },
  { label: '客户端',   value: 'client' },
  { label: '未开通',   value: 'none' },
]
const statusFilterOptions = [
  { label: '全部状态', value: '' },
  { label: '启用',     value: '1' },
  { label: '停用',     value: '0' },
]

// ============================================================
// 表格
// ============================================================
const tableData = ref([])
const loading = ref(false)
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)

const fetchData = async () => {
  loading.value = true
  try {
    let query = supabase.from('customers').select('*', { count: 'exact' })

    if (filters.value.name)          query = query.ilike('name', `%${filters.value.name}%`)
    if (filters.value.phone)         query = query.ilike('phone', `%${filters.value.phone}%`)
    if (filters.value.contactPerson) query = query.ilike('contact_person', `%${filters.value.contactPerson}%`)
    if (filters.value.contactPhone)  query = query.ilike('contact_phone', `%${filters.value.contactPhone}%`)
    if (filters.value.status !== '') query = query.eq('status', Number(filters.value.status))
    if (filters.value.platform === 'client') {
      query = query.contains('platforms', ['client'])
    }

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1
    query = query.order('created_at', { ascending: false }).range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    tableData.value = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      province: row.province,
      city: row.city,
      contactPerson: row.contact_person,
      contactPhone: row.contact_phone,
      status: row.status,
      platforms: row.platforms || [],
      permissions: row.permissions || {},
      vehicleCount: 0,
      createdAt: row.created_at
        ? new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
        : '--',
    }))
    total.value = count || 0

    if (tableData.value.length) {
      const ids = tableData.value.map(r => r.id)
      const { data: vCounts } = await supabase
        .from('vehicles')
        .select('customer_id')
        .in('customer_id', ids)
      if (vCounts) {
        const countMap = new Map()
        vCounts.forEach(v => {
          countMap.set(v.customer_id, (countMap.get(v.customer_id) || 0) + 1)
        })
        tableData.value = tableData.value.map(r => ({
          ...r,
          vehicleCount: countMap.get(r.id) || 0,
        }))
      }
    }
  } catch (e) {
    console.error(e)
    ElMessage.error('加载客户失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { currentPage.value = 1; fetchData() }
const handleReset = () => {
  filters.value = {
    name: '', phone: '', contactPerson: '', contactPhone: '',
    platform: '', status: '',
  }
  currentPage.value = 1
  fetchData()
}

// ============================================================
// 停用/启用 —— 自定义确认弹窗
// ============================================================
const confirmVisible = ref(false)
const confirmType = ref('disable')   // 'disable' | 'enable'
const confirmRow = ref(null)

const confirmTitle = computed(() => {
  return confirmType.value === 'disable' ? '停用客户账号' : '启用客户账号'
})

const confirmDesc = computed(() => {
  if (!confirmRow.value) return ''
  if (confirmType.value === 'disable') {
    return `停用后「${confirmRow.value.name}」将无法登录客户端，车辆数据仍会保留。`
  } else {
    return `启用后「${confirmRow.value.name}」可以正常登录客户端。`
  }
})

const confirmOkText = computed(() => {
  return confirmType.value === 'disable' ? '确定停用' : '确定启用'
})

const handleToggleStatus = (row) => {
  confirmRow.value = row
  confirmType.value = row.status === 1 ? 'disable' : 'enable'
  confirmVisible.value = true
}

const closeConfirm = () => {
  confirmVisible.value = false
}

const confirmAction = async () => {
  if (!confirmRow.value) return
  const row = confirmRow.value
  const newStatus = confirmType.value === 'disable' ? 0 : 1
  const action = confirmType.value === 'disable' ? '停用' : '启用'
  confirmVisible.value = false

  try {
    const { error } = await supabase
      .from('customers')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error

    ElMessage.success(`已${action}客户「${row.name}」`)
    fetchData()
  } catch (e) {
    ElMessage.error(`${action}失败：` + (e?.message || e))
  }
}

// ============================================================
// 新增/编辑弹窗
// ============================================================
const dialogVisible = ref(false)
const dialogMode = ref('add')
const formRef = ref(null)

const form = reactive({
  id: '', name: '', phone: '', password: '',
  province: '', city: '', legalPerson: '', contactPerson: '', contactPhone: '',
  status: 1, remark: '',
  enableClient: false,
  clientPerms: ['home', 'driving_fullmap'],
})

const formRules = {
  phone: [
    { required: true, message: '请输入登录手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
  password: [
    {
      validator: (rule, value, callback) => {
        if (dialogMode.value === 'add' && !value) {
          callback(new Error('请输入初始密码'))
        } else if (value && (value.length < 6 || value.length > 32)) {
          callback(new Error('密码长度 6~32 位'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  contactPhone: [
    {
      validator: (rule, value, callback) => {
        if (value && !/^1[3-9]\d{9}$/.test(value)) {
          callback(new Error('联系电话格式不正确'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

watch(() => form.province, (val) => {
  const p = provinceOptions.find(x => x.value === val)
  cityOptions.value = p ? p.cities.map(c => ({ label: c, value: c })) : []
  if (!cityOptions.value.some(c => c.value === form.city)) {
    form.city = ''
  }
})

const resetForm = () => {
  form.id = ''
  form.name = ''
  form.phone = ''
  form.password = ''
  form.province = ''
  form.city = ''
  form.legalPerson = ''
  form.contactPerson = ''
  form.contactPhone = ''
  form.status = 1
  form.remark = ''
  form.enableClient = false
  form.clientPerms = ['home', 'driving_fullmap']
  cityOptions.value = []
  formRef.value?.clearValidate?.()
}

const openAdd = () => {
  dialogMode.value = 'add'
  resetForm()
  dialogVisible.value = true
}

const openEdit = (row) => {
  dialogMode.value = 'edit'
  resetForm()

  const platforms = row.platforms || []
  const permissions = row.permissions || {}

  form.id = row.id
  form.name = row.name
  form.phone = row.phone
  form.password = ''
  form.province = row.province || ''
  form.city = row.city || ''
  form.legalPerson = row.legalPerson || ''
  form.contactPerson = row.contactPerson || ''
  form.contactPhone = row.contactPhone || ''
  form.status = row.status
  form.remark = ''
  form.enableClient = platforms.includes('client')
  form.clientPerms = permissions.client || ['home', 'driving_fullmap']

  const p = provinceOptions.find(x => x.value === form.province)
  cityOptions.value = p ? p.cities.map(c => ({ label: c, value: c })) : []

  dialogVisible.value = true
}

const buildPayload = () => {
  const platforms = form.enableClient ? ['client'] : []
  const permissions = form.enableClient ? { client: form.clientPerms } : {}
  return {
    name: form.name,
    phone: form.phone,
    province: form.province || null,
    city: form.city || null,
    legal_person: form.legalPerson || null,
    contact_person: form.contactPerson || null,
    contact_phone: form.contactPhone || null,
    status: form.status,
    remark: form.remark || null,
    platforms,
    permissions,
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()

    if (!form.enableClient) {
      ElMessage.warning('请勾选"客户端"开通平台')
      return
    }
    if (!form.clientPerms.length) {
      ElMessage.warning('请至少配置一项客户端权限')
      return
    }

    const payload = buildPayload()

    if (dialogMode.value === 'add') {
      payload.password = form.password
      const { error } = await supabase.from('customers').insert(payload)
      if (error) throw error
      ElMessage.success('客户创建成功')
    } else {
      payload.updated_at = new Date().toISOString()
      if (form.password) payload.password = form.password
      const { error } = await supabase.from('customers').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('客户信息已更新')
    }
    dialogVisible.value = false
    fetchData()
  } catch (e) {
    if (e?.message) ElMessage.error('操作失败：' + e.message)
  }
}

const handleCreateAndAddVehicle = async () => {
  if (!formRef.value) return
  if (dialogMode.value === 'edit') return
  try {
    await formRef.value.validate()

    if (!form.enableClient) {
      ElMessage.warning('请勾选"客户端"开通平台')
      return
    }
    if (!form.clientPerms.length) {
      ElMessage.warning('请至少配置一项客户端权限')
      return
    }

    const payload = buildPayload()
    payload.password = form.password

    const { data, error } = await supabase
      .from('customers')
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    ElMessage.success('客户创建成功，请上传车辆档案')
    dialogVisible.value = false

    await fetchData()

    openImportDialog(data.id, data.name)
  } catch (e) {
    if (e?.message) ElMessage.error('创建失败：' + e.message)
  }
}

const handleEditAndAddVehicle = async () => {
  if (!formRef.value) return
  if (dialogMode.value !== 'edit') return
  try {
    await formRef.value.validate()

    if (!form.enableClient) {
      ElMessage.warning('请勾选"客户端"开通平台')
      return
    }
    if (!form.clientPerms.length) {
      ElMessage.warning('请至少配置一项客户端权限')
      return
    }

    const payload = buildPayload()
    payload.updated_at = new Date().toISOString()
    if (form.password) payload.password = form.password

    const { error } = await supabase.from('customers').update(payload).eq('id', form.id)
    if (error) throw error

    ElMessage.success('修改已保存，请上传车辆档案')
    dialogVisible.value = false

    await fetchData()

    openImportDialog(form.id, form.name)
  } catch (e) {
    if (e?.message) ElMessage.error('操作失败：' + e.message)
  }
}

// ============================================================
// 批量导入车辆
// ============================================================
const importDialogVisible = ref(false)
const importCustomer = ref({ id: '', name: '' })
const uploadRef = ref(null)
const uploadFile = ref(null)
const uploadFileName = ref('')
const importErrors = ref([])
const importing = ref(false)

const templateHeaders = [
  '车牌号', 'VIN码', '车辆昵称',
  '燃料类型', '车辆类型', '车辆用途', '子母车', '关联挂车',
  '车辆购买日', '保险购买日',
]

const openImportDialog = (customerId, customerName) => {
  importCustomer.value = { id: customerId, name: customerName }
  uploadFile.value = null
  uploadFileName.value = ''
  importErrors.value = []
  importDialogVisible.value = true
}

const downloadTemplate = async () => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('车辆档案导入模板')

  const headerRow = worksheet.addRow(templateHeaders)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8102E' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
  })

  const sampleData = [
    '粤A12345', 'LGAX3AG59N9009177', '我的车',
    '新能源', '牵引车', '快递快运', '否', '无',
    '2026-01-01', '2026-01-01',
  ]
  const dataRow = worksheet.addRow(sampleData)
  dataRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
  })
  worksheet.columns = templateHeaders.map(() => ({ width: 18 }))

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '车辆档案导入模板.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const handleFileChange = (file) => {
  uploadFile.value = file.raw
  uploadFileName.value = file.name
  importErrors.value = []
}

const handleFileRemove = () => {
  uploadFile.value = null
  uploadFileName.value = ''
  importErrors.value = []
}

const confirmImport = async () => {
  if (!uploadFile.value) { ElMessage.warning('请先选择文件'); return }

  importing.value = true
  importErrors.value = []

  const loadingInstance = ElLoading.service({
    fullscreen: true,
    text: '正在导入数据...',
    background: 'rgba(0, 0, 0, 0.7)',
  })

  try {
    const file = uploadFile.value
    const fileExt = file.name.split('.').pop().toLowerCase()
    let rows = []

    if (fileExt === 'csv') {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) { ElMessage.error('文件为空或格式不正确'); return }
      rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()))
    } else if (['xlsx', 'xls'].includes(fileExt)) {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      if (json.length < 2) { ElMessage.error('文件为空或格式不正确'); return }
      rows = json.slice(1)
    } else {
      ElMessage.error('不支持的文件格式，请上传 .csv 或 .xlsx')
      return
    }

    const validData = []
    const errors = []

    rows.forEach((row, index) => {
      const rowNum = index + 2
      const [
        plate, vin, nickname,
        fuelType, vehicleType, usage, subVehicle, trailer,
        purchaseDate, insuranceDate,
      ] = row.map(cell => (cell || '').toString().trim())

      const missing = []
      if (!plate) missing.push('车牌号')
      if (!vin) missing.push('VIN码')
      if (missing.length) {
        errors.push(`第 ${rowNum} 行：缺少必填字段：${missing.join('、')}`)
        return
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (purchaseDate && !dateRegex.test(purchaseDate)) {
        errors.push(`第 ${rowNum} 行：车辆购买日格式错误，应为 YYYY-MM-DD`)
        return
      }
      if (insuranceDate && !dateRegex.test(insuranceDate)) {
        errors.push(`第 ${rowNum} 行：保险购买日格式错误，应为 YYYY-MM-DD`)
        return
      }

      validData.push({
        plate,
        vin,
        nickname: nickname || null,
        org: importCustomer.value.name,
        customer_id: importCustomer.value.id,
        driver: null,
        fuel_type: fuelType || null,
        vehicle_type: vehicleType || null,
        usage: usage || null,
        sub_vehicle: subVehicle || null,
        trailer: trailer || null,
        purchase_date: purchaseDate || null,
        insurance_date: insuranceDate || null,
        updated_at: new Date().toISOString(),
      })
    })

    if (errors.length) {
      importErrors.value = errors.slice(0, 20)
      ElMessage.error(`存在 ${errors.length} 条错误，请修正后重试`)
      return
    }

    if (validData.length === 0) {
      ElMessage.warning('没有有效数据可导入')
      return
    }

    const existingPlates = new Set()
    const { data: existingData } = await withTimeout(
      supabase.from('vehicles').select('plate').in('plate', validData.map(v => v.plate)),
      15000,
      '查询已有车辆超时'
    )
    if (existingData) existingData.forEach(item => existingPlates.add(item.plate))

    const updateData = []
    const insertData = []
    validData.forEach(item => {
      if (existingPlates.has(item.plate)) {
        updateData.push(item)
      } else {
        insertData.push({ ...item, created_at: new Date().toISOString() })
      }
    })

    for (const item of updateData) {
      const { error } = await withTimeout(
        supabase.from('vehicles').update(item).eq('plate', item.plate),
        10000,
        `更新车牌 ${item.plate} 超时`
      )
      if (error) throw error
    }

    if (insertData.length > 0) {
      const { error } = await withTimeout(
        supabase.from('vehicles').insert(insertData),
        15000,
        '批量插入数据超时'
      )
      if (error) throw error
    }

    ElMessage.success(`导入完成：更新 ${updateData.length} 条，新增 ${insertData.length} 条`)
    importDialogVisible.value = false
    uploadFile.value = null
    uploadFileName.value = ''
    importErrors.value = []

    await fetchData()
  } catch (err) {
    ElMessage.error('导入失败：' + err.message)
  } finally {
    importing.value = false
    loadingInstance.close()
  }
}

const skipImport = () => {
  importDialogVisible.value = false
}

// ============================================================
// 删除客户
// ============================================================
const handleDelete = async (row) => {
  let vehicleCount = 0
  try {
    const { count, error } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', row.id)
    if (error) throw error
    vehicleCount = count || 0
  } catch (e) {
    ElMessage.error('查询车辆信息失败：' + (e?.message || e))
    return
  }

  let message = ''
  if (vehicleCount > 0) {
    message = `客户「${row.name}」名下还有 ${vehicleCount} 台绑定车辆，删除后这些车辆将被释放（取消绑定，车辆本身不会删除）。确定继续删除该客户吗？`
  } else {
    message = `确定删除客户「${row.name}」？删除后该客户将无法登录客户端。`
  }

  try {
    await ElMessageBox.confirm(
      message,
      vehicleCount > 0 ? '⚠️ 删除客户' : '删除客户',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        closeOnClickModal: false,
      }
    )
  } catch {
    return
  }

  const loadingInstance = ElLoading.service({
    fullscreen: true,
    text: '正在删除...',
    background: 'rgba(0, 0, 0, 0.7)',
  })

  try {
    if (vehicleCount > 0) {
      const { error: releaseError } = await supabase
        .from('vehicles')
        .update({
          customer_id: null,
          org: null,
          updated_at: new Date().toISOString(),
        })
        .eq('customer_id', row.id)
      if (releaseError) throw releaseError
    }

    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', row.id)
    if (deleteError) throw deleteError

    if (vehicleCount > 0) {
      ElMessage.success(`已删除客户，并释放 ${vehicleCount} 台车辆`)
    } else {
      ElMessage.success('删除成功')
    }

    fetchData()
  } catch (e) {
    ElMessage.error('删除失败：' + (e?.message || e))
  } finally {
    loadingInstance.close()
  }
}

// ============================================================
// 重置密码
// ============================================================
const passwordDialogVisible = ref(false)
const passwordFormRef = ref(null)
const passwordForm = reactive({ id: '', name: '', newPassword: '' })
const passwordRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6~32 位', trigger: 'blur' },
  ],
}

const openResetPassword = (row) => {
  Object.assign(passwordForm, { id: row.id, name: row.name, newPassword: '' })
  passwordDialogVisible.value = true
  passwordFormRef.value?.clearValidate?.()
}

const submitResetPassword = async () => {
  if (!passwordFormRef.value) return
  try {
    await passwordFormRef.value.validate()
    const { error } = await supabase
      .from('customers')
      .update({ password: passwordForm.newPassword, updated_at: new Date().toISOString() })
      .eq('id', passwordForm.id)
    if (error) throw error
    ElMessage.success(`客户「${passwordForm.name}」密码已重置`)
    passwordDialogVisible.value = false
  } catch (e) {
    if (e?.message) ElMessage.error('重置失败：' + e.message)
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="admin-customer">
    <section class="light-panel">
      <div class="filter-grid">
        <el-input v-model="filters.name" placeholder="客户名称" clearable />
        <el-input v-model="filters.phone" placeholder="登录手机号" clearable />
        <el-input v-model="filters.contactPerson" placeholder="联系人" clearable />
        <el-input v-model="filters.contactPhone" placeholder="联系电话" clearable />
        <el-select v-model="filters.platform" placeholder="开通平台" clearable popper-class="light-select-popper">
          <el-option v-for="p in platformFilterOptions" :key="p.value" :label="p.label" :value="p.value" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable popper-class="light-select-popper">
          <el-option v-for="s in statusFilterOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </div>

      <div class="filter-actions">
        <button class="action-btn primary" @click="handleSearch">
          <el-icon><Search /></el-icon> 搜索
        </button>
        <button class="action-btn" @click="openAdd">
          <el-icon><Plus /></el-icon> 新增客户
        </button>
        <button class="action-btn ghost" @click="handleReset">重置</button>
      </div>
    </section>

    <section class="light-panel table-panel">
      <div class="panel-title">
        <span class="dot"></span>
        <span>客户列表</span>
        <span class="count">共 {{ total }} 条</span>
      </div>

      <el-table
        :data="tableData"
        v-loading="loading"
        class="light-table"
        empty-text="暂无客户"
        stripe
      >
        <el-table-column prop="name" label="客户名称" min-width="160" />
        <el-table-column prop="phone" label="登录手机号" min-width="130" />
        <el-table-column label="地区" min-width="130">
          <template #default="{ row }">
            {{ row.province && row.city ? `${row.province} · ${row.city}` : '--' }}
          </template>
        </el-table-column>
        <el-table-column prop="contactPerson" label="联系人" min-width="90">
          <template #default="{ row }">{{ row.contactPerson || '--' }}</template>
        </el-table-column>
        <el-table-column prop="contactPhone" label="联系电话" min-width="130">
          <template #default="{ row }">{{ row.contactPhone || '--' }}</template>
        </el-table-column>
        <el-table-column label="开通平台" min-width="110">
          <template #default="{ row }">
            <span v-if="row.platforms?.includes('client')" class="platform-tag client">客户端</span>
            <span v-else style="color:#94A3B8;">--</span>
          </template>
        </el-table-column>
        <el-table-column prop="vehicleCount" label="车辆数" width="80" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span class="status-tag" :class="row.status === 1 ? 'on' : 'off'">
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <button class="row-btn" @click="openEdit(row)">
              <el-icon><Edit /></el-icon> 编辑
            </button>
            <button class="row-btn" @click="openResetPassword(row)">
              <el-icon><Key /></el-icon> 重置密码
            </button>
            <button
              class="row-btn"
              :class="row.status === 1 ? 'warning' : 'success'"
              @click="handleToggleStatus(row)"
            >
              <el-icon>
                <CircleClose v-if="row.status === 1" />
                <CircleCheck v-else />
              </el-icon>
              {{ row.status === 1 ? '停用' : '启用' }}
            </button>
            <button class="row-btn danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon> 删除
            </button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </section>

    <!-- 新增/编辑客户弹窗（内容不变） -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'add' ? '新增客户' : '编辑客户'"
      width="880px"
      class="light-dialog customer-dialog"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="customer-form"
        autocomplete="off"
      >
        <div class="form-section">
          <div class="section-header">
            <span class="section-bar"></span>
            <span class="section-title">账号信息</span>
          </div>
          <div class="section-body grid-2">
            <el-form-item label="登录手机（作为账号）" prop="phone">
              <el-input
                v-model="form.phone"
                placeholder="请输入手机号"
                maxlength="11"
                autocomplete="off"
                name="customer-phone-no-autofill"
              />
            </el-form-item>
            <el-form-item label="初始密码" prop="password">
              <el-input
                v-model="form.password"
                type="password"
                show-password
                :placeholder="dialogMode === 'add' ? '请输入初始密码' : '不修改请留空'"
                autocomplete="new-password"
                name="customer-password-no-autofill"
              />
            </el-form-item>
          </div>
        </div>

        <div class="form-section">
          <div class="section-header">
            <span class="section-bar"></span>
            <span class="section-title">客户信息</span>
          </div>
          <div class="section-body grid-3">
            <el-form-item label="客户名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入客户名称" />
            </el-form-item>
            <el-form-item label="省">
              <el-select v-model="form.province" placeholder="请选择省份（选填）" style="width:100%;" filterable clearable popper-class="light-select-popper">
                <el-option v-for="p in provinceOptions" :key="p.value" :label="p.label" :value="p.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="市">
              <el-select v-model="form.city" placeholder="请选择城市（选填）" style="width:100%;" filterable clearable popper-class="light-select-popper" :disabled="!form.province">
                <el-option v-for="c in cityOptions" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="法人代表">
              <el-input v-model="form.legalPerson" placeholder="请输入法人代表（选填）" />
            </el-form-item>
            <el-form-item label="联系人">
              <el-input v-model="form.contactPerson" placeholder="请输入联系人（选填）" />
            </el-form-item>
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input v-model="form.contactPhone" placeholder="请输入联系电话（选填）" maxlength="11" />
            </el-form-item>
          </div>
        </div>

        <div class="form-section">
          <div class="section-header">
            <span class="section-bar"></span>
            <span class="section-title">开通平台</span>
          </div>
          <div class="section-body platform-body">
            <div class="platform-item" :class="{ active: form.enableClient }">
              <div class="platform-header">
                <el-checkbox v-model="form.enableClient" class="platform-check">
                  <span class="platform-name">客户端</span>
                </el-checkbox>
                <span class="platform-hint" v-if="form.enableClient">已开通</span>
                <span class="platform-hint off" v-else>未开通</span>
              </div>
              <div class="platform-config" v-show="form.enableClient">
                <div class="config-label">
                  <span class="config-text">权限配置</span>
                  <button type="button" class="select-all-btn" @click="toggleAllPerms">
                    {{ isAllPermsSelected ? '取消全选' : '全选' }}
                  </button>
                </div>
                <el-checkbox-group v-model="form.clientPerms" class="perm-group">
                  <el-checkbox v-for="p in clientPermissions" :key="p.value" :label="p.value" class="perm-item">
                    {{ p.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
          </div>
        </div>
      </el-form>

      <template #footer>
        <button class="action-btn ghost" @click="dialogVisible = false">取消</button>
        <button class="action-btn" @click="handleSubmit">确定</button>
        <button v-if="dialogMode === 'add'" class="action-btn primary" @click="handleCreateAndAddVehicle">
          <el-icon><Van /></el-icon> 创建并加车
        </button>
        <button v-else class="action-btn primary" @click="handleEditAndAddVehicle">
          <el-icon><Van /></el-icon> 批量加车
        </button>
      </template>
    </el-dialog>

    <!-- 批量导入车辆弹窗 -->
    <el-dialog
      v-model="importDialogVisible"
      title="批量导入车辆"
      width="600px"
      class="light-dialog"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div class="import-customer-tip">
        <span class="tip-icon">!</span>
        正在为客户「<b>{{ importCustomer.name }}</b>」批量导入车辆档案
      </div>

      <div class="import-step">
        <div class="step-header">
          <span class="step-num">1</span>
          <span class="step-title">下载导入模板</span>
        </div>
        <div class="step-body">
          <button class="action-btn" @click="downloadTemplate">
            <el-icon><Download /></el-icon> 下载模板
          </button>
          <span class="step-tip">支持 .csv / .xlsx / .xls</span>
        </div>
      </div>

      <div class="import-step">
        <div class="step-header">
          <span class="step-num">2</span>
          <span class="step-title">上传文件</span>
        </div>
        <div class="step-body step-body-col">
          <el-upload
            ref="uploadRef"
            action="#"
            :auto-upload="false"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            :limit="1"
            accept=".csv,.xlsx,.xls"
            drag
            class="import-upload"
          >
            <div class="upload-inner">
              <el-icon class="upload-icon"><Upload /></el-icon>
              <div class="upload-text">点击或拖拽上传文件</div>
            </div>
          </el-upload>
          <div v-if="uploadFileName" class="upload-filename">
            已选文件：{{ uploadFileName }}
          </div>
        </div>
      </div>

      <div v-if="importErrors.length" class="import-errors">
        <div class="error-title">发现错误：</div>
        <div class="error-list">
          <div v-for="(err, idx) in importErrors" :key="idx">{{ err }}</div>
        </div>
      </div>

      <template #footer>
        <button class="action-btn ghost" @click="skipImport">跳过</button>
        <button class="action-btn primary" @click="confirmImport" :disabled="importing">
          {{ importing ? '导入中...' : '确认导入' }}
        </button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="重置密码"
      width="440px"
      class="light-dialog"
      :close-on-click-modal="false"
    >
      <div class="reset-tip">
        <span class="tip-icon-red">!</span>
        正在为客户「<b>{{ passwordForm.name }}</b>」重置登录密码
      </div>

      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px" class="light-form">
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="请输入 6~32 位新密码" />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="action-btn ghost" @click="passwordDialogVisible = false">取消</button>
        <button class="action-btn primary" @click="submitResetPassword">确认重置</button>
      </template>
    </el-dialog>

    <!-- ============================================================ -->
    <!-- 停用/启用 确认弹窗（自定义，带动画） -->
    <!-- ============================================================ -->
    <transition name="confirm-fade">
      <div v-if="confirmVisible" class="confirm-mask" @click.self="closeConfirm">
        <transition name="confirm-pop" appear>
          <div class="confirm-card" :class="`confirm-${confirmType}`">
            <!-- 图标区 -->
            <div class="confirm-icon-wrap">
              <span class="confirm-ring ring-1"></span>
              <span class="confirm-ring ring-2"></span>
              <div class="confirm-icon">
                <el-icon v-if="confirmType === 'disable'"><CircleClose /></el-icon>
                <el-icon v-else><CircleCheck /></el-icon>
              </div>
            </div>

            <h3 class="confirm-title">{{ confirmTitle }}</h3>
            <p class="confirm-desc" v-html="confirmDesc.replace(`「${confirmRow?.name}」`, `<b>「${confirmRow?.name}」</b>`)"></p>

            <div class="confirm-actions">
              <button class="confirm-btn cancel" @click="closeConfirm">取消</button>
              <button class="confirm-btn ok" @click="confirmAction">{{ confirmOkText }}</button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.admin-customer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: pageIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.table-panel { display: flex; flex-direction: column; }

@keyframes pageIn {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.platform-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
}
.platform-tag.client {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.25);
}

.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.status-tag.on  { color: #059669; background: #D1FAE5; }
.status-tag.off { color: #64748B; background: #F1F5F9; }

/* 停用/启用按钮 */
.row-btn.warning {
  color: #B45309;
  border-color: rgba(217, 119, 6, 0.4);
  background: #FFFFFF;
}
.row-btn.warning:hover:not(:disabled) {
  color: #FFFFFF;
  background: linear-gradient(135deg, #F59E0B, #D97706);
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.35);
}

.row-btn.success {
  color: #059669;
  border-color: rgba(5, 150, 105, 0.4);
  background: #FFFFFF;
}
.row-btn.success:hover:not(:disabled) {
  color: #FFFFFF;
  background: linear-gradient(135deg, #10B981, #059669);
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
}

/* ============================================================
   停用/启用 确认弹窗
   ============================================================ */
.confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.28s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-pop-enter-active {
  transition: all 0.48s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.confirm-pop-leave-active {
  transition: all 0.22s ease;
}
.confirm-pop-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(30px);
}
.confirm-pop-leave-to {
  opacity: 0;
  transform: scale(0.92) translateY(12px);
}

.confirm-card {
  position: relative;
  width: 420px;
  max-width: calc(100vw - 40px);
  padding: 36px 36px 26px;
  border-radius: 18px;
  background: #FFFFFF;
  box-shadow:
    0 30px 80px rgba(15, 23, 42, 0.22),
    0 0 0 1px rgba(226, 232, 240, 0.6) inset;
  text-align: center;
  overflow: hidden;
}

/* 顶部彩色流光条 */
.confirm-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  border-radius: 18px 18px 0 0;
}
.confirm-card.confirm-disable::before {
  background: linear-gradient(90deg, #F59E0B, #F97316, #F59E0B, #F97316);
  background-size: 200% 100%;
  animation: confirm-bar-flow 2.4s linear infinite;
}
.confirm-card.confirm-enable::before {
  background: linear-gradient(90deg, #10B981, #059669, #10B981, #059669);
  background-size: 200% 100%;
  animation: confirm-bar-flow 2.4s linear infinite;
}
@keyframes confirm-bar-flow {
  0%   { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}

/* 图标区 */
.confirm-icon-wrap {
  position: relative;
  width: 88px;
  height: 88px;
  margin: 0 auto 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
}
.confirm-disable .confirm-ring { border: 2px solid rgba(245, 158, 11, 0.55); }
.confirm-enable .confirm-ring { border: 2px solid rgba(16, 185, 129, 0.55); }
.confirm-ring.ring-1 {
  animation: confirm-ring-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.confirm-ring.ring-2 {
  animation: confirm-ring-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  animation-delay: 0.8s;
}
@keyframes confirm-ring-pulse {
  0%   { transform: scale(0.85); opacity: 0.9; }
  100% { transform: scale(1.75);  opacity: 0; }
}

.confirm-icon {
  position: relative;
  z-index: 2;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  animation: confirm-icon-pop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.confirm-disable .confirm-icon {
  background: linear-gradient(135deg, #F59E0B, #D97706);
  box-shadow: 0 10px 28px rgba(217, 119, 6, 0.45);
}
.confirm-enable .confirm-icon {
  background: linear-gradient(135deg, #10B981, #059669);
  box-shadow: 0 10px 28px rgba(5, 150, 105, 0.45);
}
.confirm-icon .el-icon { font-size: 34px; }
@keyframes confirm-icon-pop {
  0%   { transform: scale(0) rotate(-180deg); }
  55%  { transform: scale(1.2) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); }
}

/* 标题和描述 */
.confirm-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.5px;
  animation: confirm-fade-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: 0.14s;
}

.confirm-desc {
  margin: 0 0 26px;
  font-size: 13.5px;
  line-height: 1.7;
  color: #64748B;
  animation: confirm-fade-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: 0.22s;
}
.confirm-desc :deep(b) {
  color: #0F172A;
  font-weight: 700;
}

@keyframes confirm-fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 底部按钮 */
.confirm-actions {
  display: flex;
  gap: 12px;
  animation: confirm-fade-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: 0.3s;
}

.confirm-btn {
  flex: 1;
  height: 46px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.6px;
  cursor: pointer;
  font-family: inherit;
  border: none;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
}

.confirm-btn.cancel {
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
}
.confirm-btn.cancel:hover {
  background: #E2E8F0;
  color: #1E293B;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}
.confirm-btn.cancel:active {
  transform: translateY(0) scale(0.98);
}

.confirm-btn.ok {
  color: #FFFFFF;
}
.confirm-disable .confirm-btn.ok {
  background: linear-gradient(135deg, #F59E0B, #D97706);
  box-shadow: 0 6px 20px rgba(217, 119, 6, 0.4);
}
.confirm-enable .confirm-btn.ok {
  background: linear-gradient(135deg, #10B981, #059669);
  box-shadow: 0 6px 20px rgba(5, 150, 105, 0.4);
}
.confirm-btn.ok::before {
  content: '';
  position: absolute;
  top: 0; left: -100%;
  width: 60%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  transition: left 0.65s ease;
}
.confirm-btn.ok:hover {
  transform: translateY(-2px);
}
.confirm-disable .confirm-btn.ok:hover {
  box-shadow: 0 12px 30px rgba(217, 119, 6, 0.55);
}
.confirm-enable .confirm-btn.ok:hover {
  box-shadow: 0 12px 30px rgba(5, 150, 105, 0.55);
}
.confirm-btn.ok:hover::before { left: 130%; }
.confirm-btn.ok:active {
  transform: translateY(0) scale(0.98);
}

/* ============================================================
   新增客户弹窗
   ============================================================ */
.customer-dialog :deep(.el-dialog__body) {
  padding: 8px 24px 8px;
  max-height: 72vh;
  overflow-y: auto;
}
.customer-dialog :deep(.el-dialog__body)::-webkit-scrollbar { width: 6px; }
.customer-dialog :deep(.el-dialog__body)::-webkit-scrollbar-thumb {
  background: #CBD5E1; border-radius: 3px;
}

.customer-form { padding: 4px 0; }

.form-section {
  margin-bottom: 24px;
  animation: sectionFadeIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.form-section:nth-child(1) { animation-delay: 0.05s; }
.form-section:nth-child(2) { animation-delay: 0.12s; }
.form-section:nth-child(3) { animation-delay: 0.19s; }

@keyframes sectionFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #E2E8F0;
}
.section-bar {
  display: block;
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, #c8102e, #a00d24);
  box-shadow: 0 0 8px rgba(200, 16, 46, 0.5);
}
.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 1px;
}

.section-body.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 18px;
}
.section-body.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 18px;
}

.customer-form :deep(.el-form-item) { margin-bottom: 8px; }
.customer-form :deep(.el-form-item__label) {
  font-size: 12.5px;
  font-weight: 600;
  color: #475569;
  padding-bottom: 6px;
  line-height: 1.4;
}
.customer-form :deep(.el-input__wrapper),
.customer-form :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.customer-form :deep(.el-input__wrapper:hover),
.customer-form :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
  background: #FFFFFF !important;
  transform: translateY(-1px);
}
.customer-form :deep(.el-input__wrapper.is-focus),
.customer-form :deep(.el-select__wrapper.is-focused) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
  transform: translateY(-1px);
}

.platform-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.platform-item {
  padding: 18px 20px;
  border-radius: 12px;
  background: #F8FAFC;
  border: 1.5px solid #E2E8F0;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
}
.platform-item::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: #CBD5E1;
  transition: background 0.3s;
}
.platform-item.active {
  background: #FFFFFF;
  border-color: rgba(200, 16, 46, 0.4);
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.1);
}
.platform-item.active::before {
  background: linear-gradient(180deg, #c8102e, #a00d24);
  box-shadow: 0 0 8px rgba(200, 16, 46, 0.6);
}

.platform-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.platform-check { flex: 1; }
.platform-check :deep(.el-checkbox__label) {
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  padding-left: 8px;
  line-height: 18px;
}
.platform-check :deep(.el-checkbox__inner) {
  width: 18px !important;
  height: 18px !important;
  border-radius: 5px !important;
  border-color: #CBD5E1;
  position: relative;
  display: inline-block;
}
.platform-check :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border-color: #c8102e !important;
}
.platform-check :deep(.el-checkbox__inner::after) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 9px;
  border: 2px solid #FFFFFF;
  border-top: 0;
  border-left: 0;
  box-sizing: border-box;
  transform: translate(-50%, -60%) rotate(45deg) scaleY(0);
  transform-origin: center;
  transition: transform 0.15s ease-in 0.05s;
}
.platform-check :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  transform: translate(-50%, -60%) rotate(45deg) scaleY(1);
}

.platform-name {
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  letter-spacing: 0.5px;
}

.platform-hint {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #D1FAE5;
  padding: 2px 10px;
  border-radius: 999px;
  animation: hintPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.platform-hint.off {
  color: #94A3B8;
  background: #F1F5F9;
  animation: none;
}
@keyframes hintPop {
  from { transform: scale(0.8); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.platform-config {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed #E2E8F0;
  animation: configSlide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes configSlide {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.config-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.config-text {
  font-size: 12.5px;
  font-weight: 700;
  color: #475569;
}

.select-all-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #c8102e;
  background: #FFFFFF;
  border: 1px solid rgba(200, 16, 46, 0.35);
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.select-all-btn:hover {
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.3);
  transform: translateY(-1px);
}

.perm-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
}

.perm-item {
  margin: 0 !important;
  padding: 8px 12px;
  border-radius: 8px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  height: auto !important;
  display: flex;
  align-items: center;
}
.perm-item:hover {
  border-color: rgba(200, 16, 46, 0.4);
  background: #FEF2F2;
  transform: translateY(-1px);
}
.perm-item:has(.el-checkbox__input.is-checked) {
  background: #FEF2F2;
  border-color: rgba(200, 16, 46, 0.4);
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.1);
}
.perm-item :deep(.el-checkbox__label) {
  font-size: 12.5px;
  color: #475569;
  padding-left: 8px;
  font-weight: 500;
  line-height: 16px;
}
.perm-item :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #c8102e;
  font-weight: 700;
}
.perm-item :deep(.el-checkbox__inner) {
  width: 16px !important;
  height: 16px !important;
  border-radius: 4px !important;
  border-color: #CBD5E1;
  position: relative;
  display: inline-block;
}
.perm-item :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border-color: #c8102e !important;
}
.perm-item :deep(.el-checkbox__inner::after) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 8px;
  border: 2px solid #FFFFFF;
  border-top: 0;
  border-left: 0;
  box-sizing: border-box;
  transform: translate(-50%, -60%) rotate(45deg) scaleY(0);
  transform-origin: center;
  transition: transform 0.15s ease-in 0.05s;
}
.perm-item :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  transform: translate(-50%, -60%) rotate(45deg) scaleY(1);
}

/* 批量导入 */
.import-customer-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #EFF6FF;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
  margin-bottom: 16px;
}
.import-customer-tip b { color: #2563EB; font-weight: 800; }
.import-customer-tip .tip-icon {
  width: 20px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: #2563EB; color: #fff;
  font-weight: 700; font-size: 12px;
  flex-shrink: 0;
}
.import-step {
  padding: 12px 0;
  border-bottom: 1px dashed #E2E8F0;
}
.import-step:last-of-type { border-bottom: none; }
.step-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
}
.step-num {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #FFFFFF; font-size: 12px; font-weight: 800;
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.3);
}
.step-title { font-size: 13px; font-weight: 700; color: #0F172A; }
.step-body { display: flex; align-items: center; gap: 12px; padding-left: 32px; }
.step-body.step-body-col { flex-direction: column; align-items: stretch; gap: 8px; }
.step-tip { font-size: 12px; color: #94A3B8; }
.import-upload :deep(.el-upload) { width: 100%; }
.import-upload :deep(.el-upload-dragger) {
  border-radius: 8px;
  border: 1.5px dashed #CBD5E1;
  background: #F8FAFC;
  padding: 20px 0;
  transition: all 0.28s;
}
.import-upload :deep(.el-upload-dragger:hover) {
  border-color: #c8102e;
  background: #FEF2F2;
}
.upload-inner { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.upload-icon { font-size: 32px; color: #94A3B8; transition: color 0.3s; }
.import-upload :deep(.el-upload-dragger:hover) .upload-icon { color: #c8102e; }
.upload-text { font-size: 13px; color: #475569; }
.upload-filename {
  font-size: 12px; color: #475569; padding-left: 32px;
  font-family: 'Courier New', monospace;
}
.import-errors {
  margin-top: 12px; padding: 10px 14px;
  background: #FEF2F2; border: 1px solid #FCA5A5;
  border-radius: 8px; max-height: 140px; overflow-y: auto;
}
.error-title { font-size: 12px; font-weight: 700; color: #991B1B; margin-bottom: 6px; }
.error-list {
  font-size: 12px; color: #B91C1C; line-height: 1.6;
  font-family: 'Courier New', monospace;
}

/* 重置密码 */
.reset-tip {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: #FEF2F2; border: 1px solid rgba(200, 16, 46, 0.18);
  border-radius: 8px; font-size: 13px; color: #475569;
  margin-bottom: 18px;
}
.reset-tip b { color: #c8102e; }
.tip-icon-red {
  width: 20px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: #c8102e; color: #fff;
  font-weight: 700; font-size: 12px;
  flex-shrink: 0;
}

@media (max-width: 1200px) {
  .section-body.grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .perm-group { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .section-body.grid-2,
  .section-body.grid-3 { grid-template-columns: 1fr; }
  .perm-group { grid-template-columns: 1fr; }
}
</style>