// 비회원 조회 페이지 — walk.wouldyou.me/find?case=<id>
//
// 원래는 "목격했어요" 제보까지 받는 페이지였는데, 앱 쪽에서 그 기능
// 자체를 뺐다(복잡도 대비 실사용이 낮았다는 판단) — 여기도 같은 결정을
// 따라 조회 전용으로 줄인다. sightings 테이블도 지워지므로(Nicedogclub
// 0041 마이그레이션) 제보를 받는 코드가 남아 있으면 어차피 저장 시점에
// 에러만 난다.
//
// 원래 Supabase Edge Function으로 만들었었는데, Supabase가 Edge Function의
// text/html 응답을 플랫폼 차원에서 text/plain으로 강제 변환해서(Pro+커스텀
// 도메인 없이는 우회 불가) 아예 못 띄웠다. Vercel은 그 제약이 없고,
// walk.wouldyou.me가 이미 Vercel에 있으니 여기로 옮긴다. 로직은 그대로,
// Deno 문법만 Vercel Edge Runtime(Web 표준 Request/Response, 동일)에 맞춰
// 옮기고 Supabase 클라이언트 대신 REST를 직접 호출한다(의존성 없음 — 이
// 사이트가 원래 순수 정적 사이트라 package.json이 없다).
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 실종 며칠째 — 잃어버린 날을 1일째로 센다(Nicedogclub의 daysMissing()과 같은 규칙). */
function daysMissing(lastSeenAtIso, now = new Date()) {
  const start = new Date(lastSeenAtIso);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicPhotoUrl(path) {
  if (!path) return null;
  // uploadPhoto()가 public-photos 버킷에 대해서는 이미 완성된 공개 URL을
  // 돌려주고 있어서(src/lib/photoStore.ts, getPublicUrl().data.publicUrl),
  // lost_cases.photo_url엔 처음부터 전체 URL이 들어있다. 그걸 "저장 경로"로
  // 오인해 이 함수가 URL 접두사를 한 번 더 씌우면 주소가 통째로 겹쳐서
  // 깨진 링크가 된다(실제로 사진이 계속 안 뜨던 원인). 이미 URL이면 그대로
  // 쓴다.
  if (/^https?:\/\//.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/public-photos/${path}`;
}

async function restFetch(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

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
  .footer-note { margin-top: 22px; font-size: 12px; color: ${MUTED}; text-align: center; }
  .center { text-align: center; padding: 50px 20px; }
  a.home-link { color: ${GREEN}; font-weight: 800; text-decoration: none; }
</style>
</head>
<body>
  <div class="wrap">
    <a class="brand" href="https://walk.wouldyou.me"><img src="/public/favicon.png" alt="" />우쥬산책</a>
    ${bodyHtml}
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
      <p class="muted">${escapeHtml(petName)}는 이미 찾았어요. 관심 가져주셔서 감사합니다.</p>
    </div>`,
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  const caseId = url.searchParams.get('case');
  if (!caseId) return notFoundPage();

  const lostCase = await getCase(caseId);
  if (!lostCase) return notFoundPage();
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  if (lostCase.status !== 'searching') return closedPage(lostCase.pet_name);

  const photo = publicPhotoUrl(lostCase.photo_url);
  const isLost = lostCase.kind !== 'found';
  const locationLabel = isLost ? '마지막 목격 위치' : '발견 위치';
  const days = isLost && lostCase.last_seen_at ? daysMissing(lostCase.last_seen_at) : null;

  return page({
    title: isLost ? `${lostCase.pet_name}를 찾고 있어요` : '주인을 찾고 있어요',
    ogImage: photo,
    ogDescription: isLost
      ? `${lostCase.breed} · ${lostCase.last_seen_address} 부근에서 실종. 아시는 분은 앱에서 알려주세요.`
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
      <p class="footer-note">이 아이를 아시나요? 우쥬산책 앱에서 알려주실 수 있어요.</p>
    `,
  });
}
