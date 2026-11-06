/* Manager-only post-jailbreak handoff. No exploit code or automatic retries. */
(function () {
  'use strict';
  let pending;
  window.startManagerFlow = function (options) {
    if (pending) return pending;
    pending = (async function () {
      options.status('Starting PSN-HUB Manager?');
      // One send per attempt; readiness polling never sends the ELF again.
      const bytes = await options.send('PSN-HUB-Manager.elf');
      options.status('Manager sent. Waiting for its dashboard?');
      const pause = options.pause || (ms => new Promise(resolve => setTimeout(resolve, ms)));
      const address = options.address;
      if (!/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}:8085\/$/.test(address || '')) throw new Error('Manager address unavailable. Open your PS5 address on port 8085.');
      for (let attempt=0; attempt<40; attempt++) {
        let ready=false;
        try { ready=typeof options.ready==='function' && await options.ready(); } catch (_) {}
        if (ready) {
          options.status('Manager is ready. Opening dashboard?');
          try { options.navigate(address); return {bytes, opened:true}; }
          catch (_) { options.status('Manager is ready. Use Open Manager to open its dashboard.'); return {bytes, opened:false}; }
        }
        if(attempt<39)await pause(500);
      }
      options.status('Manager was sent, but its dashboard is not ready yet. Wait, then use Open Manager. Retry starting Manager only if needed.');
      return {bytes, opened:false};
    })().finally(()=>{pending=null;});
    return pending;
  };
})();
