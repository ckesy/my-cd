<template>
  <div class="user-manage-page">
    <!-- ============ 视图切换 ============ -->
    <div class="view-switch">
      <button class="view-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">
        <el-icon>
          <List />
        </el-icon> 列表视图
      </button>
      <button class="view-btn" :class="{ active: viewMode === 'tree' }" @click="viewMode = 'tree'">
        <el-icon>
          <Share />
        </el-icon> 组织机构
      </button>
      <span v-if="!isAdmin" class="scope-tip">
        <el-icon>
          <InfoFilled />
        </el-icon>
        当前仅显示您创建的子账号
      </span>
    </div>

    <!-- ============ 列表视图 ============ -->
    <template v-if="viewMode === 'list'">
      <div class="search-card" v-show="!isTableFullscreen">
        <div class="search-row">
          <div class="search-item">
            <label>登录账号</label>
            <el-input v-model="searchForm.account" placeholder="请输入登录账号" clearable size="default" />
          </div>
          <div class="search-item">
            <label>用户姓名</label>
            <el-input v-model="searchForm.name" placeholder="请输入用户姓名" clearable size="default" />
          </div>
          <div class="search-item">
            <label>角色</label>
            <el-select v-model="searchForm.role" placeholder="请选择角色" clearable size="default">
              <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.name" />
            </el-select>
          </div>
          <div class="search-item">
            <label>所属组织</label>
            <el-select v-model="searchForm.org" placeholder="请选择所属组织" clearable size="default">
              <el-option v-for="o in orgList" :key="o.id" :label="o.name" :value="o.name" />
            </el-select>
          </div>
          <div class="search-item" v-show="searchExpanded">
            <label>状态</label>
            <el-select v-model="searchForm.status" placeholder="请选择状态" clearable size="default">
              <el-option label="启用" :value="1" />
              <el-option label="禁用" :value="0" />
            </el-select>
          </div>
          <div class="search-actions">
            <el-button type="primary" class="btn-primary" size="default" @click="handleSearch">
              <el-icon>
                <Search />
              </el-icon> 查询
            </el-button>
            <el-button class="btn-outline" size="default" @click="handleReset">
              <el-icon>
                <Refresh />
              </el-icon> 重置
            </el-button>
            <span class="expand-toggle" @click="searchExpanded = !searchExpanded">
              {{ searchExpanded ? '收起' : '展开' }}
              <el-icon class="toggle-icon" :class="{ rotated: searchExpanded }">
                <ArrowUp />
              </el-icon>
            </span>
          </div>
        </div>
      </div>

      <Teleport to="body" :disabled="!isTableFullscreen">
        <div class="table-card-wrap" :class="{ 'is-fullscreen': isTableFullscreen }">
          <div class="table-card">
            <div class="toolbar">
              <div class="toolbar-left">
                <span class="total-hint">
                  共 <b>{{ filteredData.length }}</b> 条{{ !isAdmin ? '（您创建的子账号）' : '' }}
                </span>
              </div>
              <div class="toolbar-right">
                <el-button type="primary" class="btn-primary" size="default" @click="handleAdd">
                  <el-icon>
                    <CirclePlus />
                  </el-icon> 新增用户
                </el-button>

                <button class="icon-btn" @click="handleRefresh" title="刷新">
                  <el-icon>
                    <Refresh />
                  </el-icon>
                </button>

                <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handleDensityChange">
                  <button class="icon-btn" title="密度">
                    <el-icon>
                      <Operation />
                    </el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="large"><span class="density-item"
                          :class="{ active: tableSize === 'large' }">宽松</span></el-dropdown-item>
                      <el-dropdown-item command="default"><span class="density-item"
                          :class="{ active: tableSize === 'default' }">默认</span></el-dropdown-item>
                      <el-dropdown-item command="small"><span class="density-item"
                          :class="{ active: tableSize === 'small' }">紧凑</span></el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <el-popover v-model:visible="columnPopoverVisible" placement="bottom-end" :width="280" trigger="click"
                  popper-class="column-setting-popper">
                  <template #reference>
                    <button class="icon-btn" :class="{ active: columnPopoverVisible }" title="列设置">
                      <el-icon>
                        <Setting />
                      </el-icon>
                    </button>
                  </template>
                  <div class="column-setting">
                    <div class="column-setting-header">
                      <span class="col-title"><el-icon>
                          <Grid />
                        </el-icon> 列展示</span>
                      <span class="col-reset" @click="resetColumns">重置</span>
                    </div>
                    <div class="column-setting-body">
                      <div v-for="(col, index) in columnConfig" :key="col.prop" class="column-item"
                        :class="{ dragging: dragIndex === index, dragOver: dragOverIndex === index }" draggable="true"
                        @dragstart="onDragStart(index)" @dragover.prevent="onDragOver(index)" @drop="onDrop(index)"
                        @dragend="onDragEnd">
                        <span class="drag-handle"><el-icon>
                            <Rank />
                          </el-icon></span>
                        <el-checkbox v-model="col.visible" class="col-checkbox">{{ col.label }}</el-checkbox>
                        <div class="fix-actions">
                          <button class="fix-btn" :class="{ active: col.fixed === 'left' }"
                            @click="toggleFix(col, 'left')" title="左固定"><el-icon>
                              <DArrowLeft />
                            </el-icon></button>
                          <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                            @click="toggleFix(col, 'right')" title="右固定"><el-icon>
                              <DArrowRight />
                            </el-icon></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </el-popover>

                <button class="icon-btn" :class="{ active: isTableFullscreen }" @click="toggleTableFullscreen"
                  :title="isTableFullscreen ? '退出全屏' : '表格全屏'">
                  <el-icon>
                    <component :is="isTableFullscreen ? Close : FullScreen" />
                  </el-icon>
                </button>
              </div>
            </div>

            <el-table ref="tableRef" :data="pagedData" v-loading="loading" border stripe :size="tableSize"
              class="custom-table" :header-cell-style="{ background: '#F8FAFC', color: '#0F172A', fontWeight: '700' }">
              <template v-for="col in visibleColumns" :key="col.prop">
                <el-table-column v-if="col.prop === 'status'" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="status-tag" :class="row.status === 1 ? 'on' : 'off'">
                      {{ row.status === 1 ? '启用' : '禁用' }}
                    </span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'orgName'" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.orgName && row.orgName !== '--'" class="org-tag">
                      <el-icon>
                        <OfficeBuilding />
                      </el-icon>
                      {{ row.orgName }}
                    </span>
                    <span v-else class="text-muted">--</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'roleName'" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.roleName && row.roleName !== '--'" class="role-tag">
                      {{ row.roleName }}
                    </span>
                    <span v-else class="text-muted">--</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'created_at' || col.prop === 'updated_at'" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <span class="time-text">{{ formatDateTime(row[col.prop]) }}</span>
                  </template>
                </el-table-column>

                <el-table-column v-else-if="col.prop === 'action'" :label="col.label"
                  :width="col.width ? Math.round(col.width * densityMultiplier) : 240" :align="col.align"
                  :fixed="col.fixed || false">
                  <template #default="{ row }">
                    <div class="action-cell">
                      <button class="action-btn action-edit" @click="handleEdit(row)">
                        <el-icon>
                          <EditPen />
                        </el-icon>
                        <span>编辑</span>
                      </button>
                      <button class="action-btn action-toggle" @click="handleToggleStatus(row)">
                        <el-icon>
                          <Lock />
                        </el-icon>
                        <span>{{ row.status === 1 ? '禁用' : '启用' }}</span>
                      </button>
                      <el-dropdown trigger="click" popper-class="more-dropdown-red"
                        @command="(cmd) => handleCommand(cmd, row)">
                        <button class="action-btn action-more">
                          <span>更多</span>
                          <el-icon class="more-icon">
                            <ArrowDown />
                          </el-icon>
                        </button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item command="permission"><el-icon>
                                <Key />
                              </el-icon> 权限配置</el-dropdown-item>
                            <el-dropdown-item command="resetPwd"><el-icon>
                                <RefreshLeft />
                              </el-icon> 重置密码</el-dropdown-item>
                            <el-dropdown-item command="delete" divided><el-icon>
                                <Delete />
                              </el-icon> 删除</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column v-else :prop="col.prop" :label="col.label"
                  :min-width="Math.round(col.minWidth * densityMultiplier)" :align="col.align"
                  :fixed="col.fixed || false" show-overflow-tooltip>
                  <template #default="{ row }">
                    {{ row[col.prop] || '--' }}
                  </template>
                </el-table-column>
              </template>

              <template #empty>
                <div class="empty-state">
                  <el-icon class="empty-icon">
                    <User />
                  </el-icon>
                  <p>暂无用户数据</p>
                  <span class="empty-tip">{{ isAdmin ? '点击右上角「新增用户」开始创建' : '点击右上角「新增用户」为您的车队创建子账号' }}</span>
                </div>
              </template>
            </el-table>

            <div class="pagination-wrapper">
              <span class="total-text">共 {{ filteredData.length }} 条</span>
              <el-pagination background :small="tableSize === 'small'" layout="sizes, prev, pager, next, jumper"
                :total="filteredData.length" :page-size="pageSize" :page-sizes="[10, 20, 50, 100]"
                v-model:current-page="currentPage" @size-change="handleSizeChange" class="custom-pagination" />
            </div>
          </div>

          <transition name="fs-fade">
            <button v-if="isTableFullscreen" class="fs-exit-btn" @click="toggleTableFullscreen">
              <el-icon>
                <Close />
              </el-icon> 退出全屏
            </button>
          </transition>
        </div>
      </Teleport>
    </template>

    <!-- ============ 组织机构视图 ============ -->
    <template v-else>
      <div class="org-view-card">
        <div class="org-view-header">
          <div class="org-view-title">
            <el-icon>
              <Share />
            </el-icon>
            组织机构
            <span class="org-view-sub">{{ isAdmin ? '（全局视图）' : '（仅显示您创建的子账号）' }}</span>
          </div>
          <div class="org-view-actions">
            <el-input v-model="orgSearchKeyword" placeholder="搜索组织/车队/用户" clearable size="default"
              class="org-search-input">
              <template #prefix><el-icon>
                  <Search />
                </el-icon></template>
            </el-input>
            <button class="icon-btn" :class="{ active: orgExpandAll }" @click="toggleOrgExpandAll"
              :title="orgExpandAll ? '全部收起' : '全部展开'">
              <el-icon>
                <component :is="orgExpandAll ? Fold : Expand" />
              </el-icon>
            </button>
            <button class="icon-btn" @click="loadOrgTree" title="刷新">
              <el-icon>
                <Refresh />
              </el-icon>
            </button>
          </div>
        </div>

        <div class="org-view-body" v-loading="orgLoading">
          <el-tree v-if="orgTreeData.length > 0" ref="orgTreeRef" :data="orgTreeData" node-key="key" :props="treeProps"
            :default-expand-all="orgExpandAll" :filter-node-method="filterOrgNode" :expand-on-click-node="false"
            class="org-tree">
            <template #default="{ node, data }">
              <div class="tree-node" :class="'type-' + data.type">
                <template v-if="data.type === 'root'">
                  <span class="node-icon root-icon"><el-icon>
                      <OfficeBuilding />
                    </el-icon></span>
                  <span class="node-label">{{ data.label }}</span>
                  <span class="node-count">{{ data.children?.length || 0 }} 个组织</span>
                  <span class="node-vehicles" :class="{ empty: !data.vehicleCount }">
                    <el-icon v-if="data.vehicleCount > 0">
                      <Van />
                    </el-icon>
                    {{ data.vehicleCount > 0 ? `${data.vehicleCount} 辆` : '暂无车辆' }}
                  </span>
                  <span class="node-drivers" :class="{ empty: !data.driverCount }">
                    <el-icon v-if="data.driverCount > 0">
                      <Avatar />
                    </el-icon>
                    {{ data.driverCount > 0 ? `${data.driverCount} 名` : '暂无司机' }}
                  </span>
                </template>

                <template v-else-if="data.type === 'org'">
                  <span class="node-icon org-icon"><el-icon>
                      <OfficeBuilding />
                    </el-icon></span>
                  <span class="node-label">{{ data.label }}</span>
                  <span class="node-count">{{ data.children?.length || 0 }} 项</span>
                  <span class="node-vehicles" :class="{ empty: !data.vehicleCount }">
                    <el-icon v-if="data.vehicleCount > 0">
                      <Van />
                    </el-icon>
                    {{ data.vehicleCount > 0 ? `${data.vehicleCount} 辆` : '暂无车辆' }}
                  </span>
                  <span class="node-drivers" :class="{ empty: !data.driverCount }">
                    <el-icon v-if="data.driverCount > 0">
                      <Avatar />
                    </el-icon>
                    {{ data.driverCount > 0 ? `${data.driverCount} 名` : '暂无司机' }}
                  </span>
                </template>

                <template v-else-if="data.type === 'fleet'">
                  <span class="node-icon fleet-icon"><el-icon>
                      <Van />
                    </el-icon></span>
                  <span class="node-label">{{ data.label }}</span>
                  <span class="node-count">{{ data.children?.length || 0 }} 个用户</span>
                </template>

                <template v-else-if="data.type === 'user'">
                  <span class="node-icon user-icon" :class="{ admin: data.isAdmin }">
                    <el-icon>
                      <component :is="data.isAdmin ? UserFilled : User" />
                    </el-icon>
                  </span>
                  <span class="node-label">{{ data.label }}</span>
                  <span class="node-account">{{ data.account }}</span>
                  <span class="node-role" :class="{ admin: data.isAdmin }">{{ data.roleName }}</span>
                  <span class="node-vehicles" :class="{ empty: !data.vehicleCount }">
                    <el-icon v-if="data.vehicleCount > 0">
                      <Van />
                    </el-icon>
                    {{ data.vehicleCount > 0 ? `${data.vehicleCount} 辆` : '暂无车辆' }}
                  </span>
                  <span class="node-drivers" :class="{ empty: !data.driverCount }">
                    <el-icon v-if="data.driverCount > 0">
                      <Avatar />
                    </el-icon>
                    {{ data.driverCount > 0 ? `${data.driverCount} 名` : '暂无司机' }}
                  </span>
                  <span class="status-tag mini" :class="data.status === 1 ? 'on' : 'off'">
                    {{ data.status === 1 ? '启用' : '禁用' }}
                  </span>
                  <span v-if="data.ownerName" class="node-owner">由 {{ data.ownerName }} 创建</span>
                </template>
              </div>
            </template>
          </el-tree>

          <div v-else class="org-empty">
            <el-icon class="empty-icon">
              <Share />
            </el-icon>
            <p>暂无组织机构数据</p>
            <span class="empty-tip">{{ isAdmin ? '请先在「组织管理」中创建组织' : '您还未创建子账号' }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 新增/编辑用户弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑用户' : '新增用户'" width="560px" destroy-on-close
      :close-on-click-modal="false" class="manage-dialog">
      <el-form :model="form" label-width="90px" class="manage-form" size="default">
        <el-form-item label="登录账号" required>
          <el-input v-model="form.account" placeholder="请输入登录账号" maxlength="32" clearable />
        </el-form-item>
        <el-form-item label="用户姓名" required>
          <el-input v-model="form.name" placeholder="请输入用户姓名" maxlength="32" clearable />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" clearable />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="请输入邮箱" maxlength="64" clearable />
        </el-form-item>
        <el-form-item label="所属组织" required>
          <el-tree-select v-model="form.org_id" :data="orgTreeForSelect" node-key="id"
            :props="{ children: 'children', label: 'name' }" placeholder="请选择所属组织" check-strictly
            :render-after-expand="false" default-expand-all clearable style="width:100%;"
            popper-class="org-tree-select-popper" />
        </el-form-item>
        <el-form-item label="角色" required>
          <div class="role-select-wrap">
            <el-select v-model="form.role_id" placeholder="请选择角色" clearable style="width:100%;">
              <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
              <template #empty>
                <div class="role-empty">
                  <p>暂无可用角色</p>
                  <button type="button" class="create-role-btn" @click="goCreateRole">
                    + 去创建角色
                  </button>
                </div>
              </template>
            </el-select>
            <div v-if="roleOptions.length === 0" class="role-empty-tip">
              <span>您还没有任何角色，</span>
              <button type="button" class="role-empty-link" @click="goCreateRole">立即创建 →</button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="密码" :required="!isEdit">
          <el-input v-model="form.password" :placeholder="isEdit ? '不修改请留空' : '请输入密码'" show-password maxlength="32" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注" maxlength="200"
            show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-outline" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" class="btn-primary" :loading="saving" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>

    <!-- 权限配置弹窗 -->
    <el-dialog v-model="permDialogVisible" :title="`权限配置 - ${permTargetUser?.name || ''}`" width="1000px" top="6vh"
      destroy-on-close :close-on-click-modal="false" class="permission-dialog">
      <div class="perm-tabs">
        <div v-for="tab in permTabs" :key="tab.key" class="perm-tab" :class="{ active: permActiveTab === tab.key }"
          @click="permActiveTab = tab.key">
          {{ tab.label }}
          <span class="perm-tab-bar"></span>
        </div>
      </div>

      <div class="perm-content">
        <div class="perm-search-row">
          <el-input v-model="permSearchKeyword" placeholder="请输入数据名称" clearable class="perm-search-input"
            size="default">
            <template #prefix><el-icon>
                <Search />
              </el-icon></template>
          </el-input>
          <el-button type="primary" class="btn-primary" size="default" @click="handlePermSearch">
            <el-icon>
              <Search />
            </el-icon> 查询
          </el-button>
          <div class="perm-right-actions">
            <el-button type="primary" class="btn-enable" size="default" @click="handlePermBatchEnable">
              <el-icon><Select /></el-icon> 启用
            </el-button>
            <el-button type="danger" plain class="btn-disable" size="default" @click="handlePermBatchDisable">
              <el-icon>
                <CircleClose />
              </el-icon> 禁用
            </el-button>
            <button class="icon-btn small" @click="handlePermRefresh" title="刷新">
              <el-icon>
                <Refresh />
              </el-icon>
            </button>
            <el-dropdown trigger="click" popper-class="density-dropdown-red" @command="handlePermDensityChange">
              <button class="icon-btn small" title="密度"><el-icon>
                  <Operation />
                </el-icon></button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="large"><span class="density-item"
                      :class="{ active: permTableSize === 'large' }">宽松</span></el-dropdown-item>
                  <el-dropdown-item command="default"><span class="density-item"
                      :class="{ active: permTableSize === 'default' }">默认</span></el-dropdown-item>
                  <el-dropdown-item command="small"><span class="density-item"
                      :class="{ active: permTableSize === 'small' }">紧凑</span></el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-popover v-model:visible="permColumnPopoverVisible" placement="bottom-end" :width="280" trigger="click"
              popper-class="column-setting-popper">
              <template #reference>
                <button class="icon-btn small" :class="{ active: permColumnPopoverVisible }" title="列设置">
                  <el-icon>
                    <Setting />
                  </el-icon>
                </button>
              </template>
              <div class="column-setting">
                <div class="column-setting-header">
                  <span class="col-title"><el-icon>
                      <Grid />
                    </el-icon> 列展示</span>
                  <span class="col-reset" @click="resetPermColumns">重置</span>
                </div>
                <div class="column-setting-body">
                  <div v-for="(col, index) in permColumnConfig" :key="col.prop" class="column-item"
                    :class="{ dragging: permDragIndex === index, dragOver: permDragOverIndex === index }"
                    draggable="true" @dragstart="onPermDragStart(index)" @dragover.prevent="onPermDragOver(index)"
                    @drop="onPermDrop(index)" @dragend="onPermDragEnd">
                    <span class="drag-handle"><el-icon>
                        <Rank />
                      </el-icon></span>
                    <el-checkbox v-model="col.visible" class="col-checkbox">{{ col.label }}</el-checkbox>
                    <div class="fix-actions">
                      <button class="fix-btn" :class="{ active: col.fixed === 'left' }"
                        @click="togglePermFix(col, 'left')" title="左固定"><el-icon>
                          <DArrowLeft />
                        </el-icon></button>
                      <button class="fix-btn" :class="{ active: col.fixed === 'right' }"
                        @click="togglePermFix(col, 'right')" title="右固定"><el-icon>
                          <DArrowRight />
                        </el-icon></button>
                    </div>
                  </div>
                </div>
              </div>
            </el-popover>
          </div>
        </div>

        <el-table :data="permTableData" border stripe :size="permTableSize" class="perm-table"
          :header-cell-style="{ background: '#F8FAFC', color: '#0F172A', fontWeight: '700', fontSize: '12px' }"
          @selection-change="handlePermSelectionChange">
          <el-table-column type="selection" width="44" align="center" />
          <template v-for="col in permVisibleColumns" :key="col.prop">
            <el-table-column v-if="col.prop === 'status'" :label="col.label"
              :min-width="Math.round(col.minWidth * permDensityMultiplier)" :align="col.align"
              :fixed="col.fixed || false">
              <template #default="{ row }">
                <span class="status-tag" :class="row.status === 1 ? 'off' : 'on'">
                  {{ row.status === 1 ? '禁用' : '启用' }}
                </span>
              </template>
            </el-table-column>

            <el-table-column v-else-if="col.prop === 'action'" :label="col.label"
              :width="col.width ? Math.round(col.width * permDensityMultiplier) : 90" :align="col.align"
              :fixed="col.fixed || false">
              <template #default="{ row }">
                <el-button type="text" class="action-btn" :class="row.status === 1 ? 'action-enable' : 'action-disable'"
                  @click="handlePermToggleStatus(row)">
                  {{ row.status === 1 ? '启用' : '禁用' }}
                </el-button>
              </template>
            </el-table-column>

            <el-table-column v-else-if="col.prop === 'created_at' || col.prop === 'updated_at'" :label="col.label"
              :min-width="Math.round(col.minWidth * permDensityMultiplier)" :align="col.align"
              :fixed="col.fixed || false">
              <template #default="{ row }">{{ formatDateTime(row[col.prop]) }}</template>
            </el-table-column>

            <el-table-column v-else :prop="col.prop" :label="col.label"
              :min-width="Math.round(col.minWidth * permDensityMultiplier)" :align="col.align"
              :fixed="col.fixed || false" show-overflow-tooltip />
          </template>

          <template #empty>
            <div class="empty-state small">
              <el-icon class="empty-icon">
                <Document />
              </el-icon>
              <p>暂无数据</p>
            </div>
          </template>
        </el-table>

        <div class="perm-pagination">
          <el-pagination background size="small" layout="total, sizes, prev, pager, next, jumper"
            :total="permTableData.length" :page-size="permPageSize" :page-sizes="[10, 20, 50, 100]"
            v-model:current-page="permCurrentPage" class="custom-pagination" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Refresh, CirclePlus, Operation, Setting, FullScreen, Close,
  EditPen, Lock, Key, RefreshLeft, ArrowUp, ArrowDown, List, Share,
  User, UserFilled, Document, Select, CircleClose, Grid, Rank,
  DArrowLeft, DArrowRight, OfficeBuilding, Van, InfoFilled,
  Expand, Fold, Delete,
} from '@element-plus/icons-vue'
import { supabase } from '@/utils/supabase'
import dayjs from 'dayjs'

