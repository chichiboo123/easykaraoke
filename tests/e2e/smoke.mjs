/**
 * 브라우저 스모크 테스트.
 *
 * 단위 테스트(tests/lyrics.test.mjs)는 가사 분리와 타이밍 계산 같은 순수 로직만 덮는다.
 * 그런데 이 앱에서 실제로 깨지는 곳은 UI 배선과 Canvas 렌더링이다.
 * 아래 검사들은 모두 개발 중 실제로 발생했던 버그를 재발 방지용으로 고정한 것이다.
 *
 * 외부 CDN은 전부 차단하고 돌린다. 그래야 결과가 네트워크에 흔들리지 않고,
 * 동시에 "학교 방화벽에서 CDN이 막힌 상황"이라는 가장 중요한 실패 경로를 검사하게 된다.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../../dist/', import.meta.url).pathname;
/** CDN 응답을 이만큼 붙잡아 둔다. 렌더링 차단이면 첫 화면이 이만큼 늦어진다. */
const CDN_STALL_MS = 8000;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.otf': 'font/otf', '.woff2': 'font/woff2', '.json': 'application/json' };

let server;
let browser;
let page;
let origin;
const pageErrors = [];

before(async () => {
  server = createServer(async (req, res) => {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(DIST, rel === '/' ? 'index.html' : rel);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  origin = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 940 } });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|ERR_|404/.test(t)) pageErrors.push(t);
  });
  // 외부 CDN을 "즉시 거부"가 아니라 "아주 느림"으로 흉내낸다.
  // 테스트를 네트워크로부터 독립시키면서, 동시에 학교 방화벽에서 실제로 일어나는
  // 느린 CDN 상황을 재현한다. 글꼴 <link>가 렌더링 차단이면 여기서 바로 드러난다.
  for (const pattern of ['**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**', '**://cdn.jsdelivr.net/**']) {
    await page.route(pattern, async (route) => {
      await new Promise((ok) => setTimeout(ok, CDN_STALL_MS));
      await route.abort().catch(() => undefined);
    });
  }
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** 재생 가능한 무음에 가까운 WAV를 페이지 안에서 만들어 파일 입력에 넣는다. */
async function attachAudio(seconds = 10) {
  await page.evaluate((secs) => {
    const sr = 44100;
    const n = sr * secs;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 26) * 9000, true);
    const dt = new DataTransfer();
    dt.items.add(new File([buf], 'fixture.wav', { type: 'audio/wav' }));
    const input = document.querySelector('.dropzone input[type=file]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, seconds);
  await page.waitForTimeout(1200);
}

test('CDN이 막혀도 앱이 즉시 뜬다 (글꼴 스타일시트가 렌더링을 막지 않는다)', async () => {
  const started = Date.now();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('.hero h1').waitFor({ timeout: 20_000 });
  const elapsed = Date.now() - started;
  // CDN을 8초 붙잡아 뒀으므로, 글꼴 <link>가 렌더링 차단이면 여기서 훨씬 오래 걸린다.
  assert.ok(elapsed < 3000, `첫 화면이 ${elapsed}ms 걸림 — 글꼴 <link>가 렌더링을 막고 있다 (media="print" + onload 확인)`);
  assert.equal(await page.locator('.boot-error').count(), 0, '부팅 오류 화면이 뜨면 안 된다');
});

test('아이콘 폰트가 없어도 "play_arrow" 같은 리거처 원문이 노출되지 않는다', async () => {
  const body = await page.locator('body').innerText();
  for (const literal of ['play_arrow', 'graphic_eq', 'library_music', 'auto_stories']) {
    assert.ok(!body.includes(literal), `아이콘 리거처 원문 "${literal}"이 화면에 그대로 보인다`);
  }
});

test('반주와 가사를 넣고 타이밍 화면까지 간다', async () => {
  await page.getByRole('button', { name: /새 노래 만들기/ }).click();
  await page.locator('input[name=title]').fill('스모크 테스트');
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.locator('#lyrics-input').waitFor();
  await page.locator('#lyrics-input').fill('우리 함께 문을 열어\n세상 밖으로 나가요\n노래해요 다같이');
  await page.getByRole('button', { name: /가사 블록 만들기/ }).click();
  await page.waitForTimeout(300);
  await attachAudio();
  await page.getByRole('button', { name: /타이밍 만들기/ }).click();
  await page.locator('.cue-text').waitFor();
  assert.equal(await page.locator('.block-card').count(), 3);
  assert.equal(await page.locator('.cue-text').innerText(), '우리 함께 문을 열어');
});

test('멈춰 있을 때의 Space는 재생 시작이지 스탬프가 아니다', async () => {
  await page.locator('.side-head h2').click();
  // 오디오 엘리먼트는 new Audio()로 만들어져 DOM에 없다.
  // 사용자에게 보이는 신호인 트랜스포트 시계가 흐르는지로 판정한다.
  const clockBefore = await page.locator('.transport-clock').innerText();
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  const clockAfter = await page.locator('.transport-clock').innerText();
  assert.notEqual(clockAfter, clockBefore, `Space가 재생을 시작해야 한다 (시계가 ${clockBefore}에서 멈춰 있음)`);
  // 아직 아무 줄도 찍히지 않았어야 한다. (정지 상태 연타로 모든 줄이 00:00에 찍히던 버그)
  const times = await page.locator('.block-time').allInnerTexts();
  assert.ok(times.every((t) => t.includes('아직')), `정지 중 Space가 타이밍을 기록했다: ${JSON.stringify(times)}`);
});

test('찍은 줄의 끝이 다음 줄의 시작과 정확히 맞물린다 (음절 0.35초 고정 회귀 방지)', async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
  }
  const blocks = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.block-card')];
    return cards.map((c) => c.querySelector('.block-time').innerText);
  });
  assert.ok(blocks.every((t) => !t.includes('아직')), `모든 줄이 찍혀야 한다: ${JSON.stringify(blocks)}`);

  // 앞 줄의 끝 === 다음 줄의 시작
  const bounds = blocks.map((t) => t.match(/(\d+:\d+\.\d+)/g));
  for (let i = 0; i + 1 < bounds.length; i++) {
    assert.equal(bounds[i][1], bounds[i + 1][0], `${i + 1}번 줄의 끝과 ${i + 2}번 줄의 시작이 어긋났다`);
  }
});

