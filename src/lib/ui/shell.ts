/** DOM 조립 헬퍼. V1은 문자열 템플릿 + innerHTML 전면 교체였다. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string; html?: string; dataset?: Record<string, string> } = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, html, dataset, ...rest } = props;
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  Object.assign(node, rest);
  for (const child of children) if (child != null) node.append(child as Node | string);
  return node;
}

export function icon(name: string): HTMLElement {
  return el('span', { class: 'mi', textContent: name, ariaHidden: 'true' });
}

type ButtonOpts = {
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  label?: string;
  title?: string;
  /** 아이콘 폰트를 못 불러왔을 때 대신 보여줄 짧은 기호. 없으면 title을 쓴다. */
  fallback?: string;
  disabled?: boolean;
  onClick?: () => void;
};

export function button(opts: ButtonOpts): HTMLButtonElement {
  // 아이콘만 있는 버튼은 아이콘 폰트가 없으면 빈 사각형이 된다.
  // btn-iconly로 표시해 두면 CSS가 aria-label을 글자로 대신 보여준다.
  const iconOnly = !!opts.icon && !opts.label;
  const b = el('button', { class: `btn btn-${opts.kind || 'secondary'}${iconOnly ? ' btn-iconly' : ''}`, type: 'button' });
  if (opts.icon) b.append(icon(opts.icon));
  if (opts.label) b.append(el('span', { textContent: opts.label }));
  if (opts.title) {
    b.title = opts.title;
    if (!opts.label) b.setAttribute('aria-label', opts.title);
  }
  // 라벨 전체를 그대로 내보내면 좁은 칸에서 넘친다. 짧은 기호를 우선한다.
  if (iconOnly) b.dataset.fallback = opts.fallback ?? opts.title ?? '•';
  b.disabled = !!opts.disabled;
  if (opts.onClick) b.onclick = opts.onClick;
  return b;
}

/**
 * 키보드로 도달 가능한 파일 선택 버튼.
 * V1은 label 안의 input이 opacity:0 + pointer-events:none이라
 * 키보드 사용자가 파일을 아예 고를 수 없었다.
 */
export function filePicker(opts: { label: string; accept: string; icon?: string; kind?: 'primary' | 'secondary' | 'ghost'; onPick: (file: File) => void }): HTMLElement {
  const input = el('input', { type: 'file', accept: opts.accept, class: 'visually-hidden' });
  const b = button({ kind: opts.kind || 'secondary', icon: opts.icon, label: opts.label, onClick: () => input.click() });
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) opts.onPick(f);
    input.value = '';
  };
  return el('span', { class: 'file-picker' }, [b, input]);
}

/** 드래그&드롭. V1은 "놓아주세요"라고 써 놓고 핸들러가 없어, 놓으면 페이지를 떠나 작업이 날아갔다. */
export function dropzone(node: HTMLElement, test: (f: File) => boolean, onDrop: (f: File) => void): void {
  const over = (on: boolean) => node.classList.toggle('is-over', on);
  node.addEventListener('dragover', (e) => {
    e.preventDefault();
    over(true);
  });
  node.addEventListener('dragleave', () => over(false));
  node.addEventListener('drop', (e) => {
    e.preventDefault();
    over(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && test(f)) onDrop(f);
    else if (f) toast('이 파일 형식은 넣을 수 없어요.', 'error');
  });
}

let toastHost: HTMLElement | null = null;

/** V1은 오류가 전부 alert()였다(7곳). */
export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info', action?: { label: string; run: () => void }): void {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', role: 'status' });
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  const t = el('div', { class: `toast toast-${kind}` }, [
    icon(kind === 'error' ? 'error_outline' : kind === 'success' ? 'check_circle' : 'info'),
    el('span', { textContent: message }),
  ]);
  if (action) {
    t.append(
      button({
        kind: 'ghost',
        label: action.label,
        onClick: () => {
          action.run();
          t.remove();
        },
      }),
    );
  }
  toastHost.append(t);
  setTimeout(() => {
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 300);
  }, action ? 7000 : 3600);
}