const router = useRouter()
const formatDateTime = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '--'

// ============================================================
// 当前登录用户
// ============================================================
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') }
  catch { return {} }
})()
const isAdmin = currentUser.role === 'admin'
const isCustomer = !isAdmin
const myAccount = currentUser.masterAccount || currentUser.account || ''
const myCustomerId = currentUser.customerId || null

// ============================================================
// 视图切换
// ============================================================
const viewMode = ref('list')

// ============================================================
// 基础数据
// ============================================================
const roleOptions = ref([])
const orgList = ref([])

const loadRoles = async () => {
  try {
    let query = supabase.from('roles').select('*').order('id')
    if (isCustomer) query = query.eq('owner_account', myAccount)
    const { data, error } = await query
    if (error) throw error

    let list = data || []
    if (isCustomer) {
      list = list.filter(r => {
        const code = String(r.code || '').toLowerCase().trim()
        return code !== 'admin' && code !== 'super_admin'
      })
    }
    roleOptions.value = list
  } catch (e) { console.error('加载角色失败:', e) }
}

const loadOrgs = async () => {
  try {
    let query = supabase
      .from('organizations')
      .select('id, name, parent_id, level, is_root, customer_id, owner_account, status, leader, phone')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) query = query.eq('owner_account', myAccount)
    const { data, error } = await query
    if (error) throw error
    orgList.value = data || []
  } catch (e) { console.error('加载组织失败:', e) }
}

