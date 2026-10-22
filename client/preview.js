import {BACKEND_BRIDGE_SOURCE} from './backend-bridge.js';
export function previewDocument(files,compiled){
  const nonce=document.querySelector('meta[name="csp-nonce"]')?.content||'';
  if(compiled?.kind==='react'){
    const policy=`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`;
    const css=compiled.css.replace(/<\/style/gi,'<\\/style'),script=compiled.javascript.replace(/<\/script/gi,'<\\/script');
    return `<!doctype html><html lang="pt-BR"><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia React</title><style>${css}</style></head><body><div id="root"></div><script nonce="${nonce}">${BACKEND_BRIDGE_SOURCE.replace('__CHANNEL__',crypto.randomUUID())}window.addEventListener('error',function(event){const root=document.getElementById('root');root.replaceChildren();const text=document.createElement('pre');text.style.cssText='padding:24px;white-space:pre-wrap;color:#8a2a25;font:14px system-ui';text.textContent='A interface encontrou um erro: '+event.message;root.appendChild(text);});</script><script nonce="${nonce}">${script}</script></body></html>`;
  }
  if(files.some(file=>/^src\/.*\.[jt]sx$/.test(file.path)))return '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:14px system-ui;padding:32px;color:#61705e">Preparando a prévia React…</body></html>';
  const map=new Map(files.map(f=>[f.path,f.content]));
  let html=map.get('index.html')||'<!doctype html><html><body><p>Crie um arquivo index.html para visualizar seu projeto.</p></body></html>';
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('base,meta[http-equiv]').forEach(node=>node.remove());
  for(const link of doc.querySelectorAll('link[rel="stylesheet"]')){
    const href=(link.getAttribute('href')||'').replace(/^\.\//,'');
    if(map.has(href)){const style=doc.createElement('style');style.textContent=map.get(href);link.replaceWith(style);}
  }
  for(const original of doc.querySelectorAll('script[src]')){
    const src=(original.getAttribute('src')||'').replace(/^\.\//,'');
    if(map.has(src)){const script=doc.createElement('script');script.textContent=map.get(src).replace(/<\/script/gi,'<\\/script');original.replaceWith(script);}
    else original.remove();
  }
  for(const script of doc.querySelectorAll('script'))script.setAttribute('nonce',nonce);
  // This policy is inserted before all generated content and cannot be relaxed by it.
  const policy=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  return '<!doctype html>'+doc.documentElement.outerHTML.replace(/<head[^>]*>/i,match=>match+policy);
}
