/**
 * 녹화된 fMP4를 "탐색 가능한" 파일로 마무리한다.
 *
 * MediaRecorder는 실시간 녹화라 끝 길이를 모르는 채로 쓴다. 그 결과
 *   - mvhd / tkhd / mdhd 의 duration 이 전부 0 (길이 미상)
 *   - sidx 도 mfra 도 없음 (조각 위치를 찾을 색인이 없음)
 * 이라서 플레이어가 총 길이도, 특정 시각의 프레임 위치도 알 수 없다.
 * 재생은 되지만 진행바를 끌 수 없는 파일이 나오는 이유다.
 *
 * 여기서는 녹화가 끝난 뒤 실제 길이를 계산해 헤더에 써 넣고,
 * 조각마다 (시각 → 파일 오프셋) 표인 mfra 를 덧붙인다.
 */

type Box = { type: string; start: number; hdr: number; size: number };

function readBoxes(v: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let i = start;
  while (i + 8 <= end) {
    let size = v.getUint32(i);
    let hdr = 8;
    if (size === 1) {
      // 64비트 길이
      size = Number(v.getBigUint64(i + 8));
      hdr = 16;
    } else if (size === 0) {
      size = end - i;
    }
    if (size < hdr) break;
    let type = '';
    for (let k = 0; k < 4; k++) type += String.fromCharCode(v.getUint8(i + 4 + k));
    out.push({ type, start: i, hdr, size });
    i += size;
  }
  return out;
}

function find(v: DataView, boxes: Box[], type: string): Box | undefined {
  return boxes.find((b) => b.type === type);
}

