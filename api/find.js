// 비회원 조회 + 목격 제보 페이지 — walk.wouldyou.me/find?case=<id>
//
// 원래 Supabase Edge Function으로 만들었었는데, Supabase가 Edge Function의
// text/html 응답을 플랫폼 차원에서 text/plain으로 강제 변환해서(Pro+커스텀
// 도메인 없이는 우회 불가) 아예 못 띄웠다. Vercel은 그 제약이 없고,
// walk.wouldyou.me가 이미 Vercel에 있으니 여기로 옮긴다. Deno 문법만
// Vercel Edge Runtime(Web 표준 Request/Response, 동일)에 맞춰 옮기고
// Supabase 클라이언트 대신 REST를 직접 호출한다(의존성 없음 — 이 사이트가
// 원래 순수 정적 사이트라 package.json이 없다).
//
// 목격 제보 폼은 한 번(2026-09-09) 뺐다가 되살렸다 — 앱 쪽 결정이 "분실자가
// 없을 때 독립적으로 만드는 목격 신고"만 없애자는 거였는데, 실제로는 제보
// 기능 전체가 지워졌었다. sightings.case_id가 애초부터(0001) not null이라
// 목격 제보는 항상 "기존 분실 공고에 붙는" 것이었지 독립 생성이 된 적이
// 없다 — 즉 kind='lost' 공고에서는 계속 받아야 한다. kind='found'(주인
// 없는 독립 발견 게시물)에는 원래도 폼이 없었다(sightings 개념 자체가 안
// 맞음) — 아래 isLost로 분기.
export const config = { runtime: 'edge' };