// ============================================================
// 组织树（用于新增/编辑时的 tree-select）
// ============================================================
const orgTreeForSelect = computed(() => {
  const list = orgList.value
  if (!list.length) return []

  const rootOrgs = list.filter(o => o.is_root === true || Number(o.level) === 1)

  const map = {}
  list.forEach(o => {
    map[o.id] = { ...o, children: [] }
  })

  list.forEach(o => {
    if (o.parent_id && map[o.parent_id]) {
      map[o.parent_id].children.push(map[o.id])
    }
  })

  return rootOrgs.map(r => map[r.id]).filter(Boolean)
})

const customerRootOrg = computed(() => {
  return orgList.value.find(o => o.is_root === true || Number(o.level) === 1) || null
})

// ============================================================
// 搜索
// ============================================================
const searchExpanded = ref(true)
const searchForm = reactive({ account: '', name: '', role: '', org: '', status: '' })

// ============================================================
// 用户列表
// ⭐ 只显示有 role_id 的账号（管理员/子账号），排除司机账号
// ============================================================
const loading = ref(false)
const tableData = ref([])

const loadUsers = async () => {
  loading.value = true
  try {
    let users = []
    if (isAdmin) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .not('role_id', 'is', null)   // ⭐ 排除司机账号（role_id 为 null）
        .order('id', { ascending: false })
      if (error) throw error
      users = data || []
    } else {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('owner_account', myAccount)
        .not('role_id', 'is', null)   // ⭐ 排除司机账号
        .order('id', { ascending: false })
      if (error) throw error
      users = (data || []).filter(u => {
        if (u.account === myAccount) return false
        if (u.phone && u.phone === currentUser.phone) return false
        return true
      })
    }
    tableData.value = users
  } catch (e) {
    console.error('加载用户失败:', e)
    ElMessage.error('加载用户失败：' + e.message)
  } finally {
    loading.value = false
  }
}

