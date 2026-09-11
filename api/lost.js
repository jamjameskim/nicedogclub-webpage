import {dateKst, escapeHtml as esc, missingLabel, publicPhotoUrl, restFetch} from '../lib/lost-cases.mjs';
export const config = {runtime: 'edge'};
const PAGE_SIZE = 24;
const statuses = {all:'전체',searching:'찾는 중',resolved:'종료'};
function urlFor(status, page=1) {
  const params = new URLSearchParams();
  if(status !== 'all') params.set('status', status);
  if(page > 1) params.set('page', page);
  return '/lost' + (params.size ? '?' + params : '');
}
function card(item, now) {
  const photo = publicPhotoUrl(item.photo_url);
  const title = item.pet_name || '이름 미등록';
  const closed = item.status === 'resolved';
  return `<article class="case-card"><a class="case-link" href="/find?case=${encodeURIComponent(item.id)}" aria-label="${esc(title)} 분실 신고 보기">
    <div class="thumbnail">${photo ? `<img src="${esc(photo)}" alt="${esc(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="placeholder" hidden>등록된 사진을<br>불러올 수 없어요</span>` : '<span class="placeholder">등록된 사진이 없어요</span>'}
    <span class="state ${closed?'closed':'searching'}">${closed?'종료':'찾는 중'}</span></div>
    <div class="case-info"><h2>${esc(title)}</h2><p class="days ${closed?'finished':''}">${esc(missingLabel(item,now))}</p><p class="date">실종일 · ${esc(dateKst(item.last_seen_at))}</p></div>
  </a></article>`;
}
export function renderList({items=[],status='all',page=1,total=0,error=false}, now=new Date()) {
  const pages = Math.max(1, Math.ceil(total/PAGE_SIZE));
  const body = error ? `<section class="empty" role="alert"><h2>목록을 불러오지 못했어요</h2><p>잠시 후 다시 시도해주세요.</p><a class="retry" href="${esc(urlFor(status,page))}">다시 불러오기</a></section>` : items.length ? `<div class="case-grid">${items.map(item=>card(item,now)).join('')}</div>` : `<section class="empty"><h2>${page>1?'이 페이지에 신고가 없어요':status==='searching'?'현재 찾는 중인 분실 신고가 없어요':status==='resolved'?'종료된 분실 신고가 없어요':'등록된 분실 신고가 없어요'}</h2><p>${page>1?'첫 페이지에서 목록을 확인해주세요.':'새로운 신고가 등록되면 이곳에서 확인할 수 있어요.'}</p>${page>1?`<a class="retry" href="${esc(urlFor(status))}">첫 페이지로</a>`:''}</section>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>분실 목록 · 우쥬산책</title><meta name="description" content="반려견 분실 소식을 확인해주세요. 사진과 실종일수, 진행 상태를 확인하고 상세 신고를 볼 수 있습니다."><link rel="icon" type="image/png" href="/public/favicon.png"><link rel="stylesheet" href="/public/lost.css"><script src="/public/lost.js" defer></script></head><body>
  <header class="nav"><nav class="wrap nav-in" aria-label="주요 메뉴"><a class="brand" href="/" aria-label="우쥬산책 홈"><img src="/public/favicon.png" alt="">우쥬산책</a><a class="nav-current" href="/lost" aria-current="page">분실 목록</a></nav></header>
  <main class="wrap"><div class="page-head"><p class="eyebrow">함께 찾아요</p><h1>분실 목록</h1><p>혹시 이 아이를 보셨나요?<br class="mobile-break"> 사진을 눌러 분실 소식을 확인해주세요.</p></div>
  <div class="list-toolbar"><nav class="filters" aria-label="신고 상태">${Object.entries(statuses).map(([key,label])=>`<a href="${esc(urlFor(key))}"${key===status?' aria-current="page"':''}>${label}</a>`).join('')}</nav><p class="count">${error?'조회 실패':number(total)+'건'}</p></div>
  ${body}
  ${!error&&total>PAGE_SIZE?`<nav class="pagination" aria-label="목록 페이지">${page>1?`<a href="${esc(urlFor(status,page-1))}" rel="prev">← 이전</a>`:'<span aria-disabled="true">← 이전</span>'}<span>${page} / ${pages}</span>${page<pages?`<a href="${esc(urlFor(status,page+1))}" rel="next">다음 →</a>`:'<span aria-disabled="true">다음 →</span>'}</nav>`:''}
  <p class="list-note">실종 당일을 1일째로 계산합니다. 종료된 신고는 종료일 기준이며,<br class="desktop-break"> 종료일이 기록되지 않은 경우 실종일수를 표시하지 않습니다.</p>
  </main><footer><div class="wrap footer-in"><a href="/">우쥬산책</a><div><a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a><a href="/location-terms">위치정보 이용약관</a></div></div><div class="wrap footer-biz">우쥬랩 · 대표 김재민 · 사업자등록번호 267-49-01090 · 인천광역시 서해구 심곡로56번길 1, 가호 3층-S32호(심곡동) · <a href="mailto:wouldyouteam@gmail.com">wouldyouteam@gmail.com</a></div></footer></body></html>`;
  return new Response(html,{status:error?503:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function number(n) { return new Intl.NumberFormat('ko-KR').format(n); }
export default async function handler(req) {
  if(req.method!=='GET'&&req.method!=='HEAD') return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const url = new URL(req.url);
  const status = url.searchParams.get('status')||'all';
  const page = Number(url.searchParams.get('page')||1);
  if(!Object.hasOwn(statuses,status)||!Number.isSafeInteger(page)||page<1||page>10000) return new Response('올바르지 않은 목록 주소입니다.',{status:400,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  const query = new URLSearchParams({select:'id,pet_name,photo_url,status,last_seen_at,resolved_at',kind:'eq.lost',order:'created_at.desc,id.desc',limit:String(PAGE_SIZE),offset:String((page-1)*PAGE_SIZE)});
  query.set('status',status==='all'?'in.(searching,resolved)':'eq.'+status);
  try {
    const res = await restFetch('/lost_cases?'+query,{headers:{Prefer:'count=exact'}});
    if(!res.ok) throw new Error('Query failed');
    const total = res.headers.get('content-range')?.split('/')[1];
    if(!total||!/^\d+$/.test(total)) throw new Error('Missing count');
    const items = await res.json();
    if(!Array.isArray(items)) throw new Error('Invalid rows');
    const output = renderList({items,status,page,total:Number(total)});
    return req.method==='HEAD'?new Response(null,{status:output.status,headers:output.headers}):output;
  } catch {
    const output=renderList({status,page,error:true});
    return req.method==='HEAD'?new Response(null,{status:output.status,headers:output.headers}):output;
  }
}
