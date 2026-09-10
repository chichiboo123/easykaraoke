export type FontSource = 'bundled' | 'cdn' | 'system' | 'custom';

export type FontEntry = {
  family: string;
  label: string;
  source: FontSource;
  url?: string;
  ready: boolean;
};

/**
 * 글꼴 목록.
 * - bundled: 저장소에 파일이 있는 글꼴 (TJ 노래하는즐거움체)
 * - cdn: Google Fonts에서 불러오는 OFL 글꼴. index.html의 <link>가 @font-face를 넣어 준다.
 * - system: 파일 없이 항상 쓸 수 있는 마지막 보루
 *
 * V1은 파일이 하나도 없는데 6종 카드를 전부 정상처럼 보여줬다.
 * V2는 실제 로드 결과를 ready에 담아 UI가 실패한 글꼴을 비활성 처리한다.
 */
export const fonts: FontEntry[] = [
  { family: 'TJ Joy', label: 'TJ 노래하는즐거움체', source: 'bundled', url: './fonts/TJJoyofsingingM.otf', ready: false },
  { family: 'Jua', label: '주아체', source: 'cdn', ready: false },
  { family: 'Do Hyeon', label: '도현체', source: 'cdn', ready: false },
  { family: 'Black Han Sans', label: '검은고딕', source: 'cdn', ready: false },
  { family: 'Gowun Dodum', label: '고운돋움', source: 'cdn', ready: false },
  { family: 'Noto Sans KR', label: '노토 산스', source: 'cdn', ready: false },
  { family: 'system-ui', label: '기본 글꼴', source: 'system', ready: true },
];

/** 글꼴이 실제로 붙었는지 확인할 때 쓰는 한글 표본. */
const PROBE = '가나다ABC123';

/** 느린 네트워크가 앱 시작을 붙잡지 못하게 한다. 학교 방화벽에서 실제로 일어난다. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);
}

/**
 * document.fonts.check()는 일치하는 @font-face가 아예 없을 때도 true를 돌려준다
 * (시스템 폴백이 있으니 "그릴 수는 있다"는 뜻). 그래서 글꼴이 진짜 왔는지 판정할 때는
 * 등록된 face를 직접 살펴야 한다.
 */
function faceLoaded(family: string): boolean {
  for (const face of document.fonts) if (face.family === family && face.status === 'loaded') return true;
  return false;
}

/**
 * 글꼴 스타일시트는 렌더링을 막지 않도록 media="print"로 받아 onload에서 적용한다.
 * 그래서 앱 시작 시점에는 @font-face가 아직 등록되지 않았을 수 있다.
 * 프로브를 돌리기 전에 그 <link>들이 끝나기를(또는 시간이 지나기를) 기다린다.
 */
function stylesheetsReady(ms: number): Promise<void> {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter((l) => l.href.startsWith('http'));
  const waits = links.map(
    (l) =>
      new Promise<void>((ok) => {
        if (l.sheet) return ok();
        l.addEventListener('load', () => ok(), { once: true });
        l.addEventListener('error', () => ok(), { once: true });
      }),
  );
  return withTimeout(Promise.all(waits), ms).then(() => undefined);
}

/** CDN 글꼴이 늦게 도착했는지 다시 확인한다. 도착했으면 ready로 올린다. */
export async function refreshCdnFonts(): Promise<boolean> {
  let changed = false;
  await Promise.all(
    fonts
      .filter((f) => f.source === 'cdn' && !f.ready)
      .map(async (f) => {
        try {
          await document.fonts.load(`700 96px "${f.family}"`, PROBE);
          if (faceLoaded(f.family)) {
            f.ready = true;
            changed = true;
          }
        } catch {
          /* 아직 안 옴 */
        }
      }),
  );
  return changed;
}

/** 글꼴 판정이 끝났는지. 끝나기 전에는 저장된 글꼴 선택을 건드리지 않는다. */
export let settled = false;

