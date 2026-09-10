import type { KaraokeProject, LyricBlock } from '../types.js';
import { blockAt, firstCue, segmentProgress } from './frame.js';
import { drawScrim, finishScene, sceneOf } from './scenes.js';

const W = 1920;
const H = 1080;

function font(size: number, family: string) {
  return `700 ${size}px "${family}", "Noto Sans KR", system-ui, sans-serif`;
}

/** 외곽선 + 채움. 밝은 배경 이미지 위에서도 읽히게 한다. */
function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, fill: string, stroke = 'rgba(0,0,0,.78)') {
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** 최대 폭에 맞을 때까지 글자 크기를 줄인다. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, family: string, min = 44): number {
  let size = start;
  ctx.font = font(size, family);
  while (size > min && ctx.measureText(text).width > max) {
    size -= 2;
    ctx.font = font(size, family);
  }
  return size;
}

/** 한 줄이 너무 길면 공백에서 두 줄로 나눈다. V1은 그냥 화면 밖으로 넘쳤다. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  if (ctx.measureText(text).width <= max) return [text];
  const spaces: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === ' ') spaces.push(i);
  if (!spaces.length) return [text];
  const mid = text.length / 2;
  const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0]);
  return [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}

/**
 * 가사 한 줄과 채우기 하이라이트.
 *
 * V1의 치명적 결함: segmentKorean()이 공백을 버리는데 fillText는 공백 포함 원문을 그려서,
 * 채우기 커서가 공백 폭만큼 계속 왼쪽으로 밀렸다.
 * V2는 음절이 들고 있는 원문 오프셋(charStart/charEnd)으로 위치를 계산하므로 항상 정확히 겹친다.
 */
function drawLyric(ctx: CanvasRenderingContext2D, block: LyricBlock, baseY: number, time: number, color: string, family: string, size: number) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chosen = fit(ctx, block.text, 1680, size, family);
  const lines = wrap(ctx, block.text, 1680);
  const lineHeight = chosen * 1.24;
  const top = baseY - ((lines.length - 1) * lineHeight) / 2;

  let consumed = 0;
  lines.forEach((line, li) => {
    const y = top + li * lineHeight;
    // 이 줄이 원문에서 차지하는 구간. 공백으로 잘랐으므로 원문에서 다시 찾는다.
    const lineStart = block.text.indexOf(line, consumed);
    const from = lineStart < 0 ? consumed : lineStart;
    const to = from + line.length;
    consumed = to;

    ctx.textAlign = 'center';
    outlined(ctx, line, W / 2, y, 14, '#ffffff');

    const left = W / 2 - ctx.measureText(line).width / 2;
    ctx.textAlign = 'left';
    for (const s of block.segments) {
      if (s.charEnd <= from || s.charStart >= to) continue;
      const p = segmentProgress(s, time);
      if (p <= 0) continue;
      // 원문 부분문자열로 재는 것이 핵심. 공백 폭이 자연스럽게 포함된다.
      const x = left + ctx.measureText(block.text.slice(from, s.charStart)).width;
      const w = ctx.measureText(block.text.slice(s.charStart, s.charEnd)).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y - chosen, Math.max(0, w * p), chosen * 2);
      ctx.clip();
      outlined(ctx, block.text.slice(from, to), left, y, 14, color);
      ctx.restore();
    }
    ctx.textAlign = 'center';
  });
}

