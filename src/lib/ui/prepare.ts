import { setSource } from '../audio.js';
import { computePeaks } from '../audio.js';
import { ensureGlyphs, textForProject } from '../fonts.js';
import { lyricCount, mergeBlocks, parseLyrics, timedCount } from '../lyrics.js';
import { commit, markFileDirty, project, state } from '../store.js';
import { button, confirmDialog, dropzone, el, filePicker, icon, toast } from './shell.js';

const AUDIO_OK = /\.(mp3|wav|m4a|aac|ogg)$/i;
const isAudio = (f: File) => AUDIO_OK.test(f.name) || /^audio\//.test(f.type);

export async function acceptAudio(file: File, rerender: () => void): Promise<void> {
  if (!isAudio(file)) {
    toast('MP3, WAV, M4A, AAC 파일을 넣어 주세요.', 'error');
    return;
  }
  try {
    const duration = await setSource(file);
    commit('audio', () => {
      const p = project();
      p.media = { name: file.name, type: file.type, duration };
      if (!p.view.loopB) p.view.loopB = Math.min(20, duration);
    });
    state.files.audio = file;
    markFileDirty('audio');
    rerender();
    computePeaks(file)
      .then(rerender)
      .catch(() => toast('파형을 그리지 못했지만 작업은 계속할 수 있어요.', 'info'));
    toast('반주를 넣었어요.', 'success');
  } catch (e) {
    toast(e instanceof Error ? e.message : '음원을 읽지 못했어요.', 'error');
  }
}

export function prepareScreen(rerender: () => void, go: (step: 1 | 2 | 3) => void): HTMLElement {
  const p = project();
  const root = el('div', { class: 'screen screen-prepare' });

  root.append(
    el('header', { class: 'screen-head' }, [
      el('h1', { textContent: '준비하기' }),
      el('p', { class: 'lead', textContent: '반주 파일과 가사만 있으면 돼요. 두 가지를 넣으면 바로 만들 수 있어요.' }),
    ]),
  );

  // ── 반주 ─────────────────────────────────────────────
  const hasAudio = !!p.media.name;
  const drop = el('div', { class: `dropzone${hasAudio ? ' is-filled' : ''}` }, [
    icon(hasAudio ? 'music_note' : 'upload_file'),
    el('b', { textContent: hasAudio ? p.media.name : '반주 파일을 여기에 끌어다 놓으세요' }),
    el('span', {
      class: 'hint',
      textContent: hasAudio ? `길이 ${Math.floor(p.media.duration / 60)}분 ${Math.round(p.media.duration % 60)}초 · 이 브라우저 안에서만 처리돼요` : 'MP3 · WAV · M4A · AAC',
    }),
    filePicker({ label: hasAudio ? '다른 파일 고르기' : '파일 고르기', accept: 'audio/*,.mp3,.wav,.m4a,.aac', icon: 'folder_open', kind: hasAudio ? 'secondary' : 'primary', onPick: (f) => acceptAudio(f, rerender) }),
  ]);
  dropzone(drop, isAudio, (f) => acceptAudio(f, rerender));

  root.append(section('1', '반주 넣기', drop));

  // ── 가사 ─────────────────────────────────────────────
  const modeRow = el('label', { class: 'switch-row' }, [
    el('span', {}, [el('b', { textContent: '뮤지컬 모드' }), el('small', { textContent: '배역을 나누고 영상에 역할 이름을 보여줘요.' })]),
  ]);
  const modeInput = el('input', { type: 'checkbox', checked: p.musicalMode, id: 'musical-mode' });
  modeInput.setAttribute('role', 'switch');
  modeInput.onchange = () => {
    commit('mode', () => {
      project().musicalMode = modeInput.checked;
    });
    rerender();
  };
  modeRow.append(modeInput);

  const area = el('textarea', {
    class: 'lyrics-input',
    id: 'lyrics-input',
    rows: 9,
    spellcheck: false,
    placeholder: p.musicalMode ? '[왜] 왜 저럴까 정말 그럴까\n[전체] 우리 함께 문을 열어!' : '왜 저럴까 정말 그럴까\n우리 함께 문을 열어!',
    value: p.blocks.map((b) => (p.musicalMode ? `[${p.roles.find((r) => r.id === b.roleId)?.name || '전체'}] ${b.text}` : b.text)).join('\n'),
  });

  const apply = button({
    kind: 'primary',
    icon: 'auto_awesome_motion',
    label: '가사 블록 만들기',
    onClick: async () => {
      const cur = project();
      const parsed = parseLyrics(area.value, cur.roles, cur.musicalMode);
      const merged = mergeBlocks(cur.blocks, parsed.blocks);
      if (merged.lost > 0) {
        const ok = await confirmDialog({
          title: '타이밍이 지워질 수 있어요',
          body: `${merged.kept}줄은 타이밍을 그대로 지키고, ${merged.lost}줄은 다시 찍어야 해요. 계속할까요?`,
          confirm: `${merged.lost}줄 다시 찍기`,
          danger: true,
        });
        if (!ok) return;
      }
      commit('lyrics', () => {
        const target = project();
        target.roles = parsed.roles;
        target.blocks = merged.blocks;
        target.timing.cursor = 0;
      });
      ensureGlyphs(project().style.fontFamily, textForProject(project()));
      rerender();
      toast(merged.kept ? `${merged.blocks.length}줄 준비 완료 · ${merged.kept}줄은 타이밍을 지켰어요.` : `${merged.blocks.length}줄 준비 완료!`, 'success');
    },
  });

  const lyricsBox = el('div', { class: 'stack' }, [
    modeRow,
    el('p', {
      class: 'hint',
      textContent: p.musicalMode ? '한 줄에 한 소절씩. [배역] 가사 형식으로 쓰면 배역도 함께 만들어져요.' : '한 줄에 한 소절씩 입력해 주세요.',
    }),
    area,
    el('div', { class: 'row' }, [apply, blockSummary()]),
  ]);

  if (p.musicalMode && p.roles.length) lyricsBox.append(roleEditor(rerender));

  root.append(section('2', '가사 넣기', lyricsBox));

  // ── 다음 ─────────────────────────────────────────────
  const ready = hasAudio && p.blocks.length > 0;
  root.append(
    el('div', { class: 'screen-foot' }, [
      el('p', { class: 'hint', textContent: ready ? '이제 노래를 들으면서 줄마다 한 번씩만 찍으면 돼요.' : '반주와 가사를 모두 넣으면 다음으로 갈 수 있어요.' }),
      button({ kind: 'primary', icon: 'arrow_forward', label: '타이밍 만들기', disabled: !ready, onClick: () => go(2) }),
    ]),
  );

  return root;
}

