// Keep this script readable by WebViews that cannot parse the application bundle.
(function () {
  var panel = document.getElementById('startup');
  if (!panel) return;
  function showHelp(reason) {
    if (panel.hidden) return;
    document.getElementById('startup-title').textContent = '学习页面未能启动';
    document.getElementById('startup-message').textContent = reason;
    document.getElementById('startup-help').open = true;
    var version = navigator.userAgent.match(/(?:Chrome|Chromium)\/(\d+)/);
    if (version) document.getElementById('startup-version').textContent = '网页内核版本 ' + version[1];
  }
  document.getElementById('startup-retry').onclick = function (event) {
    event.preventDefault();
    location.reload();
  };
  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') showHelp('页面脚本没有下载成功。请检查网络后重新加载。');
    else if (event.message) showHelp('手机未能运行学习页面。可以重新加载，或从菜单用系统浏览器打开。');
  }, true);
  var timeout = setTimeout(function () {
    showHelp('页面仍未准备好。如果网络较慢，可以继续等待，也可以重新加载。');
  }, 12000);
  window.addEventListener('lexigo-ready', function () { clearTimeout(timeout); });
}());
