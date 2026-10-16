
(function(){
  const views=[...document.querySelectorAll('.view')];
  const buttons=[...document.querySelectorAll('.navBtn')];
  function activate(name){
    views.forEach(v=>v.classList.toggle('active',v.dataset.view===name));
    buttons.forEach(b=>b.classList.toggle('active',b.dataset.target===name));
    sessionStorage.setItem('workclock-view',name);
    window.__WorkClockRefreshView?.(name);
    window.scrollTo({top:0,behavior:'instant'});
  }
  window.__activateWorkClockView=activate;
  function refreshDate(){const d=new Date();document.getElementById('appDateLine').textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});}
  window.__WorkClockAppResume=function(){refreshDate();window.__WorkClockTimerResume?.();window.__WorkClockNativeSync?.();};
  window.__WorkClockHandleBack=function(){
    if(document.getElementById('timeModal').classList.contains('show')){document.getElementById('closeTimeModal').click();return true;}
    if(document.getElementById('projectModal').classList.contains('show')){document.getElementById('cancelProjectModal').click();return true;}
    if(!manual.classList.contains('collapsed')){document.getElementById('hideManualEntry').click();return true;}
    if(!document.getElementById('viewToday').classList.contains('active')){activate('today');return true;}
    return false;
  };
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshDate();}});
  buttons.forEach(b=>b.addEventListener('click',()=>activate(b.dataset.target)));
  document.getElementById('goPlacesForLocation').addEventListener('click',()=>activate('places'));
  const manual=document.getElementById('manualCard');
  document.getElementById('showManualEntry').addEventListener('click',()=>{manual.classList.remove('collapsed');setTimeout(()=>manual.scrollIntoView({behavior:'smooth',block:'start'}),30)});
  document.getElementById('hideManualEntry').addEventListener('click',()=>manual.classList.add('collapsed'));
  const saved=sessionStorage.getItem('workclock-view'); if(saved&&views.some(v=>v.dataset.view===saved)) activate(saved);
  window.__WorkClockRestoreHistoryMode?.();
  refreshDate();
})();