test('미리보기 캔버스가 실제로 가사를 그린다', async () => {
  const colors = await page.locator('.preview').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 400) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return seen.size;
  });
  // 배경 그라디언트만이면 색 수가 적다. 글자와 하이라이트가 있어야 충분히 다양해진다.
  assert.ok(colors > 30, `미리보기 캔버스가 거의 비어 있다 (색 ${colors}종)`);
});

test('가사 블록을 추가·이동·삭제할 수 있다', async () => {
  const cards = page.locator('.block-card');
  const before = await cards.count();

  await page.locator('.side-tools .btn', { hasText: '줄 추가' }).click();
  await page.waitForTimeout(200);
  assert.equal(await cards.count(), before + 1, '줄이 추가되지 않았다');

  // 순서 바꾸기 — 1번과 2번 가사가 서로 자리를 바꿔야 한다
  const firstText = await cards.nth(0).locator('.block-text').inputValue();
  const secondText = await cards.nth(1).locator('.block-text').inputValue();
  await cards.nth(1).locator('.btn[aria-label="위로 옮기기"]').click();
  await page.waitForTimeout(200);
  assert.equal(await cards.nth(0).locator('.block-text').inputValue(), secondText, '위로 옮기기가 안 먹었다');
  assert.equal(await cards.nth(1).locator('.block-text').inputValue(), firstText);

  // 삭제 — 확인 대화상자를 거친다
  const target = await cards.nth(0).locator('.block-text').inputValue();
  await cards.nth(0).locator('.btn[aria-label="이 줄 지우기"]').click();
  await page.locator('.dialog .btn-danger').click();
  await page.waitForTimeout(250);
  assert.equal(await cards.count(), before, '삭제되지 않았다');
  assert.notEqual(await cards.nth(0).locator('.block-text').inputValue(), target);
});

