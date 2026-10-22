export function previewDocument(files){
  const nonce=document.querySelector('meta[name="csp-nonce"]')?.content||'';
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
