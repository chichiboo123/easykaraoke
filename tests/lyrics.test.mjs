import test from'node:test';import assert from'node:assert/strict';
import{parseLyrics}from'../lib/lyrics.js';
// Keep this contract mirrored with src/lib/lyrics.ts; browser Intl.Segmenter is the implementation.
function segment(text){const p=/^[\p{P}\p{S}]+$/u,out=[];let prefix='';for(const x of new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text)){const c=x.segment;if(/^\s+$/u.test(c))continue;if(p.test(c)){if(out.length)out[out.length-1]+=c;else prefix+=c}else{out.push(prefix+c);prefix=''}}return out}
test('Korean spaces and punctuation are not standalone timing units',()=>assert.deepEqual(segment('우리 함께 문을 열어!'),['우','리','함','께','문','을','열','어!']));
test('punctuation never becomes a standalone timing unit',()=>assert.deepEqual(segment('“가자!”'),['“가','자!”']));
const roles=[{id:'all',name:'전체',color:'#ffd43b'}];
test('plain mode treats role prefixes as lyrics and uses the fallback role',()=>{const result=parseLyrics('[왜] 여기 있어',roles);assert.equal(result.blocks[0].text,'[왜] 여기 있어');assert.equal(result.blocks[0].roleId,'all');assert.equal(result.roles.length,1)});
test('musical mode creates and assigns an explicitly entered role',()=>{const result=parseLyrics('[왜] 여기 있어',roles,true);assert.equal(result.blocks[0].text,'여기 있어');assert.equal(result.roles.find(role=>role.name==='왜')?.id,result.blocks[0].roleId)});
