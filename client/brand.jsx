import React from 'react';

export function Logo({small=false,iconOnly=false}){
  return <span className={'brand-lockup '+(small?'brand-small ':'')+(iconOnly?'brand-icon-only':'')} role="img" aria-label={iconOnly?'Dev Studio':'Dev Studio — Seu workspace de desenvolvimento'}><img className="brand-emblem" src="/assets/dev-studio-mark.png" width="42" height="42" alt="" decoding="async"/>{!iconOnly&&<span className="brand-wordmark"><span className="brand-name">Dev <strong>Studio</strong></span><small>Seu workspace de desenvolvimento</small></span>}</span>;
}