test('빈 구간에 간주를 넣으면 블록 목록에 간주 카드가 생긴다', async () => {
  // 마지막 가사 뒤의 확실한 빈 구간으로 재생 위치를 옮긴다.
  await page.evaluate(async () => {
    const { audio } = await import('./lib/audio.js');
    audio.pause();
    audio.currentTime = 7.5;
  });
  await page.waitForTimeout(200);
  await page.locator('.side-tools .btn', { hasText: '간주 넣기' }).click();
  await page.waitForTimeout(300);
  const interludes = await page.locator('.block-card.is-interlude').count();
  assert.ok(interludes >= 1, '간주 블록이 만들어지지 않았다');
  assert.equal(await page.locator('.block-card.is-interlude .block-text').first().inputValue(), '간주중');
});

test('전주 화면에 곡 정보 카드가 실제로 그려진다', async () => {
  // 첫 가사가 카운트다운 길이(4초)만큼만 뒤에 있는, 아주 흔한 곡을 재현한다.
  // 예전에는 이 경우 카드가 뜰 시간이 없어 곡 정보가 통째로 사라졌다.
  const diff = await page.evaluate(async () => {
    const { newProject } = await import('./types.js');
    const { parseLyrics, distribute } = await import('./lib/lyrics.js');
    const { renderFrame } = await import('./lib/renderer.js');

    const make = (withMeta) => {
      const p = newProject('웃고 있지만');
      if (withMeta) Object.assign(p.meta, { artist: 'SG워너비', lyricist: '안영민', composer: '조영수', musical: '우리들의 봄' });
      p.blocks = parseLyrics('첫 줄이야', p.roles).blocks;
      p.blocks[0].start = 4; p.blocks[0].end = 7;
      distribute(p.blocks[0]);
      p.media.duration = 60;
      return p;
    };
    const shot = (p) => {
      const c = document.createElement('canvas');
      c.width = 480; c.height = 270;
      const ctx = c.getContext('2d');
      ctx.setTransform(480 / 1920, 0, 0, 270 / 1080, 0, 0);
      renderFrame(ctx, p, 1.5, undefined); // 전주 한가운데
      return ctx.getImageData(0, 0, 480, 270).data;
    };

    const withMeta = shot(make(true));
    const without = shot(make(false));
    let changed = 0;
    for (let i = 0; i < withMeta.length; i += 4) {
      if (Math.abs(withMeta[i] - without[i]) > 10) changed++;
    }
    return changed;
  });
  // 카드가 그려지면 제목·가수·작사·작곡만큼 픽셀이 달라진다.
  assert.ok(diff > 400, `전주 화면에 곡 정보가 그려지지 않았다 (다른 픽셀 ${diff}개)`);
});