export async function loadBuiltins(timeoutMs = 6000): Promise<FontEntry[]> {
  await stylesheetsReady(Math.min(4000, timeoutMs));
  await withTimeout(
    Promise.all(
    fonts.map(async (f) => {
      if (f.source === 'system') return;
      try {
        if (f.source === 'bundled' && f.url) {
          const face = new FontFace(f.family, `url(${f.url})`);
          await face.load();
          document.fonts.add(face);
          f.ready = true;
          return;
        }
        // CDN 글꼴은 index.html의 <link>가 @font-face를 이미 등록해 뒀다.
        // 여기서는 한글 표본으로 실제 조각이 내려오는지 확인만 한다.
        await document.fonts.load(`700 96px "${f.family}"`, PROBE);
        f.ready = faceLoaded(f.family);
      } catch {
        f.ready = false;
      }
    }),
    ),
    timeoutMs,
  );
  settled = true;
  return fonts;
}

/**
 * Google Fonts는 한글을 unicode-range 조각 수십 개로 쪼개 준다.
 * 브라우저는 "그 글자가 실제로 필요할 때" 해당 조각을 받는데,
 * Canvas의 fillText는 그런 요청을 일으키지 않는다.
 * 그래서 그리기 전에 쓸 글자를 미리 알려 조각을 받아 둬야 한다.
 * 이걸 빼먹으면 미리보기와 내보낸 영상이 조용히 폴백 글꼴로 나온다.
 */
const primed = new Set<string>();

export async function ensureGlyphs(family: string, text: string): Promise<void> {
  const entry = fonts.find((f) => f.family === family);
  if (!entry || entry.source === 'system' || !entry.ready) return;
  // 필요한 글자만 추려 키를 만든다. 같은 조합은 다시 요청하지 않는다.
  const unique = [...new Set(text)].sort().join('');
  if (!unique) return;
  const key = `${family}|${unique}`;
  if (primed.has(key)) return;
  primed.add(key);
  try {
    // 렌더러가 쓰는 굵기·크기와 맞춰야 같은 face가 잡힌다.
    await Promise.all([
      document.fonts.load(`700 96px "${family}"`, unique),
      document.fonts.load(`400 96px "${family}"`, unique),
    ]);
    await document.fonts.ready;
  } catch {
    primed.delete(key);
  }
}

/** 영상에 나올 수 있는 모든 글자. 카운트다운 숫자와 고정 문구까지 포함한다. */
export function textForProject(p: {
  meta: { title: string; musical: string; number: string; composer: string; lyricist: string };
  blocks: { text: string }[];
  roles: { name: string }[];
}): string {
  return [
    ...p.blocks.map((b) => b.text),
    ...p.roles.map((r) => r.name),
    p.meta.title,
    p.meta.musical,
    p.meta.number,
    p.meta.composer,
    p.meta.lyricist,
    '작곡 작사 곧 시작해요 간주 0123456789',
  ].join(' ');
}

/** 실제로 쓸 수 있는 글꼴을 고른다. 저장된 선택을 못 쓰면 첫 번째 사용 가능 글꼴. */
export function resolveFamily(requested: string): string {
  const found = fonts.find((f) => f.family === requested);
  if (found?.ready) return requested;
  // 아직 판정 중이면 사용자의 선택을 그대로 둔다.
  // 여기서 성급히 바꾸면 CDN이 조금 느렸다는 이유로 저장된 글꼴이 덮어써진다.
  if (!settled) return requested;
  return fonts.find((f) => f.ready)?.family || 'system-ui';
}

export async function loadCustomFont(file: File): Promise<string> {
  const family = `내 글꼴 ${file.name.replace(/\.[^.]+$/, '')}`;
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  await document.fonts.ready;
  const existing = fonts.find((f) => f.family === family);
  if (existing) existing.ready = true;
  else fonts.splice(fonts.length - 1, 0, { family, label: family, source: 'custom', ready: true });
  return family;
}