/** 배역 배지. V1은 220×65 고정이라 긴 배역명이 삐져나왔다. */
function badge(ctx: CanvasRenderingContext2D, name: string, color: string, family: string, y: number) {
  ctx.font = font(34, family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.max(180, ctx.measureText(name).width + 72);
  const h = 68;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(W / 2 - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.fillText(name, W / 2, y + 1);
}

/** 배경 이미지를 종횡비 유지로 채운다(cover). V1은 강제로 늘려 찌그러뜨렸다. */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource) {
  const iw = Number((img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width) || W;
  const ih = Number((img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height) || H;
  const scale = Math.max(W / iw, H / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export function renderFrame(ctx: CanvasRenderingContext2D, p: KaraokeProject, rawTime: number, bg?: CanvasImageSource): void {
  const time = rawTime + p.timing.offset;
  const pal = sceneOf(p.style.preset);
  const family = p.style.fontFamily;
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // 배경 이미지를 넣었으면 그것이 무대를 대신한다. 아니면 절차적 씬을 그린다.
  if (bg) {
    ctx.save();
    // blur는 오프스크린에서 미리 처리된 것을 받는다(exporter/preview가 준비).
    ctx.filter = `brightness(${p.style.brightness}%)`;
    cover(ctx, bg);
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${p.style.darken / 100})`;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.save();
    pal.draw(ctx, time, W, H);
    ctx.restore();
  }
  finishScene(ctx, pal, W, H);
  if (!bg) drawScrim(ctx, pal, W, H);

  // 상단 메타 — V1은 외곽선이 없어 밝은 배경에서 읽히지 않았다.
  ctx.font = font(34, family);
  ctx.textBaseline = 'middle';
  // 밝은 씬에서는 흰 글자에 검은 외곽선이 오히려 안 읽힌다. 명암을 뒤집는다.
  const metaFill = pal.light && !bg ? 'rgba(20,20,30,.92)' : 'rgba(255,255,255,.92)';
  const metaStroke = pal.light && !bg ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.78)';
  const leftMeta = [p.meta.musical, p.meta.number].filter(Boolean).join(' · ');
  if (leftMeta) {
    ctx.textAlign = 'left';
    outlined(ctx, leftMeta, 96, 84, 8, metaFill, metaStroke);
  }
  if (p.meta.title) {
    ctx.textAlign = 'right';
    outlined(ctx, p.meta.title, W - 96, 84, 8, metaFill, metaStroke);
  }

  const first = firstCue(p);
  const hasTiming = p.blocks.some((b) => b.end > b.start);
  const inIntro = hasTiming && time < first;

  if (inIntro) {
    drawIntro(ctx, p, time, first, family, pal.point);
  } else {
    const { block, next } = blockAt(p, time);
    if (block) {
      const role = p.roles.find((r) => r.id === block.roleId);
      const fill = p.musicalMode && p.style.colorMode === 'role' ? role?.color || pal.point : pal.point;
      if (p.musicalMode && role) badge(ctx, role.name, role.color, family, pal.lyricY - 230);
      drawLyric(ctx, block, pal.lyricY, time, fill, family, pal.size);
      if (next) {
        ctx.textAlign = 'center';
        const size = fit(ctx, next.text, 1500, 62, family, 34);
        ctx.font = font(size, family);
        outlined(ctx, wrap(ctx, next.text, 1500)[0], W / 2, pal.lyricY + 200, 10, 'rgba(255,255,255,.8)');
      }
    }
  }

  if (p.style.progress && p.media.duration) {
    ctx.fillStyle = 'rgba(255,255,255,.24)';
    ctx.beginPath();
    ctx.roundRect(96, 1012, W - 192, 10, 5);
    ctx.fill();
    ctx.fillStyle = pal.point;
    ctx.beginPath();
    ctx.roundRect(96, 1012, Math.max(10, (W - 192) * Math.min(1, Math.max(0, time) / p.media.duration)), 10, 5);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 인트로 카드와 카운트다운.
 * V1에서는 마커 편집 UI가 없어 카운트다운 코드에 영원히 도달하지 못했다.
 * V2는 마커 없이 첫 가사 시각에서 자동으로 계산한다.
 */
function drawIntro(ctx: CanvasRenderingContext2D, p: KaraokeProject, time: number, first: number, family: string, point: string) {
  ctx.textAlign = 'center';
  const remain = first - time;
  const showCard = remain > p.intro.seconds || !p.intro.countdown;

  if (showCard) {
    if (p.meta.musical) {
      ctx.font = font(54, family);
      outlined(ctx, p.meta.musical, W / 2, 360, 10, 'rgba(255,255,255,.9)');
    }
    const title = [p.meta.number, p.meta.title].filter(Boolean).join('  ');
    ctx.font = fitFont(ctx, title, 1600, 92, family);
    outlined(ctx, title, W / 2, 500, 14, '#ffffff');
    const credit = [p.meta.composer && `작곡 ${p.meta.composer}`, p.meta.lyricist && `작사 ${p.meta.lyricist}`].filter(Boolean).join('   ');
    if (credit) {
      ctx.font = font(36, family);
      outlined(ctx, credit, W / 2, 600, 8, 'rgba(255,255,255,.85)');
    }
  }

  if (p.intro.countdown && remain > 0 && remain <= p.intro.seconds) {
    const n = Math.ceil(remain);
    const phase = 1 - (remain - Math.floor(remain));
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, 1 - phase * 0.55);
    ctx.font = font(240, family);
    outlined(ctx, String(n), W / 2, 540, 22, point);
    ctx.restore();
    ctx.font = font(46, family);
    outlined(ctx, '곧 시작해요', W / 2, 760, 10, 'rgba(255,255,255,.9)');
  }
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, family: string): string {
  fit(ctx, text, max, start, family, 48);
  return ctx.font;
}

/** 배경 blur를 매 프레임 걸면 30fps 인코딩이 무너진다. 한 번만 만들어 재사용한다. */
export function prepareBackground(img: HTMLImageElement, blur: number): CanvasImageSource {
  if (!blur) return img;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.filter = `blur(${blur}px)`;
  cover(x, img);
  return c;
}