const filteredData = computed(() => {
  return tableData.value
    .filter(row => {
      if (searchForm.account && !(row.account || '').toLowerCase().includes(searchForm.account.toLowerCase())) return false
      if (searchForm.name && !(row.name || '').includes(searchForm.name)) return false
      if (searchForm.status !== '' && searchForm.status !== null && Number(row.status) !== Number(searchForm.status)) return false
      if (searchForm.org) {
        const o = orgList.value.find(x => x.name === searchForm.org)
        if (o && row.org_id !== o.id) return false
      }
      if (searchForm.role) {
        const r = roleOptions.value.find(x => x.name === searchForm.role)
        if (r && row.role_id !== r.id) return false
      }
      return true
    })
    .map(row => {
      const role = roleOptions.value.find(r => r.id === row.role_id)
      const org = orgList.value.find(o => o.id === row.org_id)
      return {
        ...row,
        roleName: role ? role.name : '--',
        orgName: org ? org.name : '--',
      }
    })
})

const currentPage = ref(1)
const pageSize = ref(10)
const pagedData = computed(() => {
  const from = (currentPage.value - 1) * pageSize.value
  return filteredData.value.slice(from, from + pageSize.value)
})

const handleSearch = () => { currentPage.value = 1 }
const handleReset = () => {
  Object.assign(searchForm, { account: '', name: '', role: '', org: '', status: '' })
  currentPage.value = 1
}
const handleRefresh = () => { loadUsers(); ElMessage.success('已刷新') }
const handleSizeChange = (val) => { pageSize.value = val; currentPage.value = 1 }

// ============================================================
// 密度
// ============================================================
const tableSize = ref('default')
const densityMultiplier = computed(() => {
  if (tableSize.value === 'large') return 1.2
  if (tableSize.value === 'small') return 0.85
  return 1
})
const handleDensityChange = (cmd) => { tableSize.value = cmd }

// ============================================================
// 列设置
// ============================================================
const columnPopoverVisible = ref(false)
const DEFAULT_COLUMNS = [
  { prop: 'account', label: '登录账号', visible: true, fixed: false, minWidth: 130, align: 'center' },
  { prop: 'name', label: '用户姓名', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'phone', label: '手机号', visible: true, fixed: false, minWidth: 130, align: 'center' },
  { prop: 'email', label: '邮箱', visible: true, fixed: false, minWidth: 170, align: 'center' },
  { prop: 'orgName', label: '所属组织', visible: true, fixed: false, minWidth: 150, align: 'center' },
  { prop: 'roleName', label: '角色', visible: true, fixed: false, minWidth: 110, align: 'center' },
  { prop: 'status', label: '状态', visible: true, fixed: false, minWidth: 90, align: 'center' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 220, align: 'center' },
]
const columnConfig = ref(JSON.parse(JSON.stringify(DEFAULT_COLUMNS)))
const visibleColumns = computed(() => columnConfig.value.filter(c => c.visible))

const resetColumns = () => {
  columnConfig.value = JSON.parse(JSON.stringify(DEFAULT_COLUMNS))
  ElMessage.success('已重置列设置')
}
const toggleFix = (col, side) => { col.fixed = col.fixed === side ? false : side }

const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const onDragStart = (index) => { dragIndex.value = index }
const onDragOver = (index) => { dragOverIndex.value = index }
const onDrop = (index) => {
  if (dragIndex.value === -1 || dragIndex.value === index) { dragIndex.value = -1; dragOverIndex.value = -1; return }
  const list = [...columnConfig.value]
  const [item] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, item)
  columnConfig.value = list
  dragIndex.value = -1
  dragOverIndex.value = -1
}
const onDragEnd = () => { dragIndex.value = -1; dragOverIndex.value = -1 }

// ============================================================
// 表格全屏
// ============================================================
const isTableFullscreen = ref(false)
const toggleTableFullscreen = () => { isTableFullscreen.value = !isTableFullscreen.value }
const onEscKeydown = (e) => {
  if (e.key === 'Escape' && isTableFullscreen.value) isTableFullscreen.value = false
}

// ============================================================
// 去创建角色
// ============================================================
const goCreateRole = () => {
  dialogVisible.value = false
  router.push('/dashboard/role')
}

// ============================================================
// 新增/编辑用户
// ============================================================
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const form = reactive({
  id: null, account: '', name: '', phone: '', email: '',
  org_id: null, role_id: null, password: '', remark: '',
})

const resetForm = () => {
  Object.assign(form, {
    id: null, account: '', name: '', phone: '', email: '',
    org_id: customerRootOrg.value?.id || null,
    role_id: null, password: '', remark: '',
  })
}

const handleAdd = () => {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  resetForm()
  Object.assign(form, {
    id: row.id,
    account: row.account,
    name: row.name,
    phone: row.phone,
    email: row.email,
    org_id: row.org_id || customerRootOrg.value?.id || null,
    role_id: row.role_id,
    remark: row.remark || '',
    password: '',
  })
  dialogVisible.value = true
}

