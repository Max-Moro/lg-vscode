(function(global){
  function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtInt(n){ return (n ?? 0).toLocaleString(); }
  function fmtPct(x){ return (x ?? 0).toFixed(1) + "%"; }
  function hrSize(n){ const u=["bytes","KiB","MiB","GiB"]; let i=0,x=n||0; for(;i<u.length-1&&x>=1024;i++)x/=1024; return i===0?x+" bytes":x.toFixed(1)+" "+u[i]; }
  global.LG = { esc, fmtInt, fmtPct, hrSize };
})(window);
