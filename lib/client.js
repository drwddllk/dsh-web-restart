/**
 * dsh-web-restart — client half.
 *
 * Hand-written bundle in the exact wire format the DSH web shell expects:
 * a CJS factory handed to window.__ModuleLoader__.load({ id, factory }),
 * with platform modules (react) resolved through the injected require.
 * Registers the "重启 DSH" button in sidebar.footer.action; a single click
 * POSTs /restart-dsh (no confirmation step). A status dot next to the button
 * polls GET /dsh-health every 5s (green = online, red = offline/restarting).
 */
window.__ModuleLoader__.load({
  id: 'dsh-web-restart',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var inject = ['slots'];

    function apply(ctx) {
      // 按钮点击后置 true：重启期间加快探测频率，服务器恢复后立即整页刷新。
      // 放在 apply 作用域，供 click 处理器与健康探测闭包共享（跨 render 稳定）。
      var restartState = { requested: false };

      // ── stylesheet (package-owned, cleaned up on teardown) ──
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {};
        var existing = document.querySelector('style[data-dsh-web-restart-css]');
        if (existing !== null) return () => {};
        var tag = document.createElement('style');
        tag.dataset.dshRestartButtonCss = '1';
        tag.textContent = [
          '.zai-restart-dsh{flex:none;align-items:center;width:100%;height:49px;color:var(--dsw-alias-label-primary);cursor:pointer;background:transparent;border:none;border-radius:12px;gap:8px;padding:0 8px 0 6px;font-family:inherit;font-size:14px;display:inline-flex;overflow:hidden;position:relative}',
          '.zai-restart-dsh:hover{background:var(--dsw-alias-bg-layer-2)}',
          '.zai-restart-dsh--armed{color:var(--dsw-alias-state-error-primary)}',
          '.zai-restart-dsh--armed:hover{background:var(--dsw-alias-state-error-primary);color:#fff}',
          '.zai-restart-dsh--rail{width:36px;height:36px;border-radius:50%;justify-content:center;gap:0;padding:0}',
          '.zai-restart-dsh__label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}',
          '.zai-dsh-dot{flex:none;width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--dsw-alias-label-tertiary)}',
          '.zai-dsh-dot--ok{background:#22c55e;box-shadow:0 0 4px rgba(34,197,94,.6)}',
          '.zai-dsh-dot--down{background:#ef4444;box-shadow:0 0 4px rgba(239,68,68,.6)}',
          '.zai-dsh-dot--unknown{background:var(--dsw-alias-label-tertiary)}',
          '.zai-restart-dsh--rail .zai-dsh-dot{position:absolute;top:2px;right:2px;width:7px;height:7px}',
          '.zai-restart-dsh__status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;white-space:nowrap}'
        ].join('\n');
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'dsh-web-restart: stylesheet');

      // ── footer action button + online status dot ──
      ctx.effect(() => {
        var disposeSlot = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'restart-dsh',
          order: -100,
          label: () => '重启 DSH'
        }, (props) => {
          var wide = props.wide;
          var phaseState = React.useState('idle');
          var phase = phaseState[0];
          var setPhase = phaseState[1];
          var messageState = React.useState('');
          var message = messageState[0];
          var setMessage = messageState[1];
          // 在线状态：'checking' | 'ok' | 'down'
          var healthState = React.useState('checking');
          var health = healthState[0];
          var setHealth = healthState[1];

          // 健康探测 + 自动刷新。
          // - 按钮点击（restartState.requested）：服务器真正断开后（1 次探测失败即确认），
          //   恢复为 ok 时整页 reload——无论断线窗口多短都可靠触发；恢复期探测加快到 1 秒。
          // - 外部重启（如桌面 bat）：连续 2 次探测失败（约 10 秒）判定断开，恢复后同样自动刷新，
          //   避免网络瞬间抖动误触发。
          var failStreak = 0;
          var sawDown = false;
          var reloadArmed = false;
          React.useEffect(function () {
            var timer = null;
            var check = function () {
              fetch('/dsh-health', { method: 'GET' })
                .then(function (res) {
                  if (res.ok) {
                    if (sawDown && !reloadArmed) {
                      reloadArmed = true;
                      failStreak = 0;
                      sawDown = false;
                      location.reload();
                      return;
                    }
                    failStreak = 0;
                    sawDown = false;
                    setHealth('ok');
                  } else {
                    setHealth('down');
                  }
                })
                .catch(function () {
                  failStreak += 1;
                  if (failStreak >= (restartState.requested ? 1 : 2)) sawDown = true;
                  setHealth('down');
                });
              timer = setTimeout(check, restartState.requested ? 1000 : 5000);
            };
            timer = setTimeout(check, 0);
            return function () { clearTimeout(timer); };
          }, []);

          // 单击直接重启（无二次确认）
          var click = () => {
            if (phase === 'sending' || phase === 'done') return;
            setPhase('sending');
            fetch('/restart-dsh', { method: 'POST' })
              .then((res) => res.json().catch(() => null))
              .then((data) => {
                restartState.requested = true;   // 重启已触发：服务器恢复后自动刷新页面
                setPhase('done');
                setMessage((data && data.message) || '重启已触发');
              })
              .catch((err) => {
                setPhase('error');
                setMessage(String((err && err.message) || err));
              });
          };

          var label = phase === 'sending' ? '重启中…'
            : phase === 'done' ? '已触发'
            : phase === 'error' ? '失败'
            : '重启 DSH';
          var title = phase === 'done' ? message
            : phase === 'error' ? message
            : '点击后 DSH 将重启（断开约 15-20 秒）';
          var cls = 'zai-restart-dsh'
            + (wide ? '' : ' zai-restart-dsh--rail')
            + (phase === 'sending' || phase === 'done' ? ' zai-restart-dsh--armed' : '');
          var statusText = health === 'ok' ? 'DSH 在线'
            : health === 'down' ? 'DSH 离线'
            : '检测中…';
          var dotCls = 'zai-dsh-dot'
            + (health === 'ok' ? ' zai-dsh-dot--ok'
              : health === 'down' ? ' zai-dsh-dot--down'
              : ' zai-dsh-dot--unknown');

          return React.createElement('button', {
            type: 'button',
            className: cls,
            onClick: click,
            title: title,
            'aria-label': '重启 DSH',
            disabled: phase === 'sending'
          }, [
            React.createElement('svg', {
              width: 14,
              height: 14,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 2,
              strokeLinecap: 'round',
              strokeLinejoin: 'round'
            }, [
              React.createElement('path', { d: 'M23 4v6h-6' }),
              React.createElement('path', { d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' })
            ]),
            wide && React.createElement('span', { className: 'zai-restart-dsh__label' }, label),
            wide && React.createElement('span', { className: 'zai-restart-dsh__status' }, statusText),
            React.createElement('span', {
              className: dotCls,
              title: statusText,
              'aria-label': statusText
            })
          ]);
        }));
        return () => disposeSlot();
      }, 'dsh-web-restart: footer action');
    }

    module.exports = { apply: apply, inject: inject };
    return module.exports;
  }
});