const saveUser = async () => {
  if (!form.account) { ElMessage.warning('请填写登录账号'); return }
  if (!form.name) { ElMessage.warning('请填写用户姓名'); return }
  if (!form.org_id) { ElMessage.warning('请选择所属组织'); return }
  if (!form.role_id) { ElMessage.warning('请选择角色'); return }
  if (!isEdit.value && !form.password) { ElMessage.warning('请填写密码'); return }

  saving.value = true
  try {
    const payload = {
      account: form.account,
      name: form.name,
      phone: form.phone,
      email: form.email,
      org_id: form.org_id,
      role_id: form.role_id,
      remark: form.remark,
      updated_at: new Date().toISOString(),
    }
    if (form.password) payload.password = form.password

    if (isEdit.value) {
      const { error } = await supabase.from('users').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('更新成功')
    } else {
      payload.status = 1
      payload.created_at = new Date().toISOString()
      if (isCustomer) payload.owner_account = myAccount
      const { error } = await supabase.from('users').insert(payload)
      if (error) throw error
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    await loadUsers()
  } catch (e) {
    console.error(e)
    ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

const handleToggleStatus = (row) => {
  const action = row.status === 1 ? '禁用' : '启用'
  ElMessageBox.confirm(`确认${action}用户「${row.name}」？`, '操作确认', {
    confirmButtonText: `确认${action}`, cancelButtonText: '取消', type: 'warning',
  }).then(async () => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status: row.status === 1 ? 0 : 1, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      ElMessage.success(`${action}成功`)
      await loadUsers()
    } catch (e) {
      ElMessage.error('操作失败：' + e.message)
    }
  }).catch(() => { })
}

const handleCommand = (cmd, row) => {
  if (cmd === 'permission') openPermissionDialog(row)
  else if (cmd === 'resetPwd') {
    ElMessageBox.confirm(`确认重置用户「${row.name}」的密码为 123456？`, '重置密码', {
      confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning',
    }).then(async () => {
      try {
        const { error } = await supabase
          .from('users')
          .update({ password: '123456', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        if (error) throw error
        ElMessage.success('密码已重置为 123456')
      } catch (e) {
        ElMessage.error('重置失败：' + e.message)
      }
    }).catch(() => { })
  }
  else if (cmd === 'delete') handleDeleteUser(row)
}

const handleDeleteUser = (row) => {
  const displayName = row.name || row.account
  ElMessageBox.confirm(
    `确定删除用户「${displayName}」吗？删除后该账号将无法登录，且不可恢复。`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    }
  ).then(async () => {
    try {
      const { error } = await supabase.from('users').delete().eq('id', row.id)
      if (error) throw error
      ElMessage.success('删除成功')
      await loadUsers()
    } catch (e) {
      ElMessage.error('删除失败：' + (e?.message || e))
    }
  }).catch(() => { })
}

// ============================================================
// 组织机构视图
// ⭐ 只显示有 role_id 的账号
// ============================================================
const orgTreeRef = ref(null)
const orgTreeData = ref([])
const orgLoading = ref(false)
const orgExpandAll = ref(true)
const orgSearchKeyword = ref('')
const treeProps = { children: 'children', label: 'label' }

const loadOrgTree = async () => {
  orgLoading.value = true
  try {
    let orgQuery = supabase
      .from('organizations')
      .select('id, name, parent_id, level, is_root, customer_id, owner_account, status')
      .order('level', { ascending: true })
      .order('id', { ascending: true })
    if (isCustomer) orgQuery = orgQuery.eq('owner_account', myAccount)
    const { data: orgs } = await orgQuery

    const { data: fleets } = await supabase.from('fleets').select('*').order('id')

    // ⭐ 只拉有 role_id 的用户（排除司机账号）
    let userQuery = supabase
      .from('users')
      .select('*')
      .not('role_id', 'is', null)
      .order('id')
    if (isCustomer) userQuery = userQuery.eq('owner_account', myAccount)
    const { data: usersRaw } = await userQuery
    const users = (usersRaw || []).filter(u => {
      if (isCustomer && u.account === myAccount) return false
      if (isCustomer && u.phone && u.phone === currentUser.phone) return false
      return true
    })

    // 查询车辆并聚合到机构（按 org_id 递归）
    let vehicleQuery = supabase.from('vehicles').select('id, org_id')
    if (isCustomer && myAccount) vehicleQuery = vehicleQuery.eq('customer_id', myCustomerId || '00000000-0000-0000-0000-000000000000')
    const { data: vehiclesRaw } = await vehicleQuery
    const vehiclesList = vehiclesRaw || []

    // ⭐ 查询司机并按「所属组织结构」(drivers.org 名称) 聚合到机构
    //    司机档案的隔离与展示均以 drivers.org 为准（不是 org_id）
    //    仅统计本机构下的司机，不递归叠加子/父机构
    let driverQuery = supabase.from('drivers').select('id, org, org_id')
    if (isCustomer && myAccount) driverQuery = driverQuery.eq('customer_id', myCustomerId || '00000000-0000-0000-0000-000000000000')
    const { data: driversRaw } = await driverQuery
    const driversList = driversRaw || []

    const orgNameById = {}
    ;(orgs || []).forEach(o => { orgNameById[String(o.id)] = String(o.name || '').trim() })

    const directDriverByOrgName = {}
    driversList.forEach(d => {
      let name = String(d.org || '').trim()
      // 兜底：org 名称为空时用 org_id 反查机构名
      if (!name && d.org_id != null) name = orgNameById[String(d.org_id)] || ''
      if (name) directDriverByOrgName[name] = (directDriverByOrgName[name] || 0) + 1
    })

    // 按 org_id 反查机构名后取司机数
    const driverCountByOrgId = (orgId) => {
      if (orgId == null) return 0
      const n = orgNameById[String(orgId)] || ''
      return n ? (directDriverByOrgName[n] || 0) : 0
    }

    const orgsList = orgs || []
    const fleetsList = fleets || []
    const usersList = users || []

    const directVehicleByOrg = {}
    vehiclesList.forEach(v => {
      if (v.org_id != null) {
        const key = String(v.org_id)
        directVehicleByOrg[key] = (directVehicleByOrg[key] || 0) + 1
      }
    })

    const recursiveVehicleByOrg = {}
    const calcRecursive = (orgId) => {
      const key = String(orgId)
      if (recursiveVehicleByOrg[key] != null) return recursiveVehicleByOrg[key]
      let total = directVehicleByOrg[key] || 0
      orgsList.filter(o => String(o.parent_id) === key).forEach(c => {
        total += calcRecursive(c.id)
      })
      recursiveVehicleByOrg[key] = total
      return total
    }
    orgsList.forEach(o => calcRecursive(o.id))

    const buildUserNode = (u) => {
      const role = roleOptions.value.find(r => r.id === u.role_id)
      const owner = usersList.find(x => x.account === u.owner_account)
      return {
        key: 'user-' + u.id,
        type: 'user',
        label: u.name || u.account,
        account: u.account,
        status: u.status,
        isAdmin: u.role_id === 1 || u.role_id === 2,
        roleName: role ? role.name : '--',
        ownerName: owner ? owner.name : '',
        vehicleCount: u.org_id ? (recursiveVehicleByOrg[String(u.org_id)] || 0) : 0,
        driverCount: driverCountByOrgId(u.org_id),
      }
    }

    const buildOrgChildren = (parentId) => {
      const children = orgsList.filter(o => o.parent_id === parentId)
      return children.map(org => {
        const orgFleets = fleetsList
          .filter(f => f.org_id === org.id)
          .map(fleet => {
            const fleetUsers = usersList
              .filter(u => u.org_id === org.id)
              .map(u => buildUserNode(u))
            return {
              key: 'fleet-' + fleet.id,
              type: 'fleet',
              label: fleet.name,
              children: fleetUsers,
            }
          })

        const orgUsers = usersList
          .filter(u => u.org_id === org.id && !fleetsList.find(f => f.org_id === org.id))
          .map(u => buildUserNode(u))

        return {
          key: 'org-' + org.id,
          type: 'org',
          label: org.name,
          level: org.level,
          isRoot: org.is_root,
          vehicleCount: recursiveVehicleByOrg[String(org.id)] || 0,
          driverCount: directDriverByOrgName[String(org.name || '').trim()] || 0,
          children: [...buildOrgChildren(org.id), ...orgFleets, ...orgUsers],
        }
      })
    }

    const rootOrgs = orgsList.filter(o => o.is_root === true || Number(o.level) === 1)

    const rootDirectUsers = usersList
      .filter(u => {
        if (u.org_id == null) return true
        const o = orgsList.find(x => x.id === u.org_id)
        return o && (o.is_root === true || Number(o.level) === 1)
      })
      .map(u => buildUserNode(u))

    let tree = []

    if (isCustomer) {
      tree = rootOrgs.map(root => ({
        key: 'root-' + root.id,
        type: 'root',
        label: root.name,
        vehicleCount: recursiveVehicleByOrg[String(root.id)] || 0,
        driverCount: directDriverByOrgName[String(root.name || '').trim()] || 0,
        children: [...buildOrgChildren(root.id), ...rootDirectUsers],
      }))
    } else {
      tree = rootOrgs.map(root => ({
        key: 'root-' + root.id,
        type: 'root',
        label: root.name,
        vehicleCount: recursiveVehicleByOrg[root.id] || 0,
        driverCount: directDriverByOrgName[String(root.name || '').trim()] || 0,
        children: [...buildOrgChildren(root.id), ...rootDirectUsers],
      }))
    }

    orgTreeData.value = tree
  } catch (e) {
    console.error('加载组织树失败:', e)
    ElMessage.error('加载组织树失败：' + e.message)
  } finally {
    orgLoading.value = false
  }
}

const toggleOrgExpandAll = () => {
  orgExpandAll.value = !orgExpandAll.value
  nextTick(() => {
    const nodes = orgTreeRef.value?.store?.nodesMap || {}
    Object.values(nodes).forEach(node => { node.expanded = orgExpandAll.value })
  })
}

const filterOrgNode = (value, data) => {
  if (!value) return true
  const kw = value.toLowerCase()
  if (data.label && data.label.toLowerCase().includes(kw)) return true
  if (data.account && data.account.toLowerCase().includes(kw)) return true
  return false
}

watch(orgSearchKeyword, (val) => { orgTreeRef.value?.filter(val) })

// ============================================================
// 权限配置
// ============================================================
const permDialogVisible = ref(false)
const permTargetUser = ref(null)
const permActiveTab = ref('org')
const permTabs = [
  { key: 'org', label: '组织' },
  { key: 'fleet', label: '车队' },
  { key: 'vehicle', label: '车辆' },
]
const permSearchKeyword = ref('')
const permCurrentPage = ref(1)
const permPageSize = ref(10)
const permSelection = ref([])
const permTableSize = ref('small')
const permColumnPopoverVisible = ref(false)
const permDensityMultiplier = computed(() => {
  if (permTableSize.value === 'large') return 1.2
  if (permTableSize.value === 'small') return 0.85
  return 1
})
const DEFAULT_PERM_COLUMNS = [
  { prop: 'name', label: '数据名称', visible: true, fixed: false, minWidth: 200, align: 'left' },
  { prop: 'creator', label: '创建人', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'created_at', label: '创建时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'updater', label: '更新人', visible: true, fixed: false, minWidth: 100, align: 'center' },
  { prop: 'updated_at', label: '更新时间', visible: true, fixed: false, minWidth: 160, align: 'center' },
  { prop: 'status', label: '状态', visible: true, fixed: false, minWidth: 80, align: 'center' },
  { prop: 'action', label: '操作', visible: true, fixed: 'right', width: 90, align: 'center' },
]
const permColumnConfig = ref(JSON.parse(JSON.stringify(DEFAULT_PERM_COLUMNS)))
const permVisibleColumns = computed(() => permColumnConfig.value.filter(c => c.visible))

const resetPermColumns = () => {
  permColumnConfig.value = JSON.parse(JSON.stringify(DEFAULT_PERM_COLUMNS))
  ElMessage.success('已重置列设置')
}
const togglePermFix = (col, side) => { col.fixed = col.fixed === side ? false : side }

const permDragIndex = ref(-1)
const permDragOverIndex = ref(-1)
const onPermDragStart = (index) => { permDragIndex.value = index }
const onPermDragOver = (index) => { permDragOverIndex.value = index }
const onPermDrop = (index) => {
  if (permDragIndex.value === -1 || permDragIndex.value === index) { permDragIndex.value = -1; permDragOverIndex.value = -1; return }
  const list = [...permColumnConfig.value]
  const [item] = list.splice(permDragIndex.value, 1)
  list.splice(index, 0, item)
  permColumnConfig.value = list
  permDragIndex.value = -1
  permDragOverIndex.value = -1
}
const onPermDragEnd = () => { permDragIndex.value = -1; permDragOverIndex.value = -1 }

const handlePermDensityChange = (cmd) => { permTableSize.value = cmd }
const handlePermRefresh = () => { ElMessage.success('已刷新') }

const permDataMap = ref({ org: [], fleet: [], vehicle: [] })
const permTableData = computed(() => {
  const list = permDataMap.value[permActiveTab.value] || []
  if (!permSearchKeyword.value) return list
  const kw = permSearchKeyword.value.toLowerCase()
  return list.filter(item => (item.name || '').toLowerCase().includes(kw))
})

const openPermissionDialog = (row) => {
  permTargetUser.value = row
  permActiveTab.value = 'org'
  permSearchKeyword.value = ''
  permCurrentPage.value = 1
  permDialogVisible.value = true
}

const handlePermSearch = () => { permCurrentPage.value = 1 }
const handlePermSelectionChange = (val) => { permSelection.value = val }
const handlePermToggleStatus = (row) => {
  row.status = row.status === 1 ? 0 : 1
  ElMessage.success(row.status === 1 ? '已禁用' : '已启用')
}
const handlePermBatchEnable = () => {
  if (!permSelection.value.length) { ElMessage.warning('请先勾选数据'); return }
  permSelection.value.forEach(item => { item.status = 0 })
  ElMessage.success(`已启用 ${permSelection.value.length} 项`)
}
const handlePermBatchDisable = () => {
  if (!permSelection.value.length) { ElMessage.warning('请先勾选数据'); return }
  permSelection.value.forEach(item => { item.status = 1 })
  ElMessage.success(`已禁用 ${permSelection.value.length} 项`)
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  document.addEventListener('keydown', onEscKeydown)
  await Promise.all([loadRoles(), loadOrgs()])
  await loadUsers()
  if (viewMode.value === 'tree') await loadOrgTree()
})

watch(viewMode, async (val) => {
  if (val === 'tree' && orgTreeData.value.length === 0) {
    await loadOrgTree()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEscKeydown)
})
</script>

<style scoped>
/* ============ 页面容器 ============ */
.user-manage-page {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
  background: #F8FAFC;
  font-size: 13px;
}

/* ============ 视图切换 ============ */
.view-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.view-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #E2E8F0;
  background: #fff;
  color: #64748B;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}

.view-btn:hover {
  border-color: #FCA5A5;
  color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-1px);
}

.view-btn.active {
  border-color: #c8102e;
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.3);
}

