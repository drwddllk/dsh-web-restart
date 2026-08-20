# ============================================================
# dsh-web-restart — 同步上游更新（Sync Fork）速查脚本
# ------------------------------------------------------------
# 用途：作者（1123762794）更新插件后，把新代码合并进你的 fork，
#       同时保留你的个性化修改，然后再去 DSH 市场一键更新。
#
# 用法（任选其一）：
#   1) 右键本文件 → 使用 PowerShell 运行
#   2) 在终端里：  powershell -ExecutionPolicy Bypass -File .\sync-fork.ps1
#
# 备选方案（网页版，不用脚本）：
#   打开 https://github.com/drwddllk/dsh-web-restart
#   → 点上方 "Sync fork" → "Update branch"
#   → 本地执行 git pull 即可（无需 push，网页已帮你合好）。
#   注意：如果网页提示有冲突（conflict），网页会失败，只能用本脚本
#   在本地合并解决。
# ============================================================

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot   # 无论从哪里运行，都先进入仓库目录

Write-Host ''
Write-Host '========== 0. 检查工作区是否干净 ==========' -ForegroundColor Cyan
$dirty = git status --porcelain
if ($dirty) {
    Write-Host '⚠ 检测到未提交的修改：' -ForegroundColor Yellow
    Write-Host $dirty
    Write-Host ''
    Write-Host '请先处理这些修改再同步，否则会混入合并提交：' -ForegroundColor Yellow
    Write-Host '  - 想保留：先 git add . 再 git commit -m "..."'
    Write-Host '  - 想丢弃：git checkout -- <文件名>'
    exit 1
}
Write-Host '工作区干净 ✓'

Write-Host ''
Write-Host '========== 1. 确保有 upstream（作者原仓库）远程 ==========' -ForegroundColor Cyan
if (git remote | Select-String -Quiet '^upstream$') {
    Write-Host 'upstream 已存在 ✓'
} else {
    Write-Host '首次运行，添加作者原仓库为 upstream ...'
    git remote add upstream https://github.com/1123762794/dsh-web-restart.git
}

Write-Host ''
Write-Host '========== 2. 拉取作者的最新代码 ==========' -ForegroundColor Cyan
git fetch upstream
if ($LASTEXITCODE -ne 0) {
    Write-Host '✗ 拉取失败（多半是代理没开：Clash 需要运行在 127.0.0.1:7897）' -ForegroundColor Red
    exit 1
}
Write-Host '拉取完成 ✓'

Write-Host ''
Write-Host '========== 3. 合并到你的 main（保留你的修改） ==========' -ForegroundColor Cyan
git merge upstream/main
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '!!!!! 合并冲突，需要手动处理 !!!!!' -ForegroundColor Red
    Write-Host '冲突文件：' -ForegroundColor Red
    git diff --name-only --diff-filter=U
    Write-Host ''
    Write-Host '处理步骤：' -ForegroundColor Yellow
    Write-Host '  1) 用编辑器打开上面的冲突文件，搜索 <<<<<<< / ======= / >>>>>>> 标记'
    Write-Host '  2) 每个冲突处决定保留哪份（通常想要：你的个性化 + 作者的新功能）'
    Write-Host '  3) 保存后执行：  git add <文件>'
    Write-Host '  4) 再执行：      git commit -m "merge upstream: 解决冲突"'
    Write-Host '  5) 然后重新运行本脚本，会从第 4 步继续'
    exit 1
}
Write-Host '合并完成 ✓'

Write-Host ''
Write-Host '========== 4. 校验个性化修改仍在 ==========' -ForegroundColor Cyan
$indexOk  = Select-String -Path 'lib\index.js'  -Pattern 'DSH-Manage\.ps1' -Quiet
$clientOk = Select-String -Path 'lib\client.js' -Pattern 'restartState'   -Quiet
if ($indexOk -and $clientOk) {
    Write-Host '个性化修改完好 ✓（index.js 的 DSH-Manage.ps1 重启命令、client.js 的断线自动刷新）'
} else {
    Write-Host '⚠ 警告：没有找到个性化代码的标记，请检查合并结果！' -ForegroundColor Red
    Write-Host '  可能作者重写了相关文件，需要手动把修改补回去。' -ForegroundColor Red
}

Write-Host ''
Write-Host '========== 5. 推送到你的 fork ==========' -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host '✗ 推送失败（检查代理是否开启）' -ForegroundColor Red
    exit 1
}
Write-Host '推送完成 ✓'

Write-Host ''
Write-Host '========== 完成！接下来回到 DSH ==========' -ForegroundColor Green
Write-Host '  1. 打开 DSH Web → 插件市场 → dsh-web-restart → 点「更新」'
Write-Host '  2. 重启 DSH'
Write-Host '  3. 完事。你的个性化修改全程保留。' -ForegroundColor Green
Write-Host ''
