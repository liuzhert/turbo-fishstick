import {COUNTRIES,loadCountry,pointInGeometry} from './geo-core.mjs';
    let generatorIndex;
    let scopeLoading = true;
    let switchVersion = 0;
    let selectedCountry = "ARG";
    let selectedProvince = "";
    let service;
    let stopRequested = false;
    let mapsPromise;
    const METHOD = 'mapgenerator-area-search-v1';
    const seenPanos = new Set();

    let STORAGE_KEY = 'argentinaSamples-mapgenerator-v1';

    
    let records = [];
    let samplerReady = false;
    let sampling = false;
    let latestRecord = null;
    


function identifyProvince(lat,lng) { return generatorIndex?.find(lat,lng)?.name || '未匹配'; }

    function setStatus(message) {
      document.getElementById('status').textContent = message;
    }

    function saveData() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(records)
        );
      } catch (error) {
        setStatus('浏览器存储已满。请先导出统计备份后清理。');
      }
    }

    function render() {
      document.getElementById('total').textContent = records.length;
      const counts = {};
      for (const record of records) {
        const country = record.province || '尚未识别省份';
        counts[country] = (counts[country] || 0) + 1;
      }

      const results = document.getElementById('results');
      if (!records.length) {
        results.textContent = '暂无记录。';
        latestRecord = null;
        document.getElementById('latest').replaceChildren();
        return;
      }

      results.innerHTML = '';
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
          const p = document.createElement('p');
          const percent = count / records.length * 100;
          p.textContent = `${name}：${count} 次（${percent.toFixed(2)}%）`;
          results.appendChild(p);
        });

      const last = records[records.length - 1];
      latestRecord = last;
      const latestEl = document.getElementById('latest');
      latestEl.replaceChildren();

      if (Number.isFinite(last.lat) && Number.isFinite(last.lng)) {
        const a = document.createElement('a');
        a.href = streetViewURL(last.lat, last.lng, last.pano);
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = `打开最新位置：${last.lat.toFixed(6)}, ${last.lng.toFixed(6)}`;
        latestEl.appendChild(a);
      }
    }

    function streetViewURL(lat, lng, pano) {
      return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}${pano ? "&pano=" + encodeURIComponent(pano) : ""}`;
    }


    let countryGeometry;
    let countryGeometryPromise;
    function loadScopeRecords() {
      STORAGE_KEY=selectedCountry==='ARG'?'argentinaSamples-mapgenerator-v1':`streetviewSamples-${selectedCountry}-mapgenerator-v1`;
      if(selectedProvince)STORAGE_KEY+='-province-'+encodeURIComponent(selectedProvince);
      records=[];seenPanos.clear();latestRecord=null;
      try {
        let stored=localStorage.getItem(STORAGE_KEY);
        // Preserve access to older per-province scopes whose labels contained spelling errors.
        if(stored===null&&selectedProvince){
          const f=generatorIndex.regions.find(r=>r.name===selectedProvince)?.feature;
          const old=f?.properties?.nombre||f?.properties?.shapeName;
          if(old&&old!==selectedProvince){
            const prefix=selectedCountry==='ARG'?'argentinaSamples-mapgenerator-v1':`streetviewSamples-${selectedCountry}-mapgenerator-v1`;
            stored=localStorage.getItem(prefix+'-province-'+encodeURIComponent(old));
          }
        }
        const parsed=JSON.parse(stored||'[]');if(Array.isArray(parsed))records=parsed;
      }catch(error){console.error('记录读取失败',error);}
      for(const r of records)if(r.pano)seenPanos.add(r.pano);
      render();setStatus(`${COUNTRIES[selectedCountry].name} · ${selectedProvince||'全国'}：已就绪。`);
    }
    function scopeControls(loading) {
      document.getElementById('startBtn').disabled=loading;
      document.getElementById('provinceSelect').disabled=loading;
      document.getElementById('verifyBtn').disabled=loading;
      document.getElementById('clearBtn').disabled=loading;
    }
    window.changeCountry=async function(iso){
      if(sampling||!COUNTRIES[iso]){document.getElementById('countrySelect').value=selectedCountry;return;}
      const version=++switchVersion;scopeLoading=true;scopeControls(true);
      setStatus(`正在加载${COUNTRIES[iso].name}…`);
      try {
        const index=await loadCountry(iso);
        let country=null;
        if(iso==='ARG'){
          countryGeometryPromise??=fetch('./data/ARG-country.geojson').then(r=>{if(!r.ok)throw new Error('阿根廷国界文件读取失败。');return r.json()}).catch(e=>{countryGeometryPromise=null;throw e});
          country=(await countryGeometryPromise).geometry;
        }
        if(version!==switchVersion)return;
        generatorIndex=index;countryGeometry=country;selectedCountry=iso;selectedProvince='';
        document.getElementById('countrySelect').value=iso;
        const select=document.getElementById('provinceSelect');select.replaceChildren();
        const all=document.createElement('option');all.value='';all.textContent='全国';select.appendChild(all);
        for(const name of index.regions.map(r=>r.name).sort((a,b)=>a.localeCompare(b))){const option=document.createElement('option');option.value=name;option.textContent=name;select.appendChild(option);}
        select.value='';loadScopeRecords();samplerReady=true;
      }catch(error){
        if(version===switchVersion){document.getElementById('countrySelect').value=selectedCountry;setStatus(error.message);}
      }finally{
        if(version===switchVersion){scopeLoading=false;scopeControls(!generatorIndex);}
      }
    };
    window.changeProvince=function(name){
      if(sampling||scopeLoading){document.getElementById('provinceSelect').value=selectedProvince;return;}
      if(name&&!generatorIndex.regions.some(r=>r.name===name))return;
      selectedProvince=name;document.getElementById('provinceSelect').value=name;loadScopeRecords();
    };
    function permittedArea(lat,lng){
      const r=generatorIndex?.find(lat,lng);if(!r||selectedProvince&&r.name!==selectedProvince)return false;
      return selectedCountry!=='ARG'||pointInGeometry(lng,lat,countryGeometry);
    }
    function checkedLocation(record){
      if(!record||!permittedArea(record.lat,record.lng))return null;
      const region=generatorIndex.find(record.lat,record.lng);
      return {...record,province:region.name,subdivisionCode:region.code};
    }
    function randomCandidate(){
      for(let i=0;i<100000;i++){
        const point=generatorIndex.randomPoint(selectedProvince);
        if(permittedArea(point.lat,point.lng))return point;
      }
      throw new Error('所选区域无法生成候选点。');
    }

    function loadMaps() {
      if (window.google?.maps?.StreetViewService) return Promise.resolve();
      if (mapsPromise) return mapsPromise;
      mapsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const key = document.getElementById('apiKey').value.trim();
        const timer = setTimeout(() => reject(new Error('Google Maps 加载超时，请检查网络后刷新重试。')), 30000);
        window.__argentinaMapsReady = () => { clearTimeout(timer); resolve(); };
        window.gm_authFailure = () => { clearTimeout(timer); reject(new Error('Google Maps 鉴权失败，请填写有效 API Key 并刷新重试。')); };
        script.onerror = () => { clearTimeout(timer); reject(new Error('Google Maps 下载失败，请检查网络后刷新。')); };
        const params = new URLSearchParams({v:'weekly', callback:'__argentinaMapsReady', loading:'async'});
        if (key) params.set('key', key);
        script.src = 'https://maps.googleapis.com/maps/api/js?' + params;
        document.head.appendChild(script);
      });
      return mapsPromise;
    }

    function queryPanorama(point, radius) {
      return new Promise(resolve => {
        // A timeout is a batch error, never silently a coverage miss.
        const timer = setTimeout(() => resolve({error:'TIMEOUT'}), 20000);
        try {
          service.getPanorama({location: point, radius,
            sources: [google.maps.StreetViewSource.GOOGLE]}, (data, status) => {
            clearTimeout(timer);
            if (status === 'OK') resolve({data});
            else if (status === 'ZERO_RESULTS') resolve({miss:true});
            else resolve({error: String(status)});
          });
        } catch (error) { clearTimeout(timer); resolve({error:error.message}); }
      });
    }

    async function initializeSampler() { await window.changeCountry('ARG'); }

    window.stopSampling = function () {
      stopRequested = true;
      setStatus('正在停止：等待当前批次结束并保存已完成的结果……');
    };

    window.startSampling = async function () {
      if (sampling || scopeLoading || !samplerReady) return;
      const count = Number(document.getElementById('count').value);
      const radius = Number(document.getElementById('radius').value);
      const concurrency = Number(document.getElementById('concurrency').value);
      const filters = document.getElementById('defaultFilters').checked;
      if (!Number.isInteger(count) || count < 1 || count > 1000 ||
          !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32 ||
          !Number.isFinite(radius) || radius < 10 || radius > 1000000) {
        setStatus('请检查数量（1–1000）、半径（10–1000000）和并发（1–32）。'); return;
      }
      const config = {radius, defaultFilters: filters};
      if (records.some(r => r.radius !== radius || r.defaultFilters !== filters)) {
        setStatus('当前设置与已有记录不一致。请先导出并清除本版记录，再以新设置抽样，避免混合不同比例。'); return;
      }
      sampling = true;
      stopRequested = false;
      document.getElementById('startBtn').disabled = true;
      document.getElementById('stopBtn').disabled = false;
      document.getElementById('clearBtn').disabled = true;
      document.getElementById('verifyBtn').disabled = true;
      document.getElementById('countrySelect').disabled = true;
      document.getElementById('provinceSelect').disabled = true;
      let accepted = 0, attempts = 0, misses = 0, rejected = 0, duplicates = 0;
      let stoppedByError = '';
      const started = performance.now();
      // Large sparse countries need many misses; this guard prevents an endless run.
      const maxAttempts = Math.min(200000, Math.max(5000, count * 1000));
      const report = () => `新增 ${accepted}/${count}；查询 ${attempts}；无覆盖 ${misses}；过滤/越界 ${rejected}；重复 ${duplicates}；耗时 ${((performance.now()-started)/1000).toFixed(1)} 秒`;
      try {
        setStatus('正在加载 Google 街景服务……');
        await loadMaps();
        service = new google.maps.StreetViewService();
        while (accepted < count && attempts < maxAttempts && !stopRequested) {
          const points = Array.from({length: Math.min(concurrency, maxAttempts - attempts)}, randomCandidate);
          setStatus('正在抽样：' + report());
          const batch = await Promise.all(points.map(point => queryPanorama(point, radius)));
          attempts += points.length;
          const bad = batch.find(item => item.error);
          // Do not select only the fast/successful replies from a failing batch.
          if (bad) throw new Error('街景服务返回 ' + bad.error + '；当前批次未计入，请检查网络、Key 或配额后重试。');
          // Process in original candidate order, not network completion order.
          for (let i = 0; i < batch.length && accepted < count; i++) {
            const item = batch[i];
            if (item.miss) { misses++; continue; }
            const data = item.data, loc = data?.location;
            const lat = loc?.latLng?.lat(), lng = loc?.latLng?.lng();
            const verified = checkedLocation({lat, lng});
            if (!verified || typeof loc?.pano !== 'string' || !loc.pano.trim()) { rejected++; continue; }
            const imageTime = Date.parse(data.imageDate || '');
            const now = new Date();
            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
            if (filters && (loc.pano.length !== 22 || !Number.isFinite(imageTime) ||
                imageTime < Date.parse('2009-01') || imageTime >= nextMonth ||
                !(loc.description || loc.shortDescription) ||
                ![6656, 8192].includes(data.tiles?.worldSize?.height))) { rejected++; continue; }
            const province = verified.province;
            // Count only returned panorama coordinates that pass both boundary checks.
            if (seenPanos.has(loc.pano)) { duplicates++; continue; }
            const record = {lat, lng, province, subdivisionCode:verified.subdivisionCode, country:selectedCountry, samplingProvince:selectedProvince, pano:loc.pano, imageDate:data.imageDate || '',
              time:new Date().toISOString(), method:METHOD, source:'Google Street View',
              ...config, candidateLat:points[i].lat, candidateLng:points[i].lng};
            records.push(record); seenPanos.add(loc.pano); latestRecord = record; accepted++;
          }
          saveData(); render();
          setStatus('正在抽样：' + report());
          // Yield to the UI and limit request bursts.
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        stoppedByError = error.message;
        console.error(error);
      } finally {
        sampling = false;
        saveData(); render();
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('clearBtn').disabled = false;
        document.getElementById('verifyBtn').disabled = false;
        document.getElementById('countrySelect').disabled = false;
        document.getElementById('provinceSelect').disabled = false;
        const reason = stoppedByError ? '已中止：' + stoppedByError : stopRequested ? '已停止' : accepted === count ? '本次完成' : '已达到查询上限，可继续抽样';
        setStatus(reason + '\n' + report() + `。累计 ${records.length} 条。`);
      }
    };

    window.openLatest = function () {
      if (!latestRecord) {
        setStatus('目前还没有可打开的抽样位置。');
        return;
      }
      window.open(
        streetViewURL(latestRecord.lat, latestRecord.lng, latestRecord.pano),
        '_blank',
        'noopener'
      );
    };

    function downloadFile(content, filename, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    window.exportCSV = function () {
      if (!records.length) {
        setStatus('暂无记录可导出。');
        return;
      }

      const rows = records.map(r => ({
        r_lat: r.lat,
        r_lng: r.lng,
        r_province: r.province || '',
        r_time: r.time,
        r_method: r.method || '',
        r_source: r.source || '',
        r_country: r.country || selectedCountry,
        r_pano: r.pano || '',
        r_radius: r.radius,
        r_defaultFilters: r.defaultFilters,
        r_imageDate: r.imageDate || '',
      }));

      const escapeCSV = value => {
        const s = String(value ?? '');
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map(row => headers.map(h => escapeCSV(row[h])).join(','))
      ].join('\n');

      downloadFile(
        '\uFEFF' + csv,
        `${COUNTRIES[selectedCountry].fileName}-streetview-samples.csv`,
        'text/csv;charset=utf-8'
      );
    };

    // MapGenerator's export schema: {customCoordinates:[{panoId,lat,lng,heading,pitch,zoom}]}.
    // Never put diagnostic objects or metadata into the map's location list.
    function buildMapPayload(input) {
      const customCoordinates = [];
      const exportedPanos = new Set();
      let invalid = 0, duplicates = 0;
      for (const raw of input) {
        const record = checkedLocation(raw);
        const panoId = raw && (raw.panoId || raw.pano);
        if (!record || typeof panoId !== 'string' || !panoId.trim()) { invalid++; continue; }
        if (exportedPanos.has(panoId.trim())) { duplicates++; continue; }
        exportedPanos.add(panoId.trim());
        customCoordinates.push({panoId:panoId.trim(), lat:record.lat, lng:record.lng,
          heading:Number.isFinite(raw.heading) ? raw.heading : 0,
          pitch:Number.isFinite(raw.pitch) ? raw.pitch : 0,
          zoom:Number.isFinite(raw.zoom) ? raw.zoom : 0});
      }
      return {payload:{customCoordinates}, invalid, duplicates};
    }
    function downloadMap(input) {
      const result = buildMapPayload(input);
      const count = result.payload.customCoordinates.length;
      if (!count) { setStatus('没有可导出的有效地点：需要真实 panoId、有效经纬度和匹配的省份。'); return; }
      downloadFile(JSON.stringify(result.payload, null, 2),
        `${COUNTRIES[selectedCountry].fileName} (${count} locations).json`, 'application/json;charset=utf-8');
      setStatus(`已导出地图 JSON：${count} 个地点；跳过无效/未匹配 ${result.invalid} 条，重复 ${result.duplicates} 条。`);
    }
    window.exportJSON = function () { downloadMap(records); };

    window.exportBackup = function () {
      downloadFile(JSON.stringify({country:selectedCountry, samplingProvince:selectedProvince, exportedAt:new Date().toISOString(), totalSamples:records.length,
        records, refs:{method:METHOD, purpose:'statistics-backup-not-map-import'}}, null, 2),
        `${COUNTRIES[selectedCountry].fileName}-statistics-backup.json`, 'application/json;charset=utf-8');
    };

    window.convertOldJSON = async function (input) {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed) ? parsed : parsed.records || parsed.customCoordinates;
        if (!Array.isArray(list)) throw new Error('需要包含 records 或 customCoordinates 的 JSON，或地点数组。');
        downloadMap(list);
      } catch (error) { setStatus('转换失败：' + error.message); }
      finally { input.value = ''; }
    };

    window.verifyExisting = function () {
      if (sampling || scopeLoading) return;
      const valid = [];
      let invalid = 0;
      for (const raw of records) {
        const checked = checkedLocation(raw);
        if (checked) valid.push(checked); else invalid++;
      }
      if (invalid && !confirm(`核验发现 ${invalid} 条国界/省界不合格记录。将先在本浏览器保留一份原始记录，再从当前统计移除，继续吗？`)) return;
      // Retain original data before filtering, even if the page is closed afterwards.
      try {
        if (invalid) localStorage.setItem(STORAGE_KEY + '-before-check-' + Date.now(), JSON.stringify(records));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } catch (error) { setStatus('核验结果未应用：浏览器存储失败。请先导出统计备份。'); return; }
      records = valid;
      seenPanos.clear();
      for (const r of records) if (r.pano) seenPanos.add(r.pano);
      render();
      setStatus(`坐标核验完成：有效 ${valid.length} 条，移除 ${invalid} 条。未重新联网验证全景是否仍可打开。`);
    };

    window.clearData = function () {
      if (sampling || scopeLoading) return;
      if (!confirm('确定要清空当前国家及抽样范围的记录吗？')) {
        return;
      }

      records = [];
      seenPanos.clear();
      latestRecord = null;
      localStorage.removeItem(STORAGE_KEY);
      render();
      setStatus('本地抽样记录已清除。');
    };

    render();

    Promise.resolve().then(initializeSampler).catch(error => {
      console.error(error);
      setStatus(
        '初始化失败：' + error.message +
        '\n请检查网络、地区名称、边界数据，或稍后重试。'
      );
    });
  