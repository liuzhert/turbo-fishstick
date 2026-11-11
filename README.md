# Street View Lab：生成器与配比器

默认阿根廷；支持阿根廷、智利、巴西、秘鲁、哥伦比亚、墨西哥、美国。上方生成器保留现有功能，下方配比器统计导入地图并对照 Vali 默认一级行政区配比。

## 上传到 GitHub

1. 解压交付包，将**包内文件和 `data` 文件夹原样上传到仓库根目录**，覆盖同名文件。不要直接上传 ZIP，也不要只替换 `index.html`。
2. HTML、各 `.mjs` 脚本及七个 `*-ADM1.geojson` 同级；`data` 文件夹也放在这一层。补丁包不包含原有六国 GeoJSON，请保留它们，只新增美国文件。
3. 等待 GitHub Pages 更新后，按 Ctrl+F5 刷新。无需安装 Node、构建项目或另开后端。
4. 保持原 GitHub Pages 地址不变，即可继续访问该浏览器保存的旧记录。换域名、换浏览器或清理浏览器存储后，旧本地记录不会自动转移。

目录：

- `index.html`：上下布局，生成器 / 配比器。
- `app.mjs`：原生成器、按国家/行政区隔离的记录、地图导出。
- `geo-core.mjs`：七国行政区识别、跨日期变更线处理及按球面面积的随机选点。
- `ratio-core.mjs`、`ratio-worker.mjs`、`ratio-ui.mjs`：配比计算、后台工作线程和结果界面。
- `ARG/CHL/BRA/PER/COL/MEX/USA-ADM1.geojson`：七国行政区边界，名称和标准代码已经对齐。完整包可直接使用；补丁版支持保留原六国文件，由 `data/boundary-code-map.json` 在读取时转换代码和名称。
- `data/boundary-code-map.json`：兼容原仓库六国边界的代码、名称转换表，不改动原始几何。
- `data/vali-templates.json`：固定版本的 Vali 权重与行政区名称。
- `data/ARG-country.geojson`：保留原生成器使用的阿根廷国界。
- `data/vali-SubdivisionWeights.cs`、`data/VALI-LICENSE.txt`：模板来源源码和原始许可。
- `*-source.json`：边界来源元数据。
- `tests`：开发验证脚本，不是网页运行依赖，可一起上传。

## 生成器

美国提供 50 州和哥伦比亚特区，包含阿拉斯加和夏威夷；不将美属海外地区混入美国模板范围。全国和每州记录各自保存。原阿根廷全国存储键保持 `argentinaSamples-mapgenerator-v1`，其他六国继续使用国家/行政区范围键。

继续使用原抽样方式：在所选范围按球面面积生成候选点，查询设置半径内的 Google 官方街景，再用实际全景坐标核验国家/行政区、去重、保存。为避免美国阿拉斯加、夏威夷和跨日期变更线导致全球包围盒低效，候选范围改为互不重叠的网格，按网格球面面积取样，再做多边形拒绝采样；**没有将各州设置为等概率，也没有把 Vali 权重用于生成器**。

边界按所选国家从同级 GeoJSON 文件按需读取，HTML 不再内嵌全部边界。Google API 加载、Key 配置、半径、筛选、停止、CSV / 地图 JSON / 统计备份、旧 JSON 转换、历史记录核验继续保留。生成速度仍取决于 Google 服务及覆盖命中率。

## 配比器

1. 选择统计范围，默认“自动识别七国”；可以导入单国地图，也可以导入包含多个国家的混合地图。
2. 选择一个或多个 JSON。多个文件合并统计，不写入或覆盖生成器记录。
3. 默认按题目数统计并保留重复题目。可勾选去重：有 panoId/pano 时按该 ID，没有时按 7 位小数坐标。
4. 点击“计算配比”，可按国家筛选、按数量/相对比例/名称排序，或导出 CSV。

支持以下输入：

- MapGenerator / GeoGuessr `{"customCoordinates":[...]}`。
- `{"locations":[...]}`、本程序 `{"records":[...]}` 统计备份。
- 直接的地点数组。
- GeoJSON Point FeatureCollection / 单个 Point Feature。
- 地点可含 `lat/lng`、`latitude/longitude`、`Lat/Lng`，或 `latLng` 对象。

只解析明确的地点列表，**不会将 radius、candidateLat、method 等元数据当作地点**。没有有效经纬度的纯全景 ID 字符串无法做省份归属，列为无有效坐标；不凭编码或导入文件自报的省份直接认定归属。