.view-btn .el-icon {
  font-size: 14px;
}

.scope-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 12.5px;
  color: #c8102e;
  font-weight: 600;
  padding: 4px 12px;
  background: #FEF2F2;
  border-radius: 20px;
  border: 1px solid #FECACA;
}

.scope-tip .el-icon {
  font-size: 14px;
}

/* ============ 搜索卡片 ============ */
.search-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 12px 16px;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-item label {
  font-size: 12.5px;
  color: #334155;
  font-weight: 600;
  white-space: nowrap;
}

.search-item :deep(.el-input),
.search-item :deep(.el-select) {
  width: 170px;
}

.search-item :deep(.el-input__wrapper),
.search-item :deep(.el-select__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 30px;
}

.search-item :deep(.el-input__wrapper:hover),
.search-item :deep(.el-select__wrapper:hover) {
  background: #FEF2F2 !important;
  box-shadow: 0 0 0 1px #FCA5A5 inset !important;
}

.search-item :deep(.el-input__wrapper.is-focus),
.search-item :deep(.el-select__wrapper.is-focused) {
  background: #ffffff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
  transform: translateY(-1px);
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.btn-primary {
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(200, 16, 46, 0.4);
}

.btn-outline {
  border-radius: 6px !important;
  border-color: #CBD5E1 !important;
  color: #334155;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-outline:hover {
  border-color: #c8102e !important;
  color: #c8102e !important;
  background: #FEF2F2 !important;
  transform: translateY(-1px);
}

.expand-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12.5px;
  color: #c8102e;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}

.expand-toggle:hover {
  background: #FEF2F2;
  transform: scale(1.05);
}

.toggle-icon {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* ============ 表格卡片 ============ */
.table-card-wrap {
  display: flex;
  flex-direction: column;
}

.table-card-wrap.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 20%, rgba(200, 16, 46, 0.08) 0%, transparent 60%),
    radial-gradient(circle at 80% 80%, rgba(200, 16, 46, 0.06) 0%, transparent 60%),
    rgba(248, 250, 252, 0.75);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  animation: fullscreenFadeIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fullscreenFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.table-card-wrap.is-fullscreen .table-card {
  flex: 1;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.08);
  animation: fullscreenCardIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fullscreenCardIn {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.fs-exit-btn {
  position: absolute;
  top: 36px;
  right: 36px;
  z-index: 10001;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border: none;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(200, 16, 46, 0.4);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: inherit;
}

.fs-exit-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 10px 28px rgba(200, 16, 46, 0.55);
}

.fs-fade-enter-active,
.fs-fade-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fs-fade-enter-from,
.fs-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
}

.table-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 12px 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  transition: all 0.3s;
}

.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  gap: 6px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.total-hint {
  font-size: 12.5px;
  color: #64748B;
}

.total-hint b {
  color: #c8102e;
  font-family: 'Courier New', monospace;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.icon-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #E2E8F0;
  background: #fff;
  border-radius: 6px;
  color: #64748B;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.icon-btn:hover {
  border-color: #c8102e;
  color: #c8102e;
  background: #FEF2F2;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(200, 16, 46, 0.15);
}

.icon-btn.active {
  border-color: #c8102e;
  color: #fff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 3px 10px rgba(200, 16, 46, 0.35);
}

.icon-btn:active {
  transform: translateY(0) scale(0.95);
}

