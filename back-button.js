// Shared "back to library" button. Add to any entry with:
//   <script src="../back-button.js"></script>
// Glass pill, top-left. Fades out after a moment of no mouse movement so
// wallpapers stay clean; reappears on mouse move or touch. Esc also goes back.
(function(){
  if (window.__vlBack) return; window.__vlBack = true;
  const HREF = new URL('../gallery.html', document.currentScript ? document.currentScript.src : location.href).href;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:16px;top:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      a{ --g:rgba(255,255,255,.14);
         display:inline-flex;align-items:center;gap:10px;padding:9px 16px 9px 10px;border-radius:999px;
         font:600 13px/1 system-ui,"Segoe UI",sans-serif;letter-spacing:.02em;color:#fff;text-decoration:none;
         background:linear-gradient(135deg,rgba(255,255,255,.26),rgba(255,255,255,.08));
         border:1px solid rgba(255,255,255,.45);
         backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);
         box-shadow:0 6px 24px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -8px 14px rgba(255,255,255,.05);
         text-shadow:0 1px 2px rgba(0,0,0,.35);
         opacity:1;transform:translateY(0);cursor:pointer;
         transition:opacity .45s ease,transform .45s ease,box-shadow .25s ease,background .25s ease;
         position:relative;overflow:hidden;user-select:none }
      a.hide{opacity:0;transform:translateY(-8px);pointer-events:none}
      a::after{content:"";position:absolute;inset:0;border-radius:inherit;
         background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);
         transform:translateX(-120%);transition:transform .7s ease}
      a:hover{background:linear-gradient(135deg,rgba(255,255,255,.36),rgba(255,255,255,.12));
         box-shadow:0 10px 30px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.7)}
      a:hover::after{transform:translateX(120%)}
      a:active{transform:scale(.97)}
      .ic{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
         background:rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.6);
         transition:transform .25s ease}
      a:hover .ic{transform:translateX(-3px)}
      svg{width:14px;height:14px;stroke:#fff;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
      kbd{font:600 10px/1 ui-monospace,Consolas,monospace;opacity:.7;padding:3px 5px;border-radius:5px;
          border:1px solid rgba(255,255,255,.4);margin-left:2px}
      @media (max-width:520px){kbd{display:none}}
    </style>
    <a href="${HREF}" title="Visual Library'ye dön (Esc)">
      <span class="ic"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></span>
      <span>Library</span><kbd>Esc</kbd>
    </a>`;
  const a = root.querySelector('a');
  const mount = () => document.body.appendChild(host);
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);

  let timer;
  const show = () => { a.classList.remove('hide'); clearTimeout(timer); timer = setTimeout(() => { if (!a.matches(':hover')) a.classList.add('hide'); }, 2800); };
  ['mousemove', 'pointerdown', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, show, { passive: true }));
  addEventListener('keydown', e => { if (e.key === 'Escape') location.href = HREF; });
  show();
})();
