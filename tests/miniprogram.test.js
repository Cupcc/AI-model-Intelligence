const assert = require('node:assert/strict')
const { test } = require('node:test')
let definition
global.Page = value => { definition = value }
require('../miniprogram/pages/index/index')
const bundled = require('../miniprogram/data/models')
const dataset = date => ({ ...bundled, generatedAt: date })

function page() {
  const instance = { ...definition, data: structuredClone(definition.data), dataset: bundled }
  instance.setData = patch => Object.assign(instance.data, patch)
  instance.scheduleMeasure = () => {}
  instance.refresh()
  return instance
}

test('older cache cannot replace a newer bundled dataset', () => {
  global.wx = { getStorageSync: () => dataset('2020-01-01T00:00:00Z') }
  const instance = page()
  instance.loadCachedDataset()
  assert.equal(instance.dataset.generatedAt, bundled.generatedAt)
})

test('older server data cannot overwrite newer local data or cache', () => {
  let request, stored = false
  global.wx = { request: options => { request = options }, setStorageSync: () => { stored = true } }
  const instance = page()
  instance.loadRemoteData(true)
  request.success({ statusCode: 200, data: dataset('2020-01-01T00:00:00Z') })
  request.complete()
  assert.equal(instance.dataset.generatedAt, bundled.generatedAt)
  assert.equal(stored, false)
  assert.match(instance.data.dataStatus, /旧/)
})

test('successful refresh updates the displayed models and cache', () => {
  let request, cached
  global.wx = { request: options => { request = options }, setStorageSync: (_, value) => { cached = value } }
  const instance = page()
  const fresh = dataset('2099-01-01T00:00:00Z')
  fresh.models = [{ ...bundled.models[0], slug: 'new-model', name: 'New model', family: 'New model' }]
  instance.loadRemoteData(true)
  request.success({ statusCode: 200, data: fresh })
  request.complete()
  assert.equal(instance.data.leader.slug, 'new-model')
  assert.equal(instance.data.dataSource, '在线数据')
  assert.equal(cached, fresh)
  assert.equal(instance.remoteLoading, false)
})

test('failed request reports domain configuration and allows retry on foreground', () => {
  let request, requests = 0
  global.wx = { request: options => { request = options; requests++ } }
  const instance = page()
  instance.hasLoaded = true
  instance.loadRemoteData(false)
  request.fail({ errMsg: 'request:fail url not in domain list' })
  request.complete()
  assert.match(instance.data.dataStatus, /合法域名/)
  instance.onShow()
  assert.equal(requests, 2)
})

test('malformed response does not replace the current dataset', () => {
  let request
  global.wx = { request: options => { request = options } }
  const instance = page()
  instance.loadRemoteData(true)
  request.success({ statusCode: 200, data: { models: [{ slug: 'bad', name: 'Bad' }], benchmarks: {} } })
  request.complete()
  assert.equal(instance.dataset.generatedAt, bundled.generatedAt)
  assert.match(instance.data.dataStatus, /异常/)
})

test('HTTP failures preserve the dataset and show the status code', () => {
  let request
  global.wx = { request: options => { request = options } }
  const instance = page()
  instance.loadRemoteData(true)
  request.success({ statusCode: 503, data: {} })
  request.complete()
  assert.equal(instance.dataset.generatedAt, bundled.generatedAt)
  assert.match(instance.data.dataStatus, /503/)
})

test('detail links use the release slug, not the model UUID', () => {
  let copied
  global.wx = { setClipboardData: ({ data }) => { copied = data } }
  const instance = page()
  instance.data.selected = { slug: 'model-uuid', releaseSlug: 'example' }
  instance.copySource()
  assert.equal(copied, 'https://artificialanalysis.ai/models/example')
})