.icon-btn.small {
  width: 28px;
  height: 28px;
  font-size: 13px;
}

/* ============ 表格 ============ */
.custom-table {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
}

:deep(.custom-table .el-table__cell) {
  color: #1E293B;
}

:deep(.custom-table th.el-table__cell) {
  border-bottom: 1px solid #E2E8F0;
}

:deep(.custom-table .el-table__row:hover td) {
  background: #FEF2F2 !important;
}

:deep(.custom-table.el-table--large .el-table__cell) {
  padding: 14px 0;
}

:deep(.custom-table.el-table--default .el-table__cell) {
  padding: 8px 0;
}

:deep(.custom-table.el-table--small .el-table__cell) {
  padding: 4px 0;
}

.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.status-tag.on {
  background: #D1FAE5;
  color: #065F46;
}

.status-tag.off {
  background: #FEE2E2;
  color: #991B1B;
}

.status-tag.mini {
  padding: 1px 6px;
  font-size: 11px;
}

.org-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  background: #E0E7FF;
  color: #3730A3;
  white-space: nowrap;
}

.org-tag .el-icon {
  font-size: 12px;
}

.role-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  background: #EDE9FE;
  color: #5B21B6;
  white-space: nowrap;
}

.text-muted {
  color: #94A3B8;
  font-size: 12.5px;
}

.action-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  white-space: nowrap;
  width: 100%;
}

.action-cell :deep(.el-dropdown) {
  display: inline-flex;
  align-items: center;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 26px;
  padding: 0 8px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  border-radius: 5px;
  border: none;
  background: transparent;
  transition: all 0.2s;
  white-space: nowrap;
  user-select: none;
  font-family: inherit;
  color: inherit;
}

.action-btn .el-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.action-btn>span {
  display: inline-block;
}

.action-edit {
  color: #c8102e;
}

.action-edit:hover {
  color: #7F1D1D;
  background: #FEF2F2;
}

.action-toggle {
  color: #F59E0B;
}

.action-toggle:hover {
  color: #B45309;
  background: #FFF7ED;
}

.action-more {
  color: #64748B;
}

.action-more:hover {
  color: #c8102e;
  background: #FEF2F2;
}

.action-more .more-icon {
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-size: 11px;
  margin-left: 1px;
}

.action-more:hover .more-icon {
  transform: rotate(180deg);
}

.empty-state {
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #94A3B8;
}

.empty-state.small {
  padding: 20px;
}

.empty-icon {
  font-size: 40px;
  color: #CBD5E1;
}

.empty-state.small .empty-icon {
  font-size: 28px;
}

.empty-tip {
  font-size: 12px;
  color: #CBD5E1;
}

.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #E2E8F0;
  margin-top: 12px;
}

.total-text {
  font-size: 12.5px;
  color: #334155;
  font-weight: 600;
}

:deep(.custom-pagination .el-pager li) {
  transition: all 0.2s;
  font-weight: 600;
  color: #334155;
  min-width: 26px;
  height: 26px;
  line-height: 26px;
}

:deep(.custom-pagination .el-pager li:hover) {
  color: #c8102e;
  transform: scale(1.08);
}

:deep(.custom-pagination .el-pager li.is-active) {
  background-color: #c8102e !important;
  color: #fff !important;
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

/* ============ 组织机构视图 ============ */
.org-view-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.org-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid #F1F5F9;
  margin-bottom: 12px;
}

.org-view-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
}

.org-view-title .el-icon {
  color: #c8102e;
  font-size: 18px;
}

.org-view-sub {
  font-size: 12.5px;
  color: #94A3B8;
  font-weight: 500;
}

.org-view-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.org-search-input {
  width: 220px;
}

.org-search-input :deep(.el-input__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  min-height: 30px;
}

.org-search-input :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

.org-view-body {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.org-tree {
  background: transparent;
}

.org-tree :deep(.el-tree-node__content) {
  height: 40px;
  border-radius: 6px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  padding: 2px 4px;
}

.org-tree :deep(.el-tree-node__content:hover) {
  background: #FEF2F2;
}

.org-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #FEE2E2;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 13px;
}

.node-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.node-icon .el-icon {
  font-size: 14px;
  color: #fff;
}

.tree-node.type-root .node-icon {
  background: linear-gradient(135deg, #7C3AED, #5B21B6);
  box-shadow: 0 2px 10px rgba(124, 58, 237, 0.4);
}

.tree-node.type-org .node-icon {
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.35);
}

.tree-node.type-fleet .node-icon {
  background: linear-gradient(135deg, #F59E0B, #D97706);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

.tree-node.type-user .node-icon {
  background: linear-gradient(135deg, #60A5FA, #3B82F6);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.tree-node.type-user .node-icon.admin {
  background: linear-gradient(135deg, #c8102e, #a00d24);
}

.tree-node:hover .node-icon {
  transform: scale(1.1) rotate(-4deg);
}

.node-label {
  font-weight: 600;
  color: #0F172A;
}

.tree-node.type-root .node-label {
  font-size: 15px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: 0.3px;
}

.tree-node.type-org .node-label {
  font-size: 14px;
  font-weight: 700;
}

.tree-node.type-fleet .node-label {
  font-size: 13.5px;
}

.node-count {
  font-size: 11.5px;
  color: #94A3B8;
  padding: 1px 8px;
  border-radius: 8px;
  background: #F1F5F9;
  margin-left: 4px;
}

.node-account {
  font-size: 12px;
  color: #94A3B8;
  font-family: 'Courier New', monospace;
  padding: 1px 6px;
  background: #F8FAFC;
  border-radius: 4px;
}

.node-role {
  font-size: 11.5px;
  color: #5B21B6;
  padding: 1px 8px;
  border-radius: 8px;
  background: #EDE9FE;
  font-weight: 600;
}

.node-role.admin {
  background: #FEE2E2;
  color: #991B1B;
}

.node-owner {
  font-size: 11.5px;
  color: #D97706;
  padding: 1px 8px;
  border-radius: 8px;
  background: #FEF3C7;
  font-weight: 600;
  margin-left: auto;
}

.node-vehicles {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: #0369A1;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 8px;
  background: #E0F2FE;
  white-space: nowrap;
}

.node-vehicles .el-icon {
  font-size: 12px;
}

.node-vehicles.empty {
  background: #F1F5F9;
  color: #94A3B8;
  font-weight: 600;
}

/* ⭐ 司机数徽章（绿色系，仅统计本机构，不递归） */
.node-drivers {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: #15803D;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 8px;
  background: #DCFCE7;
  white-space: nowrap;
}

.node-drivers .el-icon {
  font-size: 12px;
}

.node-drivers.empty {
  background: #F1F5F9;
  color: #94A3B8;
  font-weight: 600;
}

.org-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 80px 20px;
  color: #94A3B8;
}

.org-empty .empty-icon {
  font-size: 48px;
  color: #CBD5E1;
}

.org-empty p {
  font-size: 15px;
  font-weight: 600;
  color: #64748B;
  margin: 0;
}

.org-empty .empty-tip {
  font-size: 12.5px;
  color: #CBD5E1;
}

/* ============ 弹窗 ============ */
:deep(.manage-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  animation: dialogIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

:deep(.manage-dialog .el-dialog__header) {
  padding: 14px 18px;
  border-bottom: 1px solid #F1F5F9;
}

:deep(.manage-dialog .el-dialog__title) {
  font-weight: 700;
  color: #0F172A;
  font-size: 15px;
}

.manage-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.manage-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #334155;
  font-size: 13px;
}

.manage-form :deep(.el-tree-select .el-select__wrapper),
.manage-form :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-height: 32px;
}

.manage-form :deep(.el-tree-select .el-select__wrapper:hover),
.manage-form :deep(.el-select__wrapper:hover) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.4) inset !important;
}

.manage-form :deep(.el-tree-select .el-select__wrapper.is-focused),
.manage-form :deep(.el-select__wrapper.is-focused) {
  background: #FFFFFF !important;
  box-shadow: 0 0 0 1px #c8102e inset, 0 0 0 3px rgba(200, 16, 46, 0.1) !important;
}

.role-select-wrap {
  width: 100%;
}

.role-empty {
  padding: 16px 12px;
  text-align: center;
}

.role-empty p {
  margin: 0 0 10px;
  font-size: 12.5px;
  color: #94A3B8;
}

.create-role-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 16px;
  font-size: 12.5px;
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 4px 12px rgba(200, 16, 46, 0.25);
  transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.create-role-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(200, 16, 46, 0.4);
}

