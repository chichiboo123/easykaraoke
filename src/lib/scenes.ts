/**
 * 무대 씬 — 결과 영상의 배경.
 *
 * 모두 Canvas 2D로 시간을 받아 그리는 절차적 배경이다. 외부 이미지나 라이브러리가
 * 없으므로 오프라인에서도 동작하고, 같은 time이면 언제나 같은 그림이 나온다.
 * 그래서 미리보기와 내보낸 영상이 프레임 단위로 일치한다.
 *
 * 기법 출처(모두 공개된 그래픽스 관용구, 코드는 직접 구현):
 *  - value noise (Ken Perlin 계열 smoothstep 보간) — 오로라 리본
 *  - 합성 모드 'screen'을 이용한 빛 누적 — 오로라·스포트라이트
 *  - synthwave 원근 격자 — 소실점 기준 등비 간격
 *  - bokeh: 방사형 그라디언트 원반
 * THIRD_PARTY_NOTICES.md에 정리했다.
 */

export type SceneId =
  | 'classic' | 'minimal' | 'classroom'
  | 'aurora' | 'bokeh' | 'starfield' | 'dream'
  | 'stage' | 'spotlight' | 'neon' | 'retro' | 'confetti';

export type SceneGroup = '기본' | '감성' | '무대';

export type Scene = {
  id: SceneId;
  label: string;
  note: string;
  group: SceneGroup;
  /** 음절 하이라이트 색 */
  point: string;
  /** 가사 세로 위치와 기본 크기 */
  lyricY: number;
  size: number;
  /** 0이면 안 씀. 화면 가장자리를 어둡게 해 가사에 집중시킨다. */
  vignette: number;
  /** 필름 그레인 세기. 단조로운 그라디언트를 덜 밋밋하게 만든다. */
  grain: number;
  /** 밝은 배경이면 true. 상단 메타 글자의 명암을 뒤집어야 읽힌다. */
  light?: boolean;
  /** 가사 뒤에 깔 어두운 띠(0~1). 배경 요소와 글자가 겹치는 씬에서 가독성을 지킨다. */
  scrim?: number;
  draw: (ctx: CanvasRenderingContext2D, t: number, W: number, H: number) => void;
};

/* ── 결정적 난수와 노이즈 ─────────────────────────────────
   Math.random()을 쓰면 프레임마다 배경이 튄다. 인덱스 기반 해시를 쓴다. */
function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** smoothstep 보간 value noise. 부드럽게 흐르는 곡선에 쓴다. */
function noise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * u;
}

function fill(ctx: CanvasRenderingContext2D, style: string | CanvasGradient, W: number, H: number) {
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, W, H);
}

function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** 부드러운 빛 원반. 보케와 성운에 쓴다. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, color],
    [0.45, color.replace('rgb(', 'rgba(').replace(')', ',.55)')],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ── 씬 정의 ──────────────────────────────────────────── */