test('타임라인을 확대·축소하고 좌우로 이동할 수 있다', async () => {
  const span = () => page.locator('.zoom-out').innerText();
  const before = await span();
  await page.locator('.btn[aria-label="확대"]').click();
  await page.waitForTimeout(200);
  assert.notEqual(await span(), before, '확대해도 보이는 길이가 그대로다');

  await page.getByRole('button', { name: '전체 보기' }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.timeline-scroll').isEnabled(), false, '전체가 보이면 스크롤이 필요 없다');

  for (let i = 0; i < 3; i++) await page.locator('.btn[aria-label="확대"]').click();
  await page.waitForTimeout(250);
  const bar = page.locator('.timeline-scroll');
  assert.equal(await bar.isEnabled(), true, '확대했으면 좌우로 이동할 수 있어야 한다');
  await bar.fill('800');
  await page.waitForTimeout(250);
  assert.equal(await bar.inputValue(), '800', '스크롤 위치가 유지되지 않는다');
});

test('글자 단위 편집 모드에서 줄 안의 글자 간격을 조정할 수 있다', async () => {
  await page.locator('.block-card').first().click();
  await page.locator('#fine-mode').check();
  await page.waitForTimeout(300);

  const chips = page.locator('.fine-chip');
  assert.ok((await chips.count()) > 1, '글자 칩이 보이지 않는다');

  const block = await page.evaluate(async () => {
    const { state } = await import('./lib/store.js');
    const b = state.project.blocks[0];
    return { start: b.start, end: b.end, first: b.segments[0].end - b.segments[0].start };
  });

  // 재생 중 Space 한 번 = 다음 글자의 시작을 지금 위치로
  await page.evaluate(async (t) => {
    const { audio } = await import('./lib/audio.js');
    audio.currentTime = t;
    await audio.play();
  }, block.start + 0.5);
  await page.locator('.side-head h2').click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);

  const after = await page.evaluate(async () => {
    const { state } = await import('./lib/store.js');
    const b = state.project.blocks[0];
    return {
      start: b.start,
      end: b.end,
      first: b.segments[0].end - b.segments[0].start,
      contiguous: b.segments.every((s, i) => i === 0 || Math.abs(s.start - b.segments[i - 1].end) < 1e-6),
    };
  });
  assert.notEqual(after.first.toFixed(3), block.first.toFixed(3), '글자 길이가 바뀌지 않았다');
  // 핵심: 줄 단위로 잡아 둔 박자는 그대로여야 한다
  assert.equal(after.start, block.start, '줄 시작이 바뀌었다');
  assert.equal(after.end, block.end, '줄 끝이 바뀌었다');
  assert.equal(after.contiguous, true, '글자 사이에 틈이 생겼다');

  await page.evaluate(async () => { const { audio } = await import('./lib/audio.js'); audio.pause(); });
  await page.locator('#fine-mode').uncheck();
  await page.waitForTimeout(200);
});

test('편집 화면은 페이지가 스크롤되지 않는다 (미리보기가 아래 내용을 가리는 것 방지)', async () => {
  const scrolls = await page.evaluate(() => {
    window.scrollTo(0, 5000);
    const y = window.scrollY;
    window.scrollTo(0, 0);
    return y;
  });
  assert.equal(scrolls, 0, '편집 화면에서 문서가 스크롤됐다 — 미리보기가 아래 내용을 가릴 수 있다');
});

test('내보내기 진행 상자는 시작 전에는 보이지 않는다', async () => {
  await page.getByRole('button', { name: /꾸미고 저장하기/ }).click();
  await page.locator('.export-progress').waitFor({ state: 'attached' });
  assert.equal(await page.locator('.export-progress').isVisible(), false, 'hidden 속성이 클래스 규칙에 지고 있다');
});

test('설정 패널을 끝까지 내려도 미리보기가 가리지 않는다', async () => {
  const side = page.locator('.editor-side');
  await side.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  const overlapping = await page.evaluate(() => {
    const stage = document.querySelector('.editor-stage')?.getBoundingClientRect();
    if (!stage) return -1;
    return [...document.querySelectorAll('.editor-side .panel')].filter((n) => {
      const r = n.getBoundingClientRect();
      return r.left < stage.right && r.right > stage.left && r.top < stage.bottom && r.bottom > stage.top;
    }).length;
  });
  assert.equal(overlapping, 0, '미리보기 영역과 설정 패널이 겹친다');
});

test('미리보기 캔버스가 16:9를 유지하고 무대 크기에 맞게 커진다', async () => {
  const info = await page.locator('.editor-stage .preview').evaluate((c) => {
    const stage = c.closest('.stage').getBoundingClientRect();
    // object-fit: contain 기준으로 실제 그려지는 영역을 계산한다.
    const scale = Math.min(stage.width / c.width, stage.height / c.height);
    return { bmpW: c.width, bmpH: c.height, shownW: c.width * scale, shownH: c.height * scale, stageW: stage.width, stageH: stage.height };
  });
  // 비트맵이 16:9가 아니면 렌더러 좌표계와 어긋나 그림이 찌그러진다.
  assert.ok(Math.abs(info.bmpW / info.bmpH - 16 / 9) < 0.02, `비트맵 비율이 16:9가 아니다 (${info.bmpW}×${info.bmpH})`);
  // width/height를 auto로 두면 캔버스 고유 크기와 순환 참조가 생겨 작게 굳는다.
  assert.ok(info.bmpW >= 640, `미리보기 비트맵이 너무 작다 (${info.bmpW}px) — 캔버스 크기 계산이 굳었을 수 있다`);
  const fill = Math.max(info.shownW / info.stageW, info.shownH / info.stageH);
  assert.ok(fill > 0.95, `미리보기가 무대를 못 채운다 (${(fill * 100).toFixed(0)}%)`);
});