// 이 저장소에 아직 커밋 안 된 별도 작업(lib/lost-cases.mjs 등 공용화
// 리팩터)이 진행 중이라, 그 작업과 분리해서 안전하게 배포하려고 이
// 파일 하나로 완결되게 필요한 만큼만 그대로 들고 있는다(공용 lib이
// 커밋되면 그때 다시 합쳐도 된다).
const DAY = 86_400_000;
const KST = 9 * 60 * 60 * 1000;
const calendarDay = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor((timestamp + KST) / DAY) : null;
};
// Korea calendar dates, including the missing date as day one.
function daysMissing(lastSeenAt, until = new Date()) {
  const first = calendarDay(lastSeenAt), last = calendarDay(until);
  return first === null || last === null ? null : Math.max(1, last - first + 1);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function publicPhotoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    // Existing records contain either a complete public URL or a bucket path.
    const url = /^https?:\/\//i.test(value.trim()) ? new URL(value) : new URL(value, `${process.env.SUPABASE_URL}/storage/v1/object/public/public-photos/`);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return url.href;
  } catch { return null; }
}
async function restFetch(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Missing database configuration');
  return fetch(`${base}/rest/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10000),
  });
}

// 우쥬산책 앱의 색 토큰과 통일 — index.html의 --ink/--muted/--paper/--green과
// 같은 값이다. "긴급"만 앱과 같은 진짜 오렌지(#df5b20, index.html의
// .notice-visual 참고)를 쓴다.
const INK = '#14283d';
const MUTED = '#66788a';
const PAPER = '#f8fcfe';
const LINE = 'rgba(20,40,61,.12)';
const GREEN = '#188fb2';
const GREEN2 = '#e3f5fa';
const ALERT = '#df5b20';
const ALERT_SOFT = '#fff3ec';

const WHEN_OPTIONS = [
  { value: 'now', label: '방금', offsetMs: 0 },
  { value: 'm30', label: '30분 전', offsetMs: 30 * 60_000 },
  { value: 'h1', label: '1시간 전', offsetMs: 60 * 60_000 },
];

async function getCase(caseId) {
  const res = await restFetch(
    `/lost_cases?id=eq.${encodeURIComponent(caseId)}&select=id,kind,pet_name,breed,pet_summary,photo_url,last_seen_address,last_seen_at,last_seen_lat,last_seen_lng,flag_wary_of_people,status`,
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

function page({ title, bodyHtml, ogImage, ogDescription }) {
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
<meta property="og:title" content="${escapeHtml(title)}" />
${ogDescription ? `<meta property="og:description" content="${escapeHtml(ogDescription)}" />` : ''}
<link rel="icon" type="image/png" href="/public/favicon.png" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${PAPER};
    color: ${INK};
    font-family: Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
    line-height: 1.6;
    word-break: keep-all;
  }
  .wrap { max-width: 460px; margin: 0 auto; padding: 24px 20px 60px; }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 22px; font-size: 14px; font-weight: 950; letter-spacing: -.03em; }
  .brand img { width: 26px; height: 26px; border-radius: 8px; }
  .badge {
    display: inline-block; font-size: 12px; font-weight: 900; letter-spacing: .02em;
    color: ${ALERT}; background: ${ALERT_SOFT}; padding: 5px 11px; border-radius: 100px; margin-bottom: 12px;
  }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -.03em; }
  p { margin: 0; }
  .muted { color: ${MUTED}; font-size: 13.5px; }
  .photo {
    width: 100%; aspect-ratio: 4/3; object-fit: cover;
    border-radius: 18px; margin: 16px 0; background: ${GREEN2};
  }
  .card {
    background: #fff; border: 1px solid ${LINE}; border-radius: 18px;
    padding: 18px; margin: 16px 0;
  }
  .warn {
    background: ${ALERT_SOFT}; border: 1px solid ${ALERT}33; border-radius: 14px;
    padding: 15px; margin: 16px 0; font-size: 13.5px;
  }
  .warn b { color: ${ALERT}; }
  label { display: block; font-size: 13px; font-weight: 800; margin: 18px 0 7px; }
  input[type="text"], textarea, select {
    width: 100%; font-size: 15px; padding: 13px 14px; border-radius: 12px;
    border: 1px solid ${LINE}; background: #fff; color: ${INK}; font-family: inherit;
  }
  textarea { min-height: 84px; resize: vertical; }
  .hp { position: absolute; left: -9999px; }
  button {
    width: 100%; margin-top: 24px; padding: 16px; font-size: 16px; font-weight: 900;
    color: #fff; background: ${ALERT}; border: none; border-radius: 14px; cursor: pointer;
  }
  .footer-note { margin-top: 22px; font-size: 12px; color: ${MUTED}; text-align: center; }
  .center { text-align: center; padding: 50px 20px; }
  a.home-link { color: ${GREEN}; font-weight: 800; text-decoration: none; }
</style>
</head>
<body>
  <div class="wrap">
    <a class="brand" href="https://walk.wouldyou.me"><img src="/public/favicon.png" alt="" />우쥬산책</a>
    ${bodyHtml}
    <p class="footer-note"><a class="home-link" href="/lost">← 분실 목록 보기</a></p>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function notFoundPage() {
  return page({
    title: '신고를 찾을 수 없어요',
    bodyHtml: `<div class="center">
      <h1>신고를 찾을 수 없어요</h1>
      <p class="muted">링크가 잘못됐거나 삭제된 신고예요.</p>
    </div>`,
  });
}

function closedPage(petName) {
  return page({
    title: `${petName} 찾기가 종료됐어요`,
    bodyHtml: `<div class="center">
      <h1>이미 종료된 신고예요</h1>
      <p class="muted">${escapeHtml(petName)}의 신고가 종료되었습니다. 관심 가져주셔서 감사합니다.</p>
    </div>`,
  });
}

function sentPage(petName) {
  return page({
    title: '제보가 전달됐어요',
    bodyHtml: `<div class="center">
      <div style="font-size:46px;">🐾</div>
      <h1>제보가 전달됐어요</h1>
      <p class="muted">${escapeHtml(petName)} 보호자에게 바로 전달됩니다. 알려주셔서 감사합니다.</p>
    </div>`,
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  const caseId = url.searchParams.get('case');
  if (!caseId) return notFoundPage();

  const lostCase = await getCase(caseId);
  if (!lostCase) return notFoundPage();

  const isLost = lostCase.kind !== 'found';

  if (req.method === 'GET') {
    if (lostCase.status !== 'searching') return closedPage(lostCase.pet_name);

    const photo = publicPhotoUrl(lostCase.photo_url);
    const days = isLost && lostCase.last_seen_at ? daysMissing(lostCase.last_seen_at) : null;
    const locationLabel = isLost ? '마지막 목격 위치' : '발견 위치';
    // kind='found'(주인 없는 독립 발견 게시물)엔 목격 제보 개념이 없다 —
    // sightings.case_id가 항상 not null이라 애초에 붙을 자리가 없다.
    const whenOptions = isLost
      ? WHEN_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')
      : '';

    return page({
      title: isLost ? `${lostCase.pet_name}를 찾고 있어요` : '주인을 찾고 있어요',
      ogImage: photo,
      ogDescription: isLost
        ? `${lostCase.breed} · ${lostCase.last_seen_address} 부근에서 실종. 목격하셨다면 제보해 주세요.`
        : `${lostCase.breed} · ${lostCase.last_seen_address} 부근에서 발견. 주인을 찾고 있어요.`,
      bodyHtml: `
        <span class="badge">● 찾는 중${days != null ? ` · 실종 ${days}일째` : ''}</span>
        <h1>${escapeHtml(isLost ? `${lostCase.pet_name}를 찾고 있어요` : '주인을 찾고 있어요')}</h1>
        <p class="muted">${escapeHtml(lostCase.pet_summary)}</p>
        ${
          photo
            ? `<img class="photo" src="${escapeHtml(photo)}" alt="${escapeHtml(lostCase.pet_name)}" onerror="this.style.display='none'" />`
            : ''
        }
        <div class="card">
          <p class="muted" style="font-weight:800; color:${INK};">${locationLabel}</p>
          <p>${escapeHtml(lostCase.last_seen_address)}</p>
        </div>
        ${
          lostCase.flag_wary_of_people
            ? `<div class="warn"><b>사람을 경계하는 아이예요.</b><br />다가가거나 쫓지 말고, 안전한 거리에서 위치만 확인해 주세요.</div>`
            : ''
        }
        ${
          isLost
            ? `<form method="POST" action="/find?case=${encodeURIComponent(caseId)}">
          <input class="hp" type="text" name="company" tabindex="-1" autocomplete="off" />
          <label for="name">이름 (선택)</label>
          <input type="text" id="name" name="name" maxlength="40" placeholder="어떻게 불러드릴까요?" />
          <label for="when">언제 봤나요?</label>
          <select id="when" name="when">${whenOptions}</select>
          <label for="place">어디서 봤나요? *</label>
          <input type="text" id="place" name="place" maxlength="120" required placeholder="예: OO동 OO공원 정문 앞" />
          <label for="memo">메모 (선택)</label>
          <textarea id="memo" name="memo" maxlength="500" placeholder="목줄은 있었고 혼자였어요"></textarea>
          <button type="submit">제보 보내기</button>
        </form>
        <p class="footer-note">보내주신 제보는 보호자에게 즉시 전달됩니다. 연락처는 요구하지 않아요.</p>`
            : `<p class="footer-note">이 아이를 아시나요? 우쥬산책 앱에서 알려주실 수 있어요.</p>`
        }
      `,
    });
  }

  if (req.method === 'POST') {
    if (!isLost) return new Response('Method Not Allowed', { status: 405 });
    if (lostCase.status !== 'searching') return closedPage(lostCase.pet_name);

    let form;
    try {
      form = await req.formData();
    } catch {
      return notFoundPage();
    }

    // 허니팟 — 사람은 안 보이는 필드라 채워져 있으면 봇으로 본다. 에러를
    // 티 내지 않고 성공한 척 조용히 버린다(봇에게 힌트를 주지 않기 위해).
    if (String(form.get('company') ?? '').length > 0) {
      return sentPage(lostCase.pet_name);
    }

    const place = String(form.get('place') ?? '').trim().slice(0, 120);
    if (!place) return notFoundPage();

    const name = String(form.get('name') ?? '').trim().slice(0, 40) || '이웃';
    const memo = String(form.get('memo') ?? '').trim().slice(0, 500);
    const when = WHEN_OPTIONS.find((o) => o.value === form.get('when')) ?? WHEN_OPTIONS[0];
    const at = new Date(Date.now() - when.offsetMs).toISOString();

    const insertRes = await restFetch('/sightings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        case_id: lostCase.id,
        at,
        // 브라우저 GPS(navigator.geolocation)는 "제보자가 지금 폼을 쓰는
        // 위치"이지 "목격한 위치"가 아니다 — 걷다 본 뒤 집에 가서 작성하면
        // 완전히 다른 좌표가 된다. 그런 틀릴 수 있는 좌표를 지도에 점으로
        // 찍느니, 신고의 마지막 목격 좌표를 중립적인 자리로 쓰고 실제
        // 목격 장소는 address(자유 텍스트)로만 정직하게 전달한다. 앱의
        // 타임라인 화면은 address를 보여주지 좌표를 안 쓰므로 문제없다.
        lat: lostCase.last_seen_lat,
        lng: lostCase.last_seen_lng,
        address: place,
        photos: [],
        memo: memo || null,
        reporter_id: null,
        reporter_name: name,
        verification: 'pending',
        is_guest: true,
      }),
    });

    if (!insertRes.ok) {
      console.error('[find] 제보 저장 실패', await insertRes.text().catch(() => ''));
      return notFoundPage();
    }

    // 큐에 쌓인 "새 제보" 알림을 바로 흘려보낸다 — 실패해도 신고 저장
    // 자체는 이미 끝났으니 사용자에게는 그대로 성공을 보여준다.
    fetch(`${process.env.SUPABASE_URL}/functions/v1/flush-outbox`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    }).catch(() => {});

    return sentPage(lostCase.pet_name);
  }

  return new Response('Method Not Allowed', { status: 405 });
}