.role-empty-tip {
  margin-top: 8px;
  padding: 8px 12px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 6px;
  font-size: 12.5px;
  color: #64748B;
  display: flex;
  align-items: center;
  gap: 4px;
  animation: roleTipIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes roleTipIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.role-empty-link {
  padding: 0;
  background: none;
  border: none;
  color: #c8102e;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.role-empty-link:hover {
  color: #7F1D1D;
  text-decoration: underline;
}

:deep(.permission-dialog .el-dialog) {
  border-radius: 12px;
  overflow: hidden;
  animation: dialogIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:deep(.permission-dialog .el-dialog__header) {
  padding: 14px 20px;
  border-bottom: 1px solid #F1F5F9;
}

:deep(.permission-dialog .el-dialog__title) {
  font-weight: 700;
  color: #0F172A;
  font-size: 15px;
}

:deep(.permission-dialog .el-dialog__body) {
  padding: 14px 20px 20px;
}

.perm-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid #E2E8F0;
  margin-bottom: 14px;
}

.perm-tab {
  position: relative;
  padding: 6px 4px 10px;
  font-size: 13px;
  font-weight: 600;
  color: #64748B;
  cursor: pointer;
  transition: color 0.28s;
  user-select: none;
}

.perm-tab:hover {
  color: #c8102e;
}

.perm-tab.active {
  color: #c8102e;
}

.perm-tab-bar {
  position: absolute;
  bottom: -1px;
  left: 50%;
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, #c8102e, #a00d24);
  border-radius: 3px 3px 0 0;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translateX(-50%);
}

.perm-tab.active .perm-tab-bar {
  width: 26px;
  box-shadow: 0 2px 8px rgba(200, 16, 46, 0.4);
}

.perm-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.perm-search-input {
  width: 220px;
}

.perm-search-input :deep(.el-input__wrapper) {
  border-radius: 6px !important;
  background: #F8FAFC !important;
  box-shadow: 0 0 0 1px #E2E8F0 inset !important;
  min-height: 30px;
}

.perm-search-input :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgba(200, 16, 46, 0.15), 0 0 0 1px #c8102e inset !important;
}

.perm-right-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.btn-enable {
  background: linear-gradient(135deg, #10B981, #059669) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  border-radius: 6px !important;
  box-shadow: 0 3px 10px rgba(16, 185, 129, 0.25);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-enable:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(16, 185, 129, 0.4);
}

.btn-disable {
  border-radius: 6px !important;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.btn-disable:hover {
  transform: translateY(-1px);
}

.perm-table :deep(.el-table__cell) {
  font-size: 12px !important;
}

.perm-table :deep(th.el-table__cell) {
  font-size: 12px !important;
}

.perm-table :deep(.action-btn) {
  font-size: 12px !important;
}

.perm-table :deep(.status-tag) {
  font-size: 11.5px;
  padding: 1px 8px;
}

.perm-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>

<style>
/* ============================================================
   全局弹出层样式
   ============================================================ */
.density-dropdown-red.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.15) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.density-dropdown-red .el-dropdown-menu {
  padding: 4px !important;
  background: #FFFFFF !important;
}

.density-dropdown-red .el-dropdown-menu__item {
  font-size: 13px !important;
  color: #c8102e !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 6px 16px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.density-dropdown-red .el-dropdown-menu__item:hover {
  color: #ffffff !important;
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  transform: translateX(2px);
}

.density-dropdown-red .el-dropdown-menu__item .density-item {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s;
}

.density-dropdown-red .el-dropdown-menu__item .density-item.active {
  color: #c8102e;
  font-weight: 700;
}

.density-dropdown-red .el-dropdown-menu__item:hover .density-item.active {
  color: #ffffff;
}

.more-dropdown-red.el-dropdown__popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.15) !important;
  border-radius: 10px !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.more-dropdown-red .el-dropdown-menu {
  padding: 4px !important;
  background: #FFFFFF !important;
}

.more-dropdown-red .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px !important;
  color: #c8102e !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  padding: 8px 16px !important;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.more-dropdown-red .el-dropdown-menu__item .el-icon {
  color: #c8102e !important;
  font-size: 14px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.more-dropdown-red .el-dropdown-menu__item:hover {
  color: #ffffff !important;
  background: linear-gradient(135deg, #c8102e, #a00d24) !important;
  transform: translateX(2px);
}

.more-dropdown-red .el-dropdown-menu__item:hover .el-icon {
  color: #ffffff !important;
  transform: scale(1.15);
}

.more-dropdown-red .el-dropdown-menu__item--divided {
  border-top: 1px solid #F1F5F9;
  margin-top: 4px;
  padding-top: 8px;
}

.column-setting-popper.el-popover.el-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 36px rgba(200, 16, 46, 0.18), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border: 2px solid #FFFFFF !important;
  overflow: hidden;
  background: #FFFFFF !important;
}

.column-setting-popper .el-popover__title {
  display: none;
}

.column-setting {
  padding: 0;
  background: #FFFFFF;
}

.column-setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #FEE2E2;
  background: #FFFFFF;
}

.col-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #c8102e;
}

.col-title .el-icon {
  color: #c8102e;
  font-size: 14px;
}

.col-reset {
  font-size: 12.5px;
  color: #c8102e;
  cursor: pointer;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.col-reset:hover {
  background: #FEE2E2;
  text-decoration: underline;
  transform: scale(1.05);
}

.column-setting-body {
  max-height: 400px;
  overflow-y: auto;
  padding: 6px;
  background: #FFFFFF;
}

.column-setting-body::-webkit-scrollbar {
  width: 4px;
}

.column-setting-body::-webkit-scrollbar-thumb {
  background: #FCA5A5;
  border-radius: 2px;
}

.column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}

.column-item:hover {
  background: #FEF2F2;
}

.column-item.dragging {
  opacity: 0.4;
  cursor: grabbing;
}

.column-item.dragOver {
  background: #FEE2E2;
  transform: scale(1.02);
  box-shadow: 0 0 0 1px rgba(200, 16, 46, 0.2) inset;
}

.drag-handle {
  display: flex;
  align-items: center;
  color: #FCA5A5;
  cursor: grab;
  font-size: 14px;
  transition: color 0.2s;
}

.column-item:hover .drag-handle {
  color: #c8102e;
}

.col-checkbox {
  flex: 1;
  font-size: 13px;
}

.col-checkbox :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #c8102e;
  font-weight: 600;
  transition: color 0.2s;
}

.col-checkbox :deep(.el-checkbox__inner) {
  border-color: #FCA5A5;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.col-checkbox:hover :deep(.el-checkbox__inner) {
  border-color: #c8102e;
}

.col-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #c8102e;
  border-color: #c8102e;
}

.col-checkbox :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #c8102e;
  font-weight: 700;
}

.fix-actions {
  display: flex;
  gap: 2px;
}

.fix-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: #FCA5A5;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fix-btn:hover {
  color: #c8102e;
  background: #FEE2E2;
  transform: scale(1.1);
}

.fix-btn.active {
  color: #ffffff;
  background: linear-gradient(135deg, #c8102e, #a00d24);
  box-shadow: 0 2px 6px rgba(200, 16, 46, 0.35);
}

.org-tree-select-popper.el-popper {
  border: 2px solid #FFFFFF !important;
  box-shadow: 0 10px 32px rgba(200, 16, 46, 0.15), 0 0 0 1px rgba(200, 16, 46, 0.12) !important;
  border-radius: 10px !important;
  overflow: hidden;
  padding: 6px !important;
}

.org-tree-select-popper .el-tree {
  background: transparent;
  --el-tree-node-hover-bg-color: #FEF2F2;
}

.org-tree-select-popper .el-tree-node__content {
  height: 32px;
  border-radius: 6px;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-size: 13px;
}

.org-tree-select-popper .el-tree-node__content:hover {
  background: #FEF2F2 !important;
  color: #c8102e;
}

.org-tree-select-popper .el-tree-node.is-current>.el-tree-node__content {
  background: linear-gradient(135deg, #FEE2E2, #FECACA) !important;
  color: #c8102e;
  font-weight: 700;
}

.org-tree-select-popper .el-tree-node__content .el-tree-node__label {
  font-weight: 600;
  color: #0F172A;
}

.org-tree-select-popper .el-tree-node.is-current>.el-tree-node__content .el-tree-node__label {
  color: #c8102e;
}
</style>