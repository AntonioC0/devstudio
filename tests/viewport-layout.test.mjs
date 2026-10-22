import {test} from 'node:test';
import assert from 'node:assert/strict';
import {viewportLayout} from '../client/viewport-layout.js';

test('preview emulates device breakpoints even when the workspace canvas is narrow',()=>{
  const layouts=['desktop','tablet','mobile'].map(device=>viewportLayout(300,500,device));
  assert.deepEqual(layouts.map(l=>l.width),[1280,768,390]);
  for(const layout of layouts){
    assert.ok(layout.scale>0&&layout.scale<=1);
    assert.ok(layout.stageWidth<=300);
    assert.ok(Math.abs(layout.stageHeight-500)<0.00001);
  }
});

test('wide canvas does not stretch mobile viewport and resize preserves its CSS width',()=>{
  const small=viewportLayout(240,400,'mobile'),wide=viewportLayout(1600,800,'mobile');
  assert.equal(small.width,wide.width);assert.equal(wide.width,390);
  assert.equal(wide.scale,1);assert.equal(wide.stageWidth,390);
  assert.ok(small.height>wide.height/2);
});

test('hidden panes and transient invalid measurements cannot create non-finite geometry',()=>{
  for(const width of [0,-1,NaN,Infinity])for(const height of [0,-1,NaN,Infinity]){
    const layout=viewportLayout(width,height,'unknown');
    for(const number of Object.values(layout))assert.ok(Number.isFinite(number)&&number>0);
  }
});