const scenes: Scene[] = [
  {
    id: 'classic',
    label: '클래식 노래방',
    note: '익숙하고 선명한 깊은 남색',
    group: '기본',
    point: '#ffd43b',
    lyricY: 540,
    size: 104,
    vignette: 0.5,
    grain: 0.03,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, 0, H, [[0, '#050d20'], [0.55, '#0d1e3f'], [1, '#132a55']]), W, H);
      // 가사 뒤에 은은한 빛을 깔아 글자가 배경에 묻히지 않게 한다.
      ctx.globalCompositeOperation = 'screen';
      glow(ctx, W / 2, this.lyricY, 900, 'rgb(40,90,170)', 0.3 + 0.04 * Math.sin(t * 0.6));
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'minimal',
    label: '미니멀',
    note: '글자만 남기는 절제된 화면',
    group: '기본',
    point: '#fbbf24',
    lyricY: 560,
    size: 96,
    vignette: 0.22,
    grain: 0.05,
    draw(ctx, t, W, H) {
      fill(ctx, '#0c0c10', W, H);
      // 얇은 강조선 하나만. 시간에 따라 아주 느리게 숨쉰다.
      const y = H - 170;
      const w = 300 + 60 * Math.sin(t * 0.5);
      ctx.fillStyle = 'rgba(251,191,36,.85)';
      ctx.fillRect(W / 2 - w / 2, y, w, 3);
    },
  },
  {
    id: 'classroom',
    label: '밝은 교실',
    note: '파스텔 도형이 떠다니는 밝은 화면',
    group: '기본',
    point: '#1d4ed8',
    lyricY: 560,
    size: 104,
    vignette: 0.12,
    grain: 0.02,
    light: true,
    scrim: 0.12,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, W, H, [[0, '#d8f3ff'], [0.5, '#e9f8ef'], [1, '#fff6d8']]), W, H);
      const colors = ['#BFD9F2', '#C8EDD9', '#FFF3B0', '#FFD6E0'];
      for (let i = 0; i < 14; i++) {
        const r = 60 + hash(i) * 110;
        const x = ((hash(i + 40) * W + t * (12 + hash(i) * 16)) % (W + 400)) - 200;
        const y = hash(i + 80) * H + Math.sin(t * 0.4 + i) * 26;
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        if (i % 3 === 0) {
          ctx.moveTo(x, y - r * 0.7);
          ctx.lineTo(x + r * 0.75, y + r * 0.5);
          ctx.lineTo(x - r * 0.75, y + r * 0.5);
          ctx.closePath();
        } else {
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  /* ── 감성 ── */
  {
    id: 'aurora',
    label: '오로라',
    note: '밤하늘에 흐르는 빛의 띠',
    group: '감성',
    point: '#9df5d5',
    lyricY: 545,
    size: 102,
    vignette: 0.55,
    grain: 0.05,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, 0, H, [[0, '#04070f'], [0.6, '#071228'], [1, '#0b1c34']]), W, H);
      // 멀리 보이는 별
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 90; i++) {
        const x = hash(i * 3) * W;
        const y = hash(i * 3 + 1) * H * 0.6;
        ctx.globalAlpha = 0.25 + 0.45 * hash(i * 3 + 2);
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;

      // 빛의 띠 — 노이즈로 흔들리는 곡선을 세로 그라디언트로 채운다.
      ctx.globalCompositeOperation = 'screen';
      const bands: [string, number][] = [['#2fd6a0', 0], ['#4bb8ff', 1], ['#a86ff0', 2], ['#38e0c8', 3]];
      for (const [color, k] of bands) {
        const drift = t * (0.16 + k * 0.05) + k * 12;
        ctx.beginPath();
        ctx.moveTo(-60, H);
        for (let x = -60; x <= W + 60; x += 40) {
          const n = noise(x / 420 + drift) + noise(x / 170 + drift * 1.7) * 0.4;
          ctx.lineTo(x, 180 + k * 70 + n * 260);
        }
        ctx.lineTo(W + 60, H);
        ctx.closePath();
        ctx.fillStyle = linear(ctx, 0, 120, 0, H * 0.9, [
          [0, `${color}00`],
          [0.28, `${color}66`],
          [0.62, `${color}22`],
          [1, `${color}00`],
        ]);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'bokeh',
    label: '보케',
    note: '초점 나간 불빛이 번지는 감성 화면',
    group: '감성',
    point: '#ffd9a0',
    lyricY: 545,
    size: 100,
    vignette: 0.6,
    grain: 0.05,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, W, H, [[0, '#160f1d'], [0.5, '#241426'], [1, '#381c22']]), W, H);
      ctx.globalCompositeOperation = 'screen';
      const tints = ['rgb(255,190,120)', 'rgb(255,140,160)', 'rgb(160,190,255)', 'rgb(255,225,170)'];
      for (let i = 0; i < 26; i++) {
        const r = 50 + hash(i) * 190;
        const speed = 0.05 + hash(i + 7) * 0.11;
        const x = ((hash(i + 11) * W + t * speed * 90) % (W + 500)) - 250;
        const y = hash(i + 23) * H + Math.sin(t * speed * 1.6 + i) * 50;
        glow(ctx, x, y, r, tints[i % tints.length], 0.1 + hash(i + 31) * 0.22);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'starfield',
    label: '별밤',
    note: '반짝이는 별과 은하수',
    group: '감성',
    point: '#a9c9ff',
    lyricY: 545,
    size: 100,
    vignette: 0.62,
    grain: 0.04,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, 0, H, [[0, '#01030a'], [0.7, '#050a1a'], [1, '#0a1026']]), W, H);
      ctx.globalCompositeOperation = 'screen';
      glow(ctx, W * 0.3, H * 0.35, 620, 'rgb(60,80,190)', 0.2);
      glow(ctx, W * 0.72, H * 0.55, 520, 'rgb(150,60,170)', 0.16);
      ctx.globalCompositeOperation = 'source-over';

      for (let i = 0; i < 220; i++) {
        const x = hash(i * 5) * W;
        const y = hash(i * 5 + 1) * H;
        const size = hash(i * 5 + 2) < 0.88 ? 2 : 3;
        // 별마다 다른 주기로 반짝인다.
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + hash(i * 5 + 3) * 2.4) + i));
        ctx.globalAlpha = tw;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;

      // 약 12초마다 별똥별 하나
      const cycle = 12;
      const phase = (t % cycle) / cycle;
      if (phase < 0.12) {
        const k = phase / 0.12;
        const sx = W * 0.15 + k * W * 0.5;
        const sy = H * 0.12 + k * H * 0.22;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 150, sy - 60);
        ctx.stroke();
      }
    },
  },
  {
    id: 'dream',
    label: '꿈결',
    note: '별빛과 구름이 흐르는 밤',
    group: '감성',
    point: '#bcd6ff',
    lyricY: 530,
    size: 98,
    vignette: 0.5,
    grain: 0.04,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, 0, H, [[0, '#0e1338'], [0.5, '#26205c'], [1, '#4a2a72']]), W, H);
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 7; i++) {
        const x = ((hash(i + 3) * W + t * (10 + i * 5)) % (W + 900)) - 450;
        const y = 120 + hash(i + 17) * (H - 300);
        glow(ctx, x, y, 320 + hash(i) * 220, 'rgb(120,140,255)', 0.13);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (let i = 0; i < 70; i++) {
        const x = hash(i * 7) * W;
        const y = hash(i * 7 + 1) * H * 0.75;
        ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + i));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    },
  },

  /* ── 무대 ── */
  {
    id: 'stage',
    label: '무대 조명',
    note: '보랏빛 무대에 쏟아지는 빛줄기',
    group: '무대',
    point: '#f0c2ff',
    lyricY: 555,
    size: 100,
    vignette: 0.55,
    grain: 0.04,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, 0, H, [[0, '#120c24'], [0.6, '#2b1152'], [1, '#4a1c66']]), W, H);
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 5; i++) {
        const sway = Math.sin(t * 0.35 + i * 1.3) * 180;
        const topX = (W / 6) * (i + 1);
        ctx.beginPath();
        ctx.moveTo(topX - 60, -20);
        ctx.lineTo(topX + 60, -20);
        ctx.lineTo(topX + 340 + sway, H + 20);
        ctx.lineTo(topX - 340 + sway, H + 20);
        ctx.closePath();
        ctx.fillStyle = linear(ctx, 0, 0, 0, H, [
          [0, 'rgba(210,160,255,.30)'],
          [0.6, 'rgba(170,110,255,.10)'],
          [1, 'rgba(120,60,220,0)'],
        ]);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    id: 'spotlight',
    label: '스포트라이트',
    note: '어둠 속 한 사람에게 떨어지는 빛',
    group: '무대',
    point: '#ffe9a8',
    lyricY: 550,
    size: 102,
    vignette: 0.7,
    grain: 0.06,
    scrim: 0.2,
    draw(ctx, t, W, H) {
      fill(ctx, '#08070c', W, H);
      ctx.globalCompositeOperation = 'screen';
      const sway = Math.sin(t * 0.4) * 90;
      // 중앙 주 조명
      ctx.beginPath();
      ctx.moveTo(W / 2 - 90, -20);
      ctx.lineTo(W / 2 + 90, -20);
      ctx.lineTo(W / 2 + 620 + sway, H + 20);
      ctx.lineTo(W / 2 - 620 + sway, H + 20);
      ctx.closePath();
      ctx.fillStyle = linear(ctx, 0, 0, 0, H, [
        [0, 'rgba(255,240,200,.34)'],
        [0.65, 'rgba(255,225,160,.12)'],
        [1, 'rgba(255,210,120,0)'],
      ]);
      ctx.fill();
      // 바닥에 퍼지는 빛
      glow(ctx, W / 2 + sway, H - 60, 620, 'rgb(255,230,170)', 0.16);
      ctx.globalCompositeOperation = 'source-over';

      // 빛줄기 속 먼지
      ctx.fillStyle = 'rgba(255,240,210,.5)';
      for (let i = 0; i < 55; i++) {
        const x = W / 2 + (hash(i) - 0.5) * 900 + sway * hash(i + 5);
        const y = ((hash(i + 9) * H + t * (14 + hash(i) * 22)) % H);
        ctx.globalAlpha = 0.18 + 0.4 * hash(i + 13);
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'neon',
    label: '네온 시티',
    note: '지평선으로 달리는 네온 격자',
    group: '무대',
    point: '#ff5fd2',
    lyricY: 520,
    size: 98,
    vignette: 0.45,
    grain: 0.05,
    scrim: 0.42,
    draw(ctx, t, W, H) {
      const horizon = H * 0.78;
      fill(ctx, linear(ctx, 0, 0, 0, horizon, [[0, '#170b33'], [0.6, '#3d1063'], [1, '#7a1f6a']]), W, horizon);
      ctx.fillStyle = '#0b0518';
      ctx.fillRect(0, horizon, W, H - horizon);

      // 해 — 가로줄로 잘린 신스웨이브 특유의 모양
      const sunR = 112;
      const sunY = horizon - 4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, sunY, sunR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = linear(ctx, 0, sunY - sunR, 0, sunY + sunR, [[0, '#ffd166'], [0.55, '#ff6f91'], [1, '#c026d3']]);
      ctx.fillRect(W / 2 - sunR, sunY - sunR, sunR * 2, sunR * 2);
      ctx.fillStyle = '#0b0518';
      for (let i = 0; i < 6; i++) {
        const y = sunY + 12 + i * 20;
        ctx.fillRect(W / 2 - sunR, y, sunR * 2, 5 + i * 2);
      }
      ctx.restore();

      // 원근 격자
      ctx.strokeStyle = 'rgba(255,95,210,.55)';
      ctx.lineWidth = 2;
      for (let i = -9; i <= 9; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 46, horizon);
        ctx.lineTo(W / 2 + i * 420, H);
        ctx.stroke();
      }
      // 가로선은 소실점 쪽으로 갈수록 촘촘해지고, 시간에 따라 다가온다.
      for (let i = 0; i < 14; i++) {
        const k = ((i + (t * 0.35) % 1) / 14) ** 2.2;
        const y = horizon + k * (H - horizon);
        ctx.globalAlpha = 0.25 + k * 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'retro',
    label: '레트로 팝',
    note: '망점이 찍힌 복고풍 색면',
    group: '무대',
    point: '#ffe066',
    lyricY: 545,
    size: 100,
    vignette: 0.3,
    grain: 0.03,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, W, H, [[0, '#3b176f'], [0.55, '#c2255c'], [1, '#f76707']]), W, H);
      // 하프톤 망점 — 오른쪽 아래로 갈수록 커진다.
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      const step = 54;
      const drift = (t * 10) % step;
      for (let y = -step; y < H + step; y += step) {
        for (let x = -step; x < W + step; x += step) {
          const k = (x / W + y / H) / 2;
          const r = 4 + k * 13;
          ctx.beginPath();
          ctx.arc(x + drift, y + drift * 0.5, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'confetti',
    label: '파티',
    note: '색종이가 쏟아지는 신나는 무대',
    group: '무대',
    point: '#fff3b0',
    lyricY: 550,
    size: 102,
    vignette: 0.35,
    grain: 0.02,
    draw(ctx, t, W, H) {
      fill(ctx, linear(ctx, 0, 0, 0, H, [[0, '#12224d'], [0.55, '#1d4f8f'], [1, '#0f8f9c']]), W, H);
      ctx.globalCompositeOperation = 'screen';
      glow(ctx, W / 2, H * 0.2, 800, 'rgb(80,140,255)', 0.18);
      ctx.globalCompositeOperation = 'source-over';

      const colors = ['#FFD166', '#EF476F', '#06D6A0', '#7AA2FF', '#FF9F1C'];
      for (let i = 0; i < 64; i++) {
        const speed = 60 + hash(i) * 130;
        const x = hash(i * 2) * W + Math.sin(t * (0.6 + hash(i) * 1.2) + i) * 60;
        const y = ((hash(i * 2 + 1) * H + t * speed) % (H + 80)) - 40;
        const w = 12 + hash(i + 5) * 12;
        const h = 7 + hash(i + 9) * 8;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (1 + hash(i + 3) * 2.5) + i);
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },
];

export const SCENES: Scene[] = scenes;
export const SCENE_GROUPS: SceneGroup[] = ['기본', '감성', '무대'];

const byId = new Map(scenes.map((s) => [s.id, s]));
export function sceneOf(id: string): Scene {
  return byId.get(id as SceneId) || scenes[0];
}

/* ── 마감 처리 ────────────────────────────────────────── */

let grainTile: CanvasPattern | null = null;

/** 필름 그레인. 매 프레임 노이즈를 만들면 1080p에서 너무 느리므로 타일 하나를 만들어 재사용한다. */
function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainTile) return grainTile;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (hash(i) - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = ctx.createPattern(c, 'repeat');
  return grainTile;
}

/** 가사 영역 뒤에 부드러운 어두운 띠. 배경이 화려한 씬에서 글자를 지킨다. */
export function drawScrim(ctx: CanvasRenderingContext2D, scene: Scene, W: number, H: number): void {
  if (!scene.scrim) return;
  const top = scene.lyricY - 320;
  const height = 620;
  const g = ctx.createLinearGradient(0, top, 0, top + height);
  const a = scene.scrim;
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.35, `rgba(0,0,0,${a})`);
  g.addColorStop(0.65, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, height);
}

/** 씬 위에 비네트와 그레인을 얹어 밋밋함을 없앤다. */
export function finishScene(ctx: CanvasRenderingContext2D, scene: Scene, W: number, H: number): void {
  if (scene.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${scene.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (scene.grain > 0) {
    const pattern = grainPattern(ctx);
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = scene.grain;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}