test('꾸미기 설정이 탭으로 나뉘어 한 번에 하나만 보인다', async () => {
  const tabs = page.locator('.tab-bar .tab');
  assert.equal(await tabs.count(), 4, '무대 · 글자 · 배경 · 저장 네 개의 탭이 있어야 한다');
  const visibleBodies = await page.locator('.tab-body > *:not([hidden])').count();
  assert.equal(visibleBodies, 1, `한 번에 하나만 보여야 하는데 ${visibleBodies}개가 보인다`);
});

test('무대 씬을 고르면 미리보기가 그 씬으로 바뀐다', async () => {
  const thumbs = page.locator('.thumb');
  assert.ok((await thumbs.count()) >= 12, '무대 씬이 12종 이상이어야 한다');
  const before = await page.locator('.editor-stage .preview').evaluate((c) => c.toDataURL().length);
  await thumbs.filter({ hasText: '네온 시티' }).click();
  await page.waitForTimeout(500);
  const after = await page.locator('.editor-stage .preview').evaluate((c) => c.toDataURL().length);
  assert.notEqual(after, before, '씬을 바꿔도 미리보기가 그대로다');
  assert.equal(await thumbs.filter({ hasText: '네온 시티' }).getAttribute('class'), 'thumb is-chosen');
});

test('불러오지 못한 CDN 글꼴은 비활성 처리되고, 남은 글꼴로 계속 만들 수 있다', async () => {
  await page.locator('.tab-bar .tab', { hasText: '글자' }).click();
  await page.locator('.font-card').first().waitFor();
  await page.waitForTimeout(600);
  const total = await page.locator('.font-card').count();
  const enabled = await page.locator('.font-card:not([disabled])').count();
  assert.ok(total >= 6, `글꼴 카드가 ${total}개뿐이다`);
  assert.ok(enabled >= 1, 'CDN이 막혀도 쓸 수 있는 글꼴이 최소 하나는 남아야 한다');
  assert.ok(enabled < total, 'CDN이 막혔는데 모든 글꼴이 사용 가능으로 표시됐다');
  const badges = await page.locator('.font-card .badge').allInnerTexts();
  assert.ok(badges.length > 0 && badges.every((b) => b === '못 불러옴'), `배지가 잘못됐다: ${JSON.stringify(badges)}`);
});

test('저장소에 포함된 TJ 글꼴은 CDN과 무관하게 캔버스에 적용된다', async () => {
  const applied = await page.evaluate(async () => {
    await document.fonts.load('700 96px "TJ Joy"', '우리 함께');
    const c = document.createElement('canvas').getContext('2d');
    c.font = '700 96px "TJ Joy"';
    const tj = c.measureText('우리 함께 문을 열어').width;
    c.font = '700 96px "존재하지않는글꼴"';
    const fallback = c.measureText('우리 함께 문을 열어').width;
    return Math.abs(tj - fallback) > 1;
  });
  assert.ok(applied, 'TJ 글꼴이 폴백으로 대체되고 있다');
});

test('무대 썸네일을 실제 렌더러로 그린다 (CSS 하드코딩 색 불일치 방지)', async () => {
  await page.locator('.tab-bar .tab', { hasText: '무대' }).click();
  await page.waitForTimeout(300);
  const colors = await page.locator('.thumb-canvas').first().evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 200) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return seen.size;
  });
  assert.ok(colors > 20, `썸네일이 비어 있다 (색 ${colors}종)`);
});

test('저장 탭에 프로젝트 파일 저장 버튼이 있다', async () => {
  await page.locator('.tab-bar .tab', { hasText: '저장' }).click();
  await page.waitForTimeout(300);
  const save = page.locator('.save-project .btn');
  assert.equal(await save.count(), 1, '작업 파일 저장 버튼이 없다');
  assert.ok((await save.innerText()).includes('작업 파일 저장'));
});

