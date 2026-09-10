import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {renderList} from '../api/lost.js';
import {daysMissing, missingLabel, publicPhotoUrl} from '../lib/lost-cases.mjs';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';

test('Korea calendar days include the missing date and cross midnight correctly', () => {
  assert.equal(daysMissing('2026-09-08T14:59:00Z', '2026-09-08T15:00:00Z'), 2);
  assert.equal(daysMissing('2026-09-08T15:00:00Z', '2026-09-09T14:59:00Z'), 1);
  assert.equal(daysMissing(null), null);
  assert.equal(daysMissing('invalid'), null);
});
test('resolved cases stop counting and do not invent a missing resolution date', () => {
  const item = {status:'resolved',last_seen_at:'2026-09-01T00:00:00Z',resolved_at:'2026-09-03T00:00:00Z'};
  assert.equal(missingLabel(item,new Date('2026-09-09')), '실종 3일째 종료');
  delete item.resolved_at;
  assert.equal(missingLabel(item), '종료일 미기록');
});
test('photo paths resolve and unsafe protocols are rejected', () => {
  assert.equal(publicPhotoUrl('dog/a.jpg'), 'https://example.supabase.co/storage/v1/object/public/public-photos/dog/a.jpg');
  assert.equal(publicPhotoUrl('https://photos.example/dog.jpg'), 'https://photos.example/dog.jpg');
  assert.equal(publicPhotoUrl('javascript:alert(1)'), null);
  assert.equal(publicPhotoUrl(''), null);
});
test('cards escape names and link to the existing share page', async () => {
  const html = await renderList({items:[{id:'abc',pet_name:'<script>bad</script>',status:'searching',last_seen_at:'2026-09-01'}],total:25}).text();
  assert.ok(html.includes('href="/find?case=abc"'));
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad</script>'));
  assert.ok(html.includes('등록된 사진이 없어요'));
  assert.ok(html.includes('rel="next"'));
});
test('query only exposes public lost-report fields, filters status and paginates', async t => {
  t.mock.method(globalThis,'fetch',async (url, init) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('kind'),'eq.lost');
    assert.equal(query.get('status'),'eq.searching');
    assert.equal(query.get('offset'),'24');
    assert.equal(query.get('select'),'id,pet_name,photo_url,status,last_seen_at,resolved_at');
    assert.equal(init.headers.Prefer,'count=exact');
    return new Response('[]',{headers:{'content-range':'*/25'}});
  });
  const res = await handler(new Request('https://walk.example/lost?status=searching&page=2'));
  assert.equal(res.status,200);
  assert.ok((await res.text()).includes('첫 페이지로'));
});
test('empty, failed, invalid and HEAD requests remain distinct', async t => {
  const mock = t.mock.method(globalThis,'fetch',async()=>new Response('[]',{headers:{'content-range':'*/0'}}));
  assert.equal((await handler(new Request('https://walk.example/lost?status=bad'))).status,400);
  assert.equal(mock.mock.callCount(),0);
  const empty=await handler(new Request('https://walk.example/lost'));
  assert.equal(empty.status,200);
  assert.ok((await empty.text()).includes('등록된 분실 신고가 없어요'));
  const head=await handler(new Request('https://walk.example/lost',{method:'HEAD'}));
  assert.equal(await head.text(),'');
  mock.mock.mockImplementation(async()=>new Response('{}',{status:500}));
  assert.equal((await handler(new Request('https://walk.example/lost'))).status,503);
  assert.equal((await handler(new Request('https://walk.example/lost',{method:'POST'}))).status,405);
});
