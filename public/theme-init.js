// Runs before first paint so the page never flashes the wrong theme or size.
(function () {
  try {
    var t = localStorage.getItem('portlogi.theme') || 'system'
    var s = localStorage.getItem('portlogi.text') || 'M'
    var light = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
    var d = document.documentElement
    d.dataset.theme = light ? 'light' : 'dark'
    d.dataset.text = s
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
})()