/** 되돌릴 수 없는 조작 전에 확인받는다. */
export function confirmDialog(opts: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'dialog' });
    const close = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.append(
      el('h2', { textContent: opts.title }),
      el('p', { textContent: opts.body }),
      el('div', { class: 'dialog-actions' }, [
        button({ kind: 'ghost', label: '취소', onClick: () => close(false) }),
        button({ kind: opts.danger ? 'danger' : 'primary', label: opts.confirm, onClick: () => close(true) }),
      ]),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function clock(t: number, precise = false): string {
  const s = Math.max(0, t);
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  return `${m}:${(s % 60).toFixed(precise ? 2 : 1).padStart(precise ? 5 : 4, '0')}`;
}

/** 16:9 미리보기 캔버스. devicePixelRatio를 반영해 레티나에서 또렷하다. */
export function previewCanvas(className: string): HTMLCanvasElement {
  const c = el('canvas', { class: className });
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', '노래방 영상 미리보기');
  return c;
}

const PREVIEW_W_KEY = 'yeogi-preview-w';
const MIN_PREVIEW_W = 320;
const MIN_SIDE_W = 280;

function readPreviewWidth(): number | null {
  try {
    const v = Number(localStorage.getItem(PREVIEW_W_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writePreviewWidth(w: number | null): void {
  try {
    if (w == null) localStorage.removeItem(PREVIEW_W_KEY);
    else localStorage.setItem(PREVIEW_W_KEY, String(Math.round(w)));
  } catch {
    /* 시크릿 모드 */
  }
}

/**
 * 미리보기 오른쪽 아래 모서리를 끌어 크기를 바꾸는 손잡이.
 *
 * 미리보기의 폭이 곧 편집기 왼쪽 칸의 폭이 된다. 그래서 미리보기를 키우면
 * 그 아래 재생 조작·찍기 패널은 함께 넓어지고, 오른쪽 목록은 그만큼 좁아진다.
 * 크기는 화면을 옮겨 다녀도 유지되도록 기억해 두고, 두 번 누르면 자동 크기로 돌아간다.
 */
export function previewResizer(shell: HTMLElement, stage: HTMLElement, onResize?: () => void): HTMLButtonElement {
  const grip = el('button', { type: 'button', class: 'stage-grip', title: '끌어서 미리보기 크기 조절 · 두 번 누르면 원래대로' });
  grip.setAttribute('aria-label', '미리보기 크기 조절 (화살표 키로 조절, 두 번 누르면 원래대로)');

  /** 사용자가 고른 폭. 창이 작아지면 잠시 줄여 보여 주되, 원래 값은 지킨다. */
  let wanted = readPreviewWidth();

  const maxWidth = () => {
    const cs = getComputedStyle(shell);
    const inner = shell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 0;
    const pane = stage.parentElement;
    // 오른쪽 목록이 쓸 자리를 남기고, 미리보기와 바로 아래 재생 조작이 한 화면 높이 안에 들어오게.
    const below = stage.nextElementSibling instanceof HTMLElement ? stage.nextElementSibling.offsetHeight + (parseFloat(pane ? getComputedStyle(pane).rowGap : '') || 0) : 0;
    const byHeight = pane && pane.clientHeight > 0 ? ((pane.clientHeight - below) * 16) / 9 : Infinity;
    return Math.max(MIN_PREVIEW_W, Math.min(inner - gap - MIN_SIDE_W, byHeight));
  };
  const clampWidth = (w: number) => Math.max(MIN_PREVIEW_W, Math.min(maxWidth(), w));

  const apply = () => {
    if (wanted == null) {
      shell.classList.remove('has-stage-w');
      shell.style.removeProperty('--stage-w');
    } else {
      shell.classList.add('has-stage-w');
      shell.style.setProperty('--stage-w', `${Math.round(clampWidth(wanted))}px`);
    }
    onResize?.();
  };

  /** 지금 보이는 그림의 폭. 자동 크기에서는 무대 칸이 16:9가 아닐 수 있다. */
  const shownWidth = () => {
    const r = stage.getBoundingClientRect();
    return Math.min(r.width, (r.height * 16) / 9);
  };

  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = shownWidth();
    shell.classList.add('is-resizing');
    const move = (ev: PointerEvent) => {
      // 가로로 끌든 세로로 끌든 16:9를 지킨 채 더 크게 움직인 쪽을 따른다.
      const dx = ev.clientX - startX;
      const dy = ((ev.clientY - startY) * 16) / 9;
      wanted = clampWidth(startW + (Math.abs(dx) >= Math.abs(dy) ? dx : dy));
      apply();
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      shell.classList.remove('is-resizing');
      writePreviewWidth(wanted);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });

  grip.addEventListener('dblclick', () => {
    wanted = null;
    writePreviewWidth(null);
    apply();
  });

  grip.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    // 화살표는 전역에서 재생 위치 이동이다. 여기서는 크기 조절로만 쓴다.
    e.preventDefault();
    e.stopPropagation();
    wanted = clampWidth(shownWidth() + dir * (e.shiftKey ? 96 : 24));
    apply();
    writePreviewWidth(wanted);
  });

  // 창 크기가 바뀌면 고른 폭이 들어갈 자리가 달라진다. 화면을 떠나면 관찰을 멈춘다.
  const ro = new ResizeObserver(() => {
    if (!shell.isConnected) {
      ro.disconnect();
      return;
    }
    if (wanted != null) apply();
  });
  ro.observe(shell);
  queueMicrotask(apply);

  return grip;
}

export function sizeCanvas(c: HTMLCanvasElement, logicalWidth = 1920, logicalHeight = 1080): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // 캔버스 CSS 박스가 16:9가 아닐 수 있다(무대를 꽉 채우고 object-fit: contain으로 맞춤).
  // 비트맵은 항상 16:9로 유지하되, 박스 안에 들어가는 최대 크기를 고른다.
  const boxW = Math.max(320, c.clientWidth || 640);
  const boxH = c.clientHeight || (boxW * logicalHeight) / logicalWidth;
  const w = Math.min(boxW, (boxH * logicalWidth) / logicalHeight);
  const h = (w * logicalHeight) / logicalWidth;
  const want = { w: Math.round(w * dpr), h: Math.round(h * dpr) };
  if (c.width !== want.w || c.height !== want.h) {
    c.width = want.w;
    c.height = want.h;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(c.width / logicalWidth, c.height / logicalHeight);
  return ctx;
}
