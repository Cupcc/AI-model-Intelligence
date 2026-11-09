// 线上数据地址。该地址必须加入微信公众平台的「request 合法域名」。
// GitHub Actions 更新 docs/data.json 后，已发布的小程序会在下次启动时拉取新数据。
module.exports = {
  dataUrl: 'https://cupcc.github.io/AI-model-Intelligence/data.json',
  requestTimeout: 8000,
  refreshInterval: 10 * 60 * 1000
}