### 计算方法

对国家 c 的行政区 i：

- `N_c`：成功识别到国家 c 的地点数量（开启去重时使用去重后的数量）。
- `n_i`：识别到行政区 i 的地点数量。
- `w_i`：Vali 模板原始权重。
- 实际占比 = `n_i / N_c`。
- 模板占比 = `w_i / 该国所有模板权重总和`。
- 相当于模板 = `实际占比 / 模板占比 × 100%`。
- 相对偏差 = `相当于模板 - 100%`。
- 差值（百分点）= `实际占比(%) - 模板占比(%)`。

例如实际 6%、模板 4%：相当于模板 150%，相对偏差 +50%，差值 +2 个百分点。

每个国家独立计算分母；无坐标、范围外、未匹配地点不会静默分摊到某省，会在汇总单列。没有该国有效地点时，实际占比和倍数显示“—”，不把空样本当作 0% 的观察结果。全部行政区均列出，零数量也保留。模板权重为 0 或没有该项时不做除法。

配比器完全在浏览器本地计算，不调用 Google，不上传选中的地图文件。较大地图使用 Web Worker 后台处理并显示进度，可取消。

## ISO 代码与模板口径

Vali 取自 https://github.com/slashP/Vali ，固定提交：`d961e46700395197ba0bb793381ed6a8e89f1e2e`。

模板来自该提交的 `src/Vali.Core/SubdivisionWeights.cs`，与 `vali subdivisions --country XX` 默认导出使用的权重源相同。模板是生成分布参考，不是 Google 官方街景覆盖量。

- 每个边界特征新增 `properties.iso3166_2`，网站表格显示名称，ISO 代码仅作内部关联、悬浮提示及 CSV 字段。
- 阿根廷省份通过原有行政区 ID 对应 AR-* 代码；智利对源文件缺失的行政区代码逐一映射。
- 修正墨西哥 Distrito Federal 原错误 `MX-MEX` 为 `MX-CMX`，名称显示 Ciudad de México；墨西哥州仍为 `MX-MEX`。
- 修正美国 South Dakota 源文件中的 `SU-SD` 为 `US-SD`。
- 秘鲁边界含 Lima Metropolitana（`PE-LMA`），Vali 模板仅有 25 项，没有该项。**不擅自合并到 `PE-LIM`**；Lima Metropolitana 仍计入秘鲁实际总数，倍数显示“模板未收录”。由于口径不同，比较 Lima 时需注意这一点。
- 哥伦比亚模板 Guainía / Vaupés 的权重为 0，保持原值并显示“模板为 0”，不会除以零。

来源文件、原始权重、归一化分母及边界代码修正记录保留在 `data/vali-templates.json`。Vali 来源文件按其 GPL-3.0 许可附带原始源码和许可证。本次转换仅提取七国权重并关联名称，未修改数值。

美国边界采用 geoBoundaries gbOpen 的 ADM1 simplified 数据，原始来源和年份见 `USA-source.json`；从原 56 项筛选出与 Vali 对齐的 50 州及特区，排除 PR/AS/VI/GU/MP。其他六国沿用原仓库几何，修正和补齐名称/代码。保留所有原始来源元数据；重新分发时请同时保留。哥伦比亚源包含 OpenStreetMap / Wambacher（© OpenStreetMap contributors，https://www.openstreetmap.org/copyright）。

## 验证

无需安装依赖，使用现成 Node 可运行：

```bash
node tests/core-tests.mjs
node tests/generator-tests.mjs
node tests/worker-tests.mjs
node tests/ui-tests.mjs
```

已验证七国映射、州数、阿拉斯加/夏威夷、跨日期变更线、带洞多边形、按面积取样、6%/4%=150%、零/缺失模板、混合 JSON、去重、1500 条输入计数、异步国家加载失败重试、原阿根廷记录兼容、美国模拟生成与地图导出、实际分析 Worker 协议及界面事件。

尚未在真实 Google 服务下验证新美国街景生成速度，未在外部地图网站实测导入。浏览器渲染验证因运行环境限制未完成；JavaScript 语法、HTML 结构及上述逻辑/界面事件测试已通过。

本地运行需用 HTTP 服务，例如 `python -m http.server 8000`，然后访问 `http://localhost:8000`；不要双击打开，因为外部边界、模块和 Worker 需要同源 HTTP 读取。
