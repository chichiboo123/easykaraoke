import test from 'node:test';
import assert from 'node:assert/strict';
// V1 테스트는 구현을 import하지 않고 복사해 둬서, 실제 코드가 깨져도 통과했다.
// V2는 컴파일된 실제 모듈을 그대로 검사한다.
import { parseLyrics, segmentKorean, mergeBlocks, distribute } from '../lib/lyrics.js';
import { segmentProgress, blockAt } from '../lib/frame.js';
import { newProject, migrate } from '../types.js';

const roles = [{ id: 'all', name: '전체', color: '#ffd43b' }];

test('공백과 구두점은 타이밍 단위가 되지 않는다', () => {
  assert.deepEqual(segmentKorean('우리 함께 문을 열어!').map((s) => s.text), ['우', '리', '함', '께', '문', '을', '열', '어!']);
});

test('음절이 원문 오프셋을 보존한다 — 하이라이트 정렬의 근거', () => {
  const text = '우리 함께 문을 열어';
  const segs = segmentKorean(text);
  // 각 음절의 charStart/charEnd로 원문을 잘라내면 그 음절 자신이 나와야 한다.
  for (const s of segs) assert.equal(text.slice(s.charStart, s.charEnd), s.text);
  // 공백이 3개이므로 마지막 음절의 오프셋은 인덱스보다 3만큼 크다.
  assert.equal(segs.at(-1).charStart, text.length - 1);
});

test('앞에 붙은 구두점도 원문 오프셋에 포함된다', () => {
  const segs = segmentKorean('“가자!”');
  assert.deepEqual(segs.map((s) => s.text), ['“가', '자!”']);
  assert.equal(segs[0].charStart, 0);
});

test('일반 모드는 배역 표기를 가사로 취급한다', () => {
  const r = parseLyrics('[왜] 여기 있어', roles);
  assert.equal(r.blocks[0].text, '[왜] 여기 있어');
  assert.equal(r.roles.length, 1);
});

test('뮤지컬 모드는 배역을 만들어 배정한다', () => {
  const r = parseLyrics('[왜] 여기 있어', roles, true);
  assert.equal(r.blocks[0].text, '여기 있어');
  assert.equal(r.roles.find((x) => x.name === '왜')?.id, r.blocks[0].roleId);
});

test('자동 분배는 블록 구간을 빈틈없이 채운다 — V1의 0.35초 고정 결함 대응', () => {
  const block = { id: 'b', text: '사랑해', roleId: 'all', start: 10, end: 12, segments: segmentKorean('사랑해') };
  distribute(block);
  assert.equal(block.segments[0].start, 10);
  assert.equal(block.segments.at(-1).end, 12);
  // 음절 사이에 틈이 없어야 한다. V1은 각 음절이 0.35초만 차고 멈췄다.
  for (let i = 1; i < block.segments.length; i++) {
    assert.equal(block.segments[i].start, block.segments[i - 1].end);
  }
  // 2초짜리 음이 끝날 때 진행률은 1이어야 한다.
  assert.equal(segmentProgress(block.segments.at(-1), 12), 1);
});

test('받침 있는 음절이 조금 더 길게 배분된다', () => {
  const block = { id: 'b', text: '강가', roleId: 'all', start: 0, end: 2, segments: segmentKorean('강가') };
  distribute(block);
  const first = block.segments[0].end - block.segments[0].start;
  const second = block.segments[1].end - block.segments[1].start;
  assert.ok(first > second, '받침이 있는 "강"이 "가"보다 길어야 한다');
});

test('가사를 다시 적용해도 같은 줄의 타이밍은 살아남는다', () => {
  const first = parseLyrics('첫 줄\n둘째 줄', roles);
  first.blocks[0].start = 1;
  first.blocks[0].end = 3;
  first.blocks[1].start = 3;
  first.blocks[1].end = 5;
  const again = parseLyrics('첫 줄\n바뀐 줄', roles);
  const merged = mergeBlocks(first.blocks, again.blocks);
  assert.equal(merged.kept, 1);
  assert.equal(merged.lost, 1);
  assert.equal(merged.blocks[0].start, 1, '바뀌지 않은 줄은 타이밍을 지킨다');
  assert.equal(merged.blocks[1].start, 0, '바뀐 줄만 다시 찍는다');
});

test('타이밍이 없으면 미리보기가 첫 줄을 보여준다 — V1은 마지막 줄이었다', () => {
  const p = newProject('t');
  p.blocks = parseLyrics('첫 줄\n둘째 줄\n셋째 줄', roles).blocks;
  assert.equal(blockAt(p, 0).index, 0);
});

test('V1 프로젝트가 블록 구간과 음절 오프셋을 갖춘 V2로 올라온다', () => {
  const v1 = {
    version: 1,
    id: 'old',
    meta: { title: '옛 노래' },
    lyricBlocks: [{ id: 'b1', text: '우리 함께', roleId: 'all', segments: [
      { id: 's1', text: '우', start: 1, end: 1.35 },
      { id: 's2', text: '리', start: 1.4, end: 1.75 },
      { id: 's3', text: '함', start: 1.8, end: 2.15 },
      { id: 's4', text: '께', start: 2.2, end: 2.55 },
    ] }],
  };
  const p = migrate(v1);
  assert.equal(p.version, 2);
  assert.equal(p.blocks[0].start, 1);
  assert.equal(p.blocks[0].end, 2.55);
  // "함"은 원문에서 공백 뒤 3번째 글자다.
  assert.equal(p.blocks[0].segments[2].charStart, 3);
  assert.equal(p.blocks[0].text.slice(p.blocks[0].segments[2].charStart, p.blocks[0].segments[2].charEnd), '함');
});
