;(function () {
  try {
    var savedTheme = localStorage.getItem('lancee-theme') || 'dark'
    var isDashboard = window.location.pathname.indexOf('/dashboard') === 0
    var theme = isDashboard ? savedTheme : 'dark'
    document.documentElement.setAttribute('data-theme', theme === 'sky' ? 'light' : theme)
    if (theme === 'sky') document.documentElement.setAttribute('data-theme-variant', 'sky')
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})()
