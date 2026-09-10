import { sceneOf, finishScene } from '../scenes.js';
/**
 * 홈 화면 히어로 — 진짜 노래방 반주 인트로.
 *
 * 이 앱이 만들어 주는 결과물을 첫 화면에서 그대로 보여준다.
 * 설명하는 대신 재생해 보이는 쪽이 "이게 뭘 만들어 주는지"를 훨씬 빨리 전달한다.
 * 12초 주기로 인트로 카드 → 카운트다운 → 가사 채우기를 반복한다.
 */
const W = 1920;
const H = 1080;
const LOOP = 13;
const DEMO = [
    { text: '세상의 모든 음악', start: 6.9, end: 9.5 },
    { text: '노래방 반주 영상 뚝딱', start: 9.6, end: 12.7 },
];
/** 인트로 카드가 보이는 구간과, 카운트다운으로 넘어가는 시점. */
const CARD_OUT = 2.6;
const CUE = 6.9;
const POINT = '#ffd43b';
function font(size, weight = 800) {
    return `${weight} ${size}px "TJ Joy", "Pretendard GOV", Pretendard, "Noto Sans KR", system-ui, sans-serif`;
}
function outlined(ctx, text, x, y, w, fill) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = w;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}
/** 회전하는 CD. 노래방 화면의 상징이라 인트로의 시선을 잡아 준다. */
function disc(ctx, cx, cy, r, spin, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    const wedges = ['#bfe9ff', '#d9f5c8', '#fff3b0', '#ffd6e0', '#d9d0ff', '#c8edd9'];
    for (let i = 0; i < wedges.length; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, (i / wedges.length) * Math.PI * 2, ((i + 1) / wedges.length) * Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = wedges[i];
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#f6c9e4';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2340';
    ctx.fill();
    ctx.restore();
    // 디스크 테두리 광택
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
}
function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
}
/** 상단 "다음곡" 띠 — 노래방 화면에서 가장 먼저 눈에 들어오는 요소. */
function nextSongBar(ctx) {
    ctx.fillStyle = '#151033';
    ctx.fillRect(0, 0, W, 168);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = font(54);
    ctx.fillStyle = POINT;
    ctx.fillText('다음곡 ♪', 84, 86);
    roundRect(ctx, 300, 26, W - 380, 116, 14, '#0a0718');
    ctx.font = font(56, 700);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('0001', 348, 86);
    ctx.fillStyle = '#dcd6f5';
    ctx.fillText('여기 있어 노래방', 348 + ctx.measureText('0001').width + 56, 86);
}
/** 제목 패널 — 참고 화면처럼 비스듬히 잘린 어두운 판 위에 얹는다. */
function titlePanel(ctx, appear) {
    const x = 430;
    const y = 402;
    const w = 900;
    const h = 250;
    const skew = 64;
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - skew, y + h);
    ctx.lineTo(x - skew, y + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,8,26,.82)';
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(96);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('여기 있어 노래방', x + 42, y + 116);
    ctx.font = font(46, 700);
    ctx.fillStyle = '#9fd7ff';
    ctx.fillText('Easy Karaoke', x + 30, y + 190);
    ctx.restore();
}
/** 작사·작곡 자리에 이 앱의 컨셉과 만든이를 넣는다. */
function credits(ctx, appear) {
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const rows = [
        ['컨셉', '세상의 모든 음악'],
        ['만든이', '꿈꾸는 치수쌤'],
    ];
    rows.forEach(([label, value], i) => {
        const y = 880 + i * 76;
        ctx.font = font(44, 700);
        ctx.fillStyle = '#ffffff';
        outlined(ctx, value, W - 90, y, 8, '#ffffff');
        const vw = ctx.measureText(value).width;
        ctx.fillStyle = POINT;
        outlined(ctx, label, W - 110 - vw, y, 8, POINT);
    });
    ctx.restore();
}
function countdown(ctx, remain) {
    const n = Math.ceil(remain);
    if (n <= 0)
        return;
    const phase = 1 - (remain - Math.floor(remain));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.max(0.2, 1 - phase * 0.5);
    ctx.font = font(300);
    outlined(ctx, String(n), W / 2, 560, 24, POINT);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.font = font(52, 700);
    outlined(ctx, '곧 시작해요', W / 2, 800, 10, 'rgba(255,255,255,.92)');
}
/** 실제 결과물과 같은 방식으로 음절이 차오른다. */
function demoLyric(ctx, t) {
    const line = DEMO.find((l) => t >= l.start && t < l.end);
    const next = DEMO.find((l) => l.start > t);
    if (!line)
        return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(104);
    outlined(ctx, line.text, W / 2, 540, 14, '#ffffff');
    const p = Math.min(1, Math.max(0, (t - line.start) / (line.end - line.start)));
    const width = ctx.measureText(line.text).width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 - width / 2, 440, width * p, 200);
    ctx.clip();
    outlined(ctx, line.text, W / 2, 540, 14, POINT);
    ctx.restore();
    if (next) {
        ctx.font = font(62, 700);
        outlined(ctx, next.text, W / 2, 720, 10, 'rgba(255,255,255,.8)');
    }
}
function progressBar(ctx, t) {
    const p = Math.min(1, t / LOOP);
    roundRect(ctx, 90, 1010, W - 180, 10, 5, 'rgba(255,255,255,.22)');
    roundRect(ctx, 90, 1010, Math.max(12, (W - 180) * p), 10, 5, POINT);
}
export function drawHero(ctx, elapsed) {
    const t = elapsed % LOOP;
    const scene = sceneOf('bokeh');
    ctx.save();
    scene.draw(ctx, elapsed * 0.6, W, H);
    finishScene(ctx, scene, W, H);
    ctx.restore();
    nextSongBar(ctx);
    // 실제 노래방처럼 곡 정보 카드 → 카운트다운 → 가사 순서로 넘어간다.
    // 카드와 카운트다운이 겹치면 둘 다 안 읽히므로 카드를 먼저 걷어낸다.
    const cardAlpha = t < CARD_OUT ? Math.min(1, t / 0.6) : Math.max(0, 1 - (t - CARD_OUT) / 0.55);
    if (cardAlpha > 0.01) {
        disc(ctx, 268, 528, 132, elapsed * 0.9, cardAlpha);
        titlePanel(ctx, cardAlpha);
        credits(ctx, Math.min(cardAlpha, Math.max(0, (t - 0.5) / 0.7)));
    }
    if (t >= CARD_OUT && t < CUE)
        countdown(ctx, CUE - t);
    if (t >= CUE)
        demoLyric(ctx, t);
    progressBar(ctx, t);
}
let raf = 0;
/** 히어로 캔버스를 만들고 애니메이션을 시작한다. */
export function startHero(canvas) {
    stopHero();
    const started = performance.now();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = () => {
        if (!canvas.isConnected) {
            raf = 0;
            return;
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cssW = Math.max(320, canvas.clientWidth || 640);
        const want = { w: Math.round(cssW * dpr), h: Math.round(((cssW * 9) / 16) * dpr) };
        if (canvas.width !== want.w || canvas.height !== want.h) {
            canvas.width = want.w;
            canvas.height = want.h;
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
        // 애니메이션을 줄여 달라고 한 사용자에게는 정지 화면 한 장만 보여준다.
        drawHero(ctx, reduced ? 1.2 : (performance.now() - started) / 1000);
        if (!reduced)
            raf = requestAnimationFrame(frame);
        else
            raf = 0;
    };
    raf = requestAnimationFrame(frame);
}
export function stopHero() {
    cancelAnimationFrame(raf);
    raf = 0;
}