function blockSummary(): HTMLElement {
  const p = project();
  if (!p.blocks.length) return el('span', { class: 'hint', textContent: '아직 만든 블록이 없어요.' });
  const timed = timedCount(p.blocks);
  return el('span', { class: 'hint' }, [
    el('b', { textContent: `${lyricCount(p.blocks)}줄` }),
    el('span', { textContent: timed ? ` · 타이밍 ${timed}줄 완료` : ' · 타이밍은 다음 단계에서' }),
  ]);
}

function roleEditor(rerender: () => void): HTMLElement {
  const p = project();
  const box = el('div', { class: 'roles' }, [el('h3', { textContent: '배역 색상' })]);
  const list = el('div', { class: 'role-list' });
  for (const role of p.roles) {
    const color = el('input', { type: 'color', value: role.color });
    color.setAttribute('aria-label', `${role.name} 색상`);
    color.oninput = () =>
      commit(`role-color-${role.id}`, () => {
        role.color = color.value;
      });
    const name = el('input', { type: 'text', value: role.name, class: 'role-name' });
    name.setAttribute('aria-label', '배역 이름');
    name.onchange = () => {
      commit(`role-name-${role.id}`, () => {
        role.name = name.value.trim() || role.name;
      });
      rerender();
    };
    list.append(el('div', { class: 'role-chip' }, [color, name]));
  }
  box.append(list);
  return box;
}

function section(step: string, title: string, body: HTMLElement): HTMLElement {
  return el('section', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [el('span', { class: 'panel-step', textContent: step }), el('h2', { textContent: title })]),
    body,
  ]);
}
