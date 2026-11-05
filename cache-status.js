(function () {
  'use strict';
  const status=document.getElementById('site-cache-status'),button=document.getElementById('update-site');
  const cache=window.applicationCache;
  if(!cache){status.textContent='Online loading — reload to check for updates.';button.addEventListener('click',()=>location.reload());return;}
  let ready=false;
  function updated(){try{cache.swapCache();}catch(_){}ready=true;status.textContent='Site update ready. Reload before starting the jailbreak.';button.textContent='Reload updated site';}
  cache.addEventListener('updateready',updated);
  cache.addEventListener('cached',()=>{status.textContent='Offline site cache is ready.';button.disabled=false;});
  cache.addEventListener('noupdate',()=>{status.textContent='Site cache is up to date.';button.disabled=false;});
  cache.addEventListener('error',()=>{status.textContent='Could not update the offline cache. Check the connection and try again.';button.disabled=false;});
  button.addEventListener('click',()=>{if(ready){location.reload();return;}button.disabled=true;status.textContent='Checking for a site update…';try{cache.update();}catch(_){button.disabled=false;status.textContent='Update check is already running. Wait, then reload.';}});
  status.textContent='Manager checks for the published ELF when online.';
  if(cache.status===cache.UPDATEREADY)updated();
})();