/** 컨테이너 박스 안을 재귀적으로 훑어 원하는 타입을 모두 모은다. */
function collect(v: DataView, start: number, end: number, type: string, into: Box[]): void {
  for (const b of readBoxes(v, start, end)) {
    if (b.type === type) into.push(b);
    if (CONTAINERS.has(b.type)) collect(v, b.start + b.hdr, b.start + b.size, type, into);
  }
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf', 'mvex', 'edts']);

type TrackInfo = { id: number; timescale: number; tkhd?: Box; mdhd?: Box; duration: number };

/** trun/tfhd/trex를 순서대로 참고해 조각의 재생 길이를 구한다. */
function fragmentDuration(v: DataView, traf: Box, defaults: Map<number, number>, trackId: number): number {
  const boxes = readBoxes(v, traf.start + traf.hdr, traf.start + traf.size);
  const tfhd = find(v, boxes, 'tfhd');
  let defaultDuration = defaults.get(trackId) ?? 0;
  if (tfhd) {
    const flags = v.getUint32(tfhd.start + tfhd.hdr) & 0xffffff;
    let p = tfhd.start + tfhd.hdr + 8; // version/flags + track_ID
    if (flags & 0x000001) p += 8; // base_data_offset
    if (flags & 0x000002) p += 4; // sample_description_index
    if (flags & 0x000008) {
      defaultDuration = v.getUint32(p);
      p += 4;
    }
  }
  let total = 0;
  for (const trun of boxes.filter((b) => b.type === 'trun')) {
    const flags = v.getUint32(trun.start + trun.hdr) & 0xffffff;
    const count = v.getUint32(trun.start + trun.hdr + 4);
    let p = trun.start + trun.hdr + 8;
    if (flags & 0x000001) p += 4; // data_offset
    if (flags & 0x000004) p += 4; // first_sample_flags
    const hasDur = !!(flags & 0x000100);
    const perSample = (hasDur ? 4 : 0) + (flags & 0x000200 ? 4 : 0) + (flags & 0x000400 ? 4 : 0) + (flags & 0x000800 ? 4 : 0);
    if (!hasDur) {
      total += count * defaultDuration;
      continue;
    }
    for (let i = 0; i < count; i++) {
      total += v.getUint32(p);
      p += perSample;
    }
  }
  return total;
}

function writeBox(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
}

/**
 * 녹화 결과를 탐색 가능한 파일로 만든다.
 * 구조를 해석하지 못하면 원본을 그대로 돌려준다. 마무리에 실패했다고
 * 애써 만든 영상을 잃게 할 수는 없다.
 */
export async function finalizeMp4(blob: Blob): Promise<Blob> {
  try {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const v = new DataView(buf);
    const top = readBoxes(v, 0, bytes.length);
    const moov = find(v, top, 'moov');
    const moofs = top.filter((b) => b.type === 'moof');
    if (!moov || !moofs.length) return blob;

    // ── 트랙 정보 ────────────────────────────────────
    const mvhd = find(v, readBoxes(v, moov.start + moov.hdr, moov.start + moov.size), 'mvhd');
    if (!mvhd) return blob;
    const mvhdVer = v.getUint8(mvhd.start + mvhd.hdr);
    const movieTimescale = mvhdVer === 0 ? v.getUint32(mvhd.start + mvhd.hdr + 12) : v.getUint32(mvhd.start + mvhd.hdr + 20);
    if (!movieTimescale) return blob;

    const tracks = new Map<number, TrackInfo>();
    for (const trak of readBoxes(v, moov.start + moov.hdr, moov.start + moov.size).filter((b) => b.type === 'trak')) {
      const tkhdList: Box[] = [];
      const mdhdList: Box[] = [];
      collect(v, trak.start + trak.hdr, trak.start + trak.size, 'tkhd', tkhdList);
      collect(v, trak.start + trak.hdr, trak.start + trak.size, 'mdhd', mdhdList);
      const tkhd = tkhdList[0];
      const mdhd = mdhdList[0];
      if (!tkhd || !mdhd) continue;
      const tkVer = v.getUint8(tkhd.start + tkhd.hdr);
      const id = tkVer === 0 ? v.getUint32(tkhd.start + tkhd.hdr + 12) : v.getUint32(tkhd.start + tkhd.hdr + 20);
      const mdVer = v.getUint8(mdhd.start + mdhd.hdr);
      const timescale = mdVer === 0 ? v.getUint32(mdhd.start + mdhd.hdr + 12) : v.getUint32(mdhd.start + mdhd.hdr + 20);
      tracks.set(id, { id, timescale, tkhd, mdhd, duration: 0 });
    }
    if (!tracks.size) return blob;

    // trex의 기본 샘플 길이
    const trexDefaults = new Map<number, number>();
    const trexList: Box[] = [];
    collect(v, moov.start + moov.hdr, moov.start + moov.size, 'trex', trexList);
    for (const trex of trexList) {
      trexDefaults.set(v.getUint32(trex.start + trex.hdr + 4), v.getUint32(trex.start + trex.hdr + 12));
    }

    // ── 조각을 훑어 길이와 (시각 → 오프셋) 표를 만든다 ──
    const entries = new Map<number, { time: number; offset: number }[]>();
    for (const moof of moofs) {
      for (const traf of readBoxes(v, moof.start + moof.hdr, moof.start + moof.size).filter((b) => b.type === 'traf')) {
        const inner = readBoxes(v, traf.start + traf.hdr, traf.start + traf.size);
        const tfhd = find(v, inner, 'tfhd');
        if (!tfhd) continue;
        const trackId = v.getUint32(tfhd.start + tfhd.hdr + 4);
        const track = tracks.get(trackId);
        if (!track) continue;
        const tfdt = find(v, inner, 'tfdt');
        let baseTime = track.duration;
        if (tfdt) {
          const ver = v.getUint8(tfdt.start + tfdt.hdr);
          baseTime = ver === 0 ? v.getUint32(tfdt.start + tfdt.hdr + 4) : Number(v.getBigUint64(tfdt.start + tfdt.hdr + 4));
        }
        const list = entries.get(trackId) || [];
        list.push({ time: baseTime, offset: moof.start });
        entries.set(trackId, list);
        track.duration = baseTime + fragmentDuration(v, traf, trexDefaults, trackId);
      }
    }

    // ── 길이를 헤더에 써 넣는다 ─────────────────────
    let movieDuration = 0;
    const out = new Uint8Array(bytes); // 원본을 복사해 그 위에 고친다
    const ov = new DataView(out.buffer);
    for (const track of tracks.values()) {
      if (!track.timescale || !track.duration) continue;
      const inMovie = Math.round((track.duration / track.timescale) * movieTimescale);
      movieDuration = Math.max(movieDuration, inMovie);
      const { tkhd, mdhd } = track;
      if (tkhd) {
        const ver = ov.getUint8(tkhd.start + tkhd.hdr);
        if (ver === 0) ov.setUint32(tkhd.start + tkhd.hdr + 20, inMovie);
        else ov.setBigUint64(tkhd.start + tkhd.hdr + 28, BigInt(inMovie));
      }
      if (mdhd) {
        const ver = ov.getUint8(mdhd.start + mdhd.hdr);
        if (ver === 0) ov.setUint32(mdhd.start + mdhd.hdr + 16, track.duration);
        else ov.setBigUint64(mdhd.start + mdhd.hdr + 24, BigInt(track.duration));
      }
    }
    if (!movieDuration) return blob;
    if (mvhdVer === 0) ov.setUint32(mvhd.start + mvhd.hdr + 16, movieDuration);
    else ov.setBigUint64(mvhd.start + mvhd.hdr + 24, BigInt(movieDuration));

    // ── mfra: 조각마다 (시각 → 파일 오프셋) ──────────
    // tfra 규격: FullBox(4) + track_ID(4) + 길이지정(4) + entry수(4) 뒤에
    // 엔트리마다 time(4) + moof_offset(4) + traf/trun/sample 번호(각 1바이트).
    const tfras: Uint8Array[] = [];
    for (const [trackId, list] of entries) {
      const body = new Uint8Array(16 + list.length * 11);
      const dv = new DataView(body.buffer);
      dv.setUint32(0, 0); // version 0, flags 0
      dv.setUint32(4, trackId);
      dv.setUint32(8, 0); // reserved(26) + 각 번호 길이 0 → 1바이트씩
      dv.setUint32(12, list.length);
      let p = 16;
      for (const e of list) {
        dv.setUint32(p, e.time);
        dv.setUint32(p + 4, e.offset);
        body[p + 8] = 1; // traf_number
        body[p + 9] = 1; // trun_number
        body[p + 10] = 1; // sample_number
        p += 11;
      }
      tfras.push(writeBox('tfra', body));
    }

    const tfraBytes = tfras.reduce((n, b) => n + b.length, 0);
    const mfraSize = 8 + tfraBytes + 16; // mfra 헤더 + tfra들 + mfro(16)
    const mfroBody = new Uint8Array(8);
    new DataView(mfroBody.buffer).setUint32(4, mfraSize);
    const mfro = writeBox('mfro', mfroBody);

    const mfraBody = new Uint8Array(tfraBytes + mfro.length);
    let at = 0;
    for (const t of tfras) {
      mfraBody.set(t, at);
      at += t.length;
    }
    mfraBody.set(mfro, at);
    const mfra = writeBox('mfra', mfraBody);

    return new Blob([out.slice().buffer, mfra.slice().buffer], { type: blob.type });
  } catch {
    // 마무리에 실패해도 녹화 자체는 살린다.
    return blob;
  }
}
