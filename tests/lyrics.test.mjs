import test from'node:test';import assert from'node:assert/strict';
// Keep this contract mirrored with src/lib/lyrics.ts; browser Intl.Segmenter is the implementation.
function segment(text){const p=/^[\p{P}\p{S}]+$/u,out=[];let prefix='';for(const x of new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text)){const c=x.segment;if(/^\s+$/u.test(c))continue;if(p.test(c)){if(out.length)out[out.length-1]+=c;else prefix+=c}else{out.push(prefix+c);prefix=''}}return out}
test('Korean spaces and punctuation are not standalone timing units',()=>assert.deepEqual(segment('우리 함께 문을 열어!'),['우','리','함','께','문','을','열','어!']));
test('punctuation never becomes a standalone timing unit',()=>assert.deepEqual(segment('“가자!”'),['“가','자!”']));