test('내보낸 MP4는 길이를 알 수 있고 진행바를 끌 수 있다', async () => {
  // 실제로 짧은 영상을 만들어 <video>에 물려 본다.
  // MediaRecorder 원본에는 총 길이도 조각 색인도 없어 탐색이 안 됐다.
  const info = await page.evaluate(async () => {
    const { newProject } = await import('./types.js');
    const { parseLyrics, distribute } = await import('./lib/lyrics.js');
    const { exportVideo, exportSupport } = await import('./lib/exporter.js');
    const { setSource } = await import('./lib/audio.js');
    if (!exportSupport().supported) return { skipped: true };

    const p = newProject('탐색 시험');
    p.blocks = parseLyrics('첫 줄이야\n둘째 줄이야', p.roles).blocks;
    p.blocks[0].start = 0.5; p.blocks[0].end = 2; distribute(p.blocks[0]);
    p.blocks[1].start = 2; p.blocks[1].end = 3.5; distribute(p.blocks[1]);

    const sr = 44100, n = sr * 5;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVEfmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true);
    v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
    for (let i = 0; i < n; i++) v.setInt16(44+i*2, Math.sin(i/26)*9000, true);
    p.media.duration = await setSource(new Blob([buf], { type: 'audio/wav' }));

    const blob = await exportVideo({
      project: p, height: 720, monitor: false,
      signal: new AbortController().signal, onProgress: () => {},
    });

    const video = document.createElement('video');
    video.src = URL.createObjectURL(blob);
    video.muted = true;
    await new Promise((ok) => { video.onloadedmetadata = ok; setTimeout(ok, 6000); });
    const target = 3;
    const seeked = await new Promise((ok) => {
      video.onseeked = () => ok(true);
      video.currentTime = target;
      setTimeout(() => ok(false), 5000);
    });
    // 파일 구조를 직접 확인한다. 크롬은 색인이 없어도 알아서 탐색하므로
    // 재생 테스트만으로는 헤더가 비어 있는 것을 잡아내지 못한다.
    // 다른 플레이어에서 진행바가 안 움직이던 원인이 바로 이 헤더다.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(bytes.buffer);
    const ascii = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    let mvhdDuration = 0;
    let hasMfra = false;
    for (let i = 0; i + 8 < bytes.length; i++) {
      if (ascii(i) === 'mvhd' && !mvhdDuration) {
        const ver = bytes[i + 4];
        mvhdDuration = ver === 0
          ? dv.getUint32(i + 20) / dv.getUint32(i + 16)
          : Number(dv.getBigUint64(i + 28)) / dv.getUint32(i + 24);
      }
      if (ascii(i) === 'mfra') hasMfra = true;
    }

    return {
      type: blob.type,
      duration: video.duration,
      seekable: video.seekable.length ? video.seekable.end(0) : 0,
      seeked,
      landedAt: video.currentTime,
      mvhdDuration,
      hasMfra,
    };
  });

  if (info.skipped) return; // 녹화를 지원하지 않는 환경
  assert.ok(Number.isFinite(info.duration) && info.duration > 3, `길이를 알 수 없다 (${info.duration})`);
  assert.ok(info.seekable > 3, `탐색 가능 구간이 없다 (${info.seekable})`);
  assert.equal(info.seeked, true, '진행바 이동이 동작하지 않는다');
  assert.ok(Math.abs(info.landedAt - 3) < 0.6, `엉뚱한 지점으로 이동했다 (${info.landedAt})`);

  if (info.type.includes('mp4')) {
    // MediaRecorder 원본은 mvhd.duration = 0 이고 mfra 가 없다.
    assert.ok(info.mvhdDuration > 3, `파일에 총 길이가 적혀 있지 않다 (mvhd duration ${info.mvhdDuration}초)`);
    assert.equal(info.hasMfra, true, '조각 색인(mfra)이 없어 다른 플레이어에서 탐색이 안 된다');
  }
});

test('전체 과정에서 자바스크립트 오류가 없었다', () => {
  assert.deepEqual(pageErrors, []);
});
