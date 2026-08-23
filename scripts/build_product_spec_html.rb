#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"

ROOT = File.expand_path("..", __dir__)
SOURCE = File.join(ROOT, "NICEDOGCLUB_PRODUCT_SPEC.md")
OUTPUT = File.join(ROOT, "product-spec-review.html")

def inline(text)
  escaped = CGI.escapeHTML(text)
  code = []
  escaped.gsub!(/`([^`]+)`/) do
    code << "<code>#{Regexp.last_match(1)}</code>"
    "\u0000CODE#{code.length - 1}\u0000"
  end
  escaped.gsub!(/\*\*([^*]+)\*\*/, '<strong>\1</strong>')
  escaped.gsub!(/\[([^\]]+)\]\(([^)]+)\)/, '<a href="\2">\1</a>')
  code.each_with_index { |value, index| escaped.gsub!("\u0000CODE#{index}\u0000", value) }
  escaped
end

def slug(text, used)
  base = text.gsub(/`([^`]+)`/, '\1').gsub(/[^0-9A-Za-z가-힣]+/, "-").gsub(/^-|-$/, "").downcase
  base = "section" if base.empty?
  used[base] += 1
  used[base] == 1 ? base : "#{base}-#{used[base]}"
end

lines = File.readlines(SOURCE, chomp: true)
used = Hash.new(0)
headings = []
body = []
paragraph = []
list_type = nil
in_code = false
code_lines = []

flush_paragraph = lambda do
  unless paragraph.empty?
    body << "<p>#{inline(paragraph.join(" "))}</p>"
    paragraph.clear
  end
end

close_list = lambda do
  if list_type
    body << "</#{list_type}>"
    list_type = nil
  end
end

i = 0
while i < lines.length
  line = lines[i]

  if in_code
    if line.start_with?("```")
      body << "<pre><code>#{CGI.escapeHTML(code_lines.join("\n"))}</code></pre>"
      code_lines.clear
      in_code = false
    else
      code_lines << line
    end
    i += 1
    next
  end

  if line.start_with?("```")
    flush_paragraph.call
    close_list.call
    in_code = true
    i += 1
    next
  end

  if (match = line.match(/^(\#{1,4})\s+(.+)$/))
    flush_paragraph.call
    close_list.call
    level = match[1].length
    title = match[2]
    id = slug(title, used)
    headings << [level, title, id] if level <= 3
    body << "<h#{level} id=\"#{id}\"><a class=\"anchor\" href=\"##{id}\" aria-label=\"이 섹션 링크 복사\">#</a>#{inline(title)}</h#{level}>"
    i += 1
    next
  end

  if line.start_with?("|", "") && line.include?("|") && i + 1 < lines.length && lines[i + 1].match?(/^\|?[\s|:-]+\|/)
    flush_paragraph.call
    close_list.call
    rows = []
    while i < lines.length && lines[i].include?("|") && !lines[i].strip.empty?
      rows << lines[i].strip.sub(/^\|/, "").sub(/\|$/, "").split("|").map(&:strip)
      i += 1
    end
    headers = rows.shift
    rows.shift
    body << '<div class="table-wrap"><table><thead><tr>' + headers.map { |cell| "<th>#{inline(cell)}</th>" }.join + "</tr></thead><tbody>"
    rows.each { |row| body << "<tr>#{row.map { |cell| "<td>#{inline(cell)}</td>" }.join}</tr>" }
    body << "</tbody></table></div>"
    next
  end

  if (match = line.match(/^[-*]\s+(.+)$/))
    flush_paragraph.call
    if list_type != "ul"
      close_list.call
      list_type = "ul"
      body << "<ul>"
    end
    body << "<li>#{inline(match[1])}</li>"
    i += 1
    next
  end

  if (match = line.match(/^\d+\.\s+(.+)$/))
    flush_paragraph.call
    if list_type != "ol"
      close_list.call
      list_type = "ol"
      body << "<ol>"
    end
    body << "<li>#{inline(match[1])}</li>"
    i += 1
    next
  end

  if (match = line.match(/^>\s?(.*)$/))
    flush_paragraph.call
    close_list.call
    body << "<blockquote>#{inline(match[1])}</blockquote>"
    i += 1
    next
  end

  if line.match?(/^---+$/)
    flush_paragraph.call
    close_list.call
    body << "<hr>"
    i += 1
    next
  end

  if line.strip.empty?
    flush_paragraph.call
    close_list.call
  else
    paragraph << line.strip
  end
  i += 1
end
flush_paragraph.call
close_list.call

toc = headings.select { |level, _, _| level == 2 }.map do |_, title, id|
  "<a href=\"##{id}\" data-target=\"#{id}\"><span>#{title.split(".").first}</span>#{inline(title.sub(/^\d+\.\s*/, ""))}</a>"
end.join

template = <<~HTML
  <!doctype html>
  <html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>우쥬산책 — 서비스 상세 기획안</title>
    <style>
      :root{--ink:#171d1a;--muted:#67716c;--paper:#f4f2ec;--card:#fff;--green:#21624b;--green2:#e2eee8;--orange:#e96524;--orange2:#fff0e7;--blue:#35b6d5;--line:#dfe3df;--shadow:0 14px 44px rgba(22,45,36,.08);--sidebar:290px}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:92px}body{margin:0;color:var(--ink);background:var(--paper);font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo",system-ui,sans-serif;line-height:1.72;word-break:keep-all}.progress{position:fixed;inset:0 auto auto 0;z-index:99;width:0;height:3px;background:linear-gradient(90deg,var(--blue),var(--orange))}.topbar{position:fixed;z-index:20;inset:3px 0 auto 0;height:64px;border-bottom:1px solid rgba(23,29,26,.1);background:rgba(244,242,236,.9);backdrop-filter:blur(16px)}.topbar-in{height:100%;display:flex;align-items:center;gap:18px;padding:0 28px}.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:-.03em}.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;color:#fff;background:var(--green)}.version{padding:4px 8px;border-radius:20px;color:var(--green);background:var(--green2);font-size:11px;font-weight:800}.tools{display:flex;align-items:center;gap:8px;margin-left:auto}.search{width:min(33vw,360px);padding:10px 13px;border:1px solid var(--line);border-radius:11px;outline:none;background:#fff;font:inherit;font-size:13px}.search:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(33,98,75,.12)}button{padding:10px 13px;border:1px solid var(--line);border-radius:11px;background:#fff;cursor:pointer;font-weight:750}.sidebar{position:fixed;z-index:10;inset:67px auto 0 0;width:var(--sidebar);overflow:auto;padding:24px 18px 40px;border-right:1px solid var(--line);background:#eeece6}.sidebar h2{margin:0 10px 14px;color:var(--muted);font-size:11px;letter-spacing:.12em}.toc{display:grid;gap:2px}.toc a{display:grid;grid-template-columns:30px 1fr;gap:5px;padding:8px 10px;border-radius:9px;color:#59635e;text-decoration:none;font-size:12px;line-height:1.35}.toc a span{color:#9aa29e;font-variant-numeric:tabular-nums}.toc a:hover,.toc a.active{color:var(--green);background:#fff;font-weight:800}.main{margin-left:var(--sidebar);padding:100px 34px 80px}.doc{max-width:1040px;margin:auto}.hero{position:relative;overflow:hidden;padding:48px;border-radius:26px;color:#fff;background:linear-gradient(135deg,#173e31,#21624b 62%,#2a785d);box-shadow:var(--shadow)}.hero:after{content:"";position:absolute;right:-70px;bottom:-95px;width:310px;height:310px;border:55px solid rgba(255,255,255,.08);border-radius:50%}.hero .label{font-size:12px;font-weight:900;letter-spacing:.14em;color:#ccefdc}.hero h1{position:relative;z-index:1;margin:14px 0 16px;font-size:clamp(38px,5vw,62px);line-height:1.07;letter-spacing:-.055em}.hero p{position:relative;z-index:1;max-width:650px;margin:0;color:rgba(255,255,255,.75);font-size:16px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.summary div{padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}.summary b{display:block;font-size:20px}.summary span{color:var(--muted);font-size:12px}.content{margin-top:55px}.content>h1:first-child,.content>blockquote:nth-child(2){display:none}h1,h2,h3,h4{letter-spacing:-.035em;line-height:1.25}h2{margin:78px 0 24px;padding-top:18px;border-top:1px solid var(--line);font-size:31px}h3{margin:38px 0 14px;color:var(--green);font-size:21px}h4{margin:28px 0 12px;font-size:17px}.anchor{display:inline-block;width:0;margin-left:-22px;color:transparent;text-decoration:none;font-size:15px}h2:hover .anchor,h3:hover .anchor{color:#aab2ae}p{margin:10px 0;color:#323a36}blockquote{margin:5px 0;padding:8px 14px;border-left:3px solid var(--blue);color:var(--muted);background:#edf8fa}hr{margin:60px 0;border:0;border-top:1px solid var(--line)}ul,ol{margin:12px 0;padding-left:24px}li{margin:5px 0}li::marker{color:var(--orange);font-weight:800}code{padding:.12em .4em;border-radius:5px;color:#9f3f13;background:var(--orange2);font:500 .88em ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word}pre{overflow:auto;padding:22px;border-radius:15px;color:#deebe5;background:#17251f;box-shadow:var(--shadow)}pre code{padding:0;color:inherit;background:none}.table-wrap{overflow:auto;margin:18px 0 30px;border:1px solid var(--line);border-radius:15px;background:#fff;box-shadow:0 5px 22px rgba(20,40,32,.04)}table{width:100%;border-collapse:collapse;font-size:13px}th{position:sticky;top:0;padding:12px 14px;color:#fff;background:var(--green);text-align:left;white-space:nowrap}td{padding:12px 14px;border-top:1px solid #edf0ed;vertical-align:top}tr:hover td{background:#fafbf9}.match{outline:2px solid var(--orange);background:#fff8f3}.empty{display:none;margin:60px auto;padding:35px;border:1px dashed var(--line);border-radius:18px;text-align:center;color:var(--muted);background:#fff}.review-note{margin-top:65px;padding:25px;border:1px solid #f2c7b1;border-radius:18px;background:var(--orange2)}.review-note b{color:var(--orange)}
      @media(max-width:920px){:root{--sidebar:0px}.sidebar{display:none}.main{margin-left:0;padding-inline:18px}.topbar-in{padding-inline:16px}.summary{grid-template-columns:repeat(2,1fr)}.hero{padding:34px 26px}.search{width:min(45vw,300px)}}@media(max-width:560px){.brand .name,.version{display:none}.summary{grid-template-columns:1fr 1fr}.main{padding-top:85px}.tools button{display:none}.search{width:58vw}h2{font-size:25px}}@media print{.topbar,.sidebar,.progress,.tools{display:none!important}.main{margin:0;padding:0}.hero{box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}.content h2{break-after:avoid}.table-wrap{overflow:visible;box-shadow:none}pre,.table-wrap{break-inside:avoid}@page{margin:16mm}}
    </style>
  </head>
  <body>
    <div class="progress" id="progress"></div>
    <header class="topbar"><div class="topbar-in"><div class="brand"><span class="mark">N</span><span class="name">우쥬산책</span></div><span class="version">SPEC v1.2</span><div class="tools"><input id="search" class="search" type="search" placeholder="문서에서 검색 (예: 쓰레기통, 알림)" aria-label="문서 검색"><button id="expand">전체 펼침</button><button onclick="window.print()">인쇄 / PDF</button></div></div></header>
    <aside class="sidebar"><h2>TABLE OF CONTENTS</h2><nav class="toc" id="toc">#{toc}</nav></aside>
    <main class="main"><article class="doc">
      <section class="hero"><span class="label">PRODUCT · UX · ENGINEERING · OPERATIONS</span><h1>서비스 상세 기획안</h1><p>산책 기록부터 분실 신고, 주변 알림, 목격 제보, 공공데이터 기반 쓰레기통 지도까지 실제 구현과 운영에 필요한 기준을 한 문서에서 검토합니다.</p></section>
      <section class="summary"><div><b>30</b><span>기획 섹션</span></div><div><b>3</b><span>핵심 사용자 플로우</span></div><div><b>20+</b><span>운영 설정 변수</span></div><div><b>v1.2</b><span>최신 정책 반영</span></div></section>
      <div class="review-note"><b>현재 쓰레기통 범위</b><br>공공데이터 핀·출처·기준일·<code>없어졌어요</code> 누적 수만 제공합니다. 위치 추가, 정보 수정, <code>있어요</code>, 길찾기 및 외부 지도 연결은 포함하지 않습니다.</div>
      <div class="empty" id="empty">검색 결과가 없습니다.</div>
      <div class="content" id="content">#{body.join("\n")}</div>
    </article></main>
    <script>
      const search=document.getElementById('search'),content=document.getElementById('content'),empty=document.getElementById('empty');
      const sections=[...content.querySelectorAll('h2')].map((h,i)=>{const nodes=[h];let n=h.nextElementSibling;while(n&&n.tagName!=='H2'){nodes.push(n);n=n.nextElementSibling}return {h,nodes}});
      search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase('ko');let found=0;sections.forEach(s=>{const hit=!q||s.nodes.some(n=>n.textContent.toLocaleLowerCase('ko').includes(q));s.nodes.forEach(n=>n.hidden=!hit);if(hit)found++});empty.style.display=found?'none':'block'});
      document.getElementById('expand').addEventListener('click',()=>{search.value='';search.dispatchEvent(new Event('input'));document.querySelectorAll('details').forEach(d=>d.open=true)});
      const links=[...document.querySelectorAll('.toc a')],heads=[...document.querySelectorAll('.content h2')];
      const spy=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.dataset.target===e.target.id))}}),{rootMargin:'-15% 0px -78%'});heads.forEach(h=>spy.observe(h));
      addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;document.getElementById('progress').style.width=(max?scrollY/max*100:0)+'%'},{passive:true});
    </script>
  </body>
  </html>
HTML

File.write(OUTPUT, template)
puts "Created #{OUTPUT}"
