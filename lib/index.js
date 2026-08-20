/**
 * dsh-web-restart — host half.
 *
 * Registers an exact POST route `/restart-dsh` on the webServer. The client
 * button (lib/client.js) fetches this route; the handler launches the dsh web
 * restart script as an independent hidden PowerShell process (Start-Process
 * wrapper so the script survives the DSH kill), under danger-full-access so
 * netstat/Stop-Process are not sandbox-denied.
 *
 * Also registers GET /dsh-health — a lightweight liveness probe the client
 * status dot polls every few seconds.
 *
 * The route returns BEFORE the restart happens (1s timer + 3s inner sleep),
 * so the browser has time to render the "restarting" state before the page
 * drops.
 */
export const name = 'dsh-web-restart'
export const inject = ['webServer', 'shell']

export function apply(ctx) {
  let restarting = false

  const disposeHealth = ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-health',
    handler: async (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, ts: Date.now() }))
    }
  })

  const disposeRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/restart-dsh',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, message: 'method not allowed' }))
        return
      }
      if (restarting) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, message: '重启已在进行中，请稍候' }))
        return
      }
      restarting = true
      // 注意：webServer handler 是纯 Node http 回调，不在 Cordis fiber 上下文里，
      // ctx.timeout（mixin→ctx.effect）在此不触发；改用 Node 原生 setTimeout。
      setTimeout(() => {
        try {
          // 独立进程 + 内部 3 秒延迟：DSH 被脚本杀掉后脚本继续执行，前端有时间渲染状态。
          // 用 -EncodedCommand（UTF-16LE base64）传递命令：工作区路径含空格（Deep Seek Harness），
          // 直接拼引号会在 Start-Process -> powershell 命令行解析时被剥掉，base64 无此问题。
          const restartCommand = 'Start-Sleep -Seconds 3; & "C:\\Users\\drwdd\\Documents\\Deep Seek Harness\\DSH-Manage.ps1" restart'
          const encoded = Buffer.from(restartCommand, 'utf16le').toString('base64')
          const command = "Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','" + encoded + "' -WindowStyle Hidden"
          const spec = ctx.shell.resolve({
            command,
            sandboxPolicy: { mode: 'danger-full-access' }
          })
          ctx.shell.start(spec)
          console.log('[dsh-web-restart] restart script launched')
        } catch (error) {
          restarting = false
          console.error('[dsh-web-restart] failed to launch restart:', error)
        }
      }, 1000)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, message: '重启已触发：DSH 将断开约 15-20 秒，之后请刷新页面' }))
    }
  })

  return () => { disposeHealth(); disposeRoute() }
}
