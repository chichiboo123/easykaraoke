/** DOM 조립 헬퍼. V1은 문자열 템플릿 + innerHTML 전면 교체였다. */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    const { class: cls, html, dataset, ...rest } = props;
    if (cls)
        node.className = cls;
    if (html !== undefined)
        node.innerHTML = html;
    if (dataset)
        for (const [k, v] of Object.entries(dataset))
            node.dataset[k] = v;
    Object.assign(node, rest);
    for (const child of children)
        if (child != null)
            node.append(child);
    return node;
}
export function icon(name) {
    return el('span', { class: 'mi', textContent: name, ariaHidden: 'true' });
}
export function button(opts) {
    // 아이콘만 있는 버튼은 아이콘 폰트가 없으면 빈 사각형이 된다.
    // btn-iconly로 표시해 두면 CSS가 aria-label을 글자로 대신 보여준다.
    const iconOnly = !!opts.icon && !opts.label;
    const b = el('button', { class: `btn btn-${opts.kind || 'secondary'}${iconOnly ? ' btn-iconly' : ''}`, type: 'button' });
    if (opts.icon)
        b.append(icon(opts.icon));
    if (opts.label)
        b.append(el('span', { textContent: opts.label }));
    if (opts.title) {
        b.title = opts.title;
        if (!opts.label)
            b.setAttribute('aria-label', opts.title);
    }
    b.disabled = !!opts.disabled;
    if (opts.onClick)
        b.onclick = opts.onClick;
    return b;
}
/**
 * 키보드로 도달 가능한 파일 선택 버튼.
 * V1은 label 안의 input이 opacity:0 + pointer-events:none이라
 * 키보드 사용자가 파일을 아예 고를 수 없었다.
 */
export function filePicker(opts) {
    const input = el('input', { type: 'file', accept: opts.accept, class: 'visually-hidden' });
    const b = button({ kind: opts.kind || 'secondary', icon: opts.icon, label: opts.label, onClick: () => input.click() });
    input.onchange = () => {
        const f = input.files?.[0];
        if (f)
            opts.onPick(f);
        input.value = '';
    };
    return el('span', { class: 'file-picker' }, [b, input]);
}
/** 드래그&드롭. V1은 "놓아주세요"라고 써 놓고 핸들러가 없어, 놓으면 페이지를 떠나 작업이 날아갔다. */
export function dropzone(node, test, onDrop) {
    const over = (on) => node.classList.toggle('is-over', on);
    node.addEventListener('dragover', (e) => {
        e.preventDefault();
        over(true);
    });
    node.addEventListener('dragleave', () => over(false));
    node.addEventListener('drop', (e) => {
        e.preventDefault();
        over(false);
        const f = e.dataTransfer?.files?.[0];
        if (f && test(f))
            onDrop(f);
        else if (f)
            toast('이 파일 형식은 넣을 수 없어요.', 'error');
    });
}
let toastHost = null;
/** V1은 오류가 전부 alert()였다(7곳). */
export function toast(message, kind = 'info', action) {
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
        t.append(button({
            kind: 'ghost',
            label: action.label,
            onClick: () => {
                action.run();
                t.remove();
            },
        }));
    }
    toastHost.append(t);
    setTimeout(() => {
        t.classList.add('leaving');
        setTimeout(() => t.remove(), 300);
    }, action ? 7000 : 3600);
}
/** 되돌릴 수 없는 조작 전에 확인받는다. */
export function confirmDialog(opts) {
    return new Promise((resolve) => {
        const dlg = el('dialog', { class: 'dialog' });
        const close = (v) => {
            dlg.close();
            dlg.remove();
            resolve(v);
        };
        dlg.append(el('h2', { textContent: opts.title }), el('p', { textContent: opts.body }), el('div', { class: 'dialog-actions' }, [
            button({ kind: 'ghost', label: '취소', onClick: () => close(false) }),
            button({ kind: opts.danger ? 'danger' : 'primary', label: opts.confirm, onClick: () => close(true) }),
        ]));
        dlg.addEventListener('cancel', (e) => {
            e.preventDefault();
            close(false);
        });
        document.body.append(dlg);
        dlg.showModal();
    });
}
export function clock(t, precise = false) {
    const s = Math.max(0, t);
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    return `${m}:${(s % 60).toFixed(precise ? 2 : 1).padStart(precise ? 5 : 4, '0')}`;
}
/** 16:9 미리보기 캔버스. devicePixelRatio를 반영해 레티나에서 또렷하다. */
export function previewCanvas(className) {
    const c = el('canvas', { class: className });
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', '노래방 영상 미리보기');
    return c;
}
export function sizeCanvas(c, logicalWidth = 1920, logicalHeight = 1080) {
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
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(c.width / logicalWidth, c.height / logicalHeight);
    return ctx;
}
