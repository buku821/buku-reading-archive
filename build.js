#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, '每日读书推送');
const output = path.join(__dirname, 'index.html');

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const html = [];
  let listTag = '';
  let paragraph = [];

  const closeParagraph = () => {
    if (paragraph.length) html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listTag) html.push(`</${listTag}>`);
    listTag = '';
  };
  const openList = tag => {
    if (listTag === tag) return;
    closeList();
    html.push(`<${tag}>`);
    listTag = tag;
  };

  for (const line of lines) {
    if (/^# /.test(line) || /^> (作者|类型)：/.test(line)) continue;
    if (/^## /.test(line)) {
      closeParagraph(); closeList();
      html.push(`<h2>${renderInline(line.slice(3))}</h2>`);
    } else if (/^### /.test(line)) {
      closeParagraph(); closeList();
      html.push(`<h3>${renderInline(line.slice(4))}</h3>`);
    } else if (/^\d+\. /.test(line)) {
      closeParagraph();
      openList('ol');
      html.push(`<li>${renderInline(line.replace(/^\d+\. /, ''))}</li>`);
    } else if (/^[-*]\s+/.test(line)) {
      closeParagraph();
      openList('ul');
      html.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (!line.trim()) {
      closeParagraph(); closeList();
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  closeParagraph(); closeList();
  return html.join('\n');
}

function extractQuotes(markdown) {
  const section = (markdown.match(/## 金句\n+([\s\S]*?)(?=\n## |$)/) || [])[1] || '';
  return section.split('\n')
    .map(line => line.replace(/^(?:\d+\.|[-*])\s*/, '').trim())
    .filter(Boolean);
}

function extractReviewLine(markdown) {
  const section = (markdown.match(/## 以后回看时看这 3 行\n+([\s\S]*?)(?=\n## |$)/) || [])[1] || '';
  return section.split('\n')
    .map(line => line.replace(/^(?:\d+\.|[-*])\s*/, '').trim())
    .find(Boolean) || '';
}

const books = fs.readdirSync(sourceDir)
  .filter(file => file.endsWith('.md'))
  .map(file => {
    const markdown = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    const title = ((markdown.match(/^#\s+(.+)$/m) || [])[1] || file.replace('.md', '')).trim();
    const date = (title.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '';
    const author = ((markdown.match(/^>\s*作者：(.+)$/m) || [])[1] || '').trim();
    const category = ((markdown.match(/^>\s*类型：(.+)$/m) || [])[1] || '未分类').trim();
    const reason = (markdown.match(/## 今天为什么读这本\n+([\s\S]*?)(?=\n## |$)/) || [])[1] || '';
    const summary = reason.replace(/\n+/g, ' ').trim().slice(0, 82) + (reason.length > 82 ? '…' : '');
    const topic = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').split('-')[0];
    return { title, author, category, date, topic, summary, quotes: extractQuotes(markdown), review: extractReviewLine(markdown), content: markdownToHtml(markdown) };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

const payload = JSON.stringify(books).replace(/</g, '\\u003c');
const quoteCount = books.reduce((total, book) => total + book.quotes.length, 0);
const activeMonth = books[0]?.date.slice(0, 7) || '';
const monthBooks = books.filter(book => book.date.startsWith(activeMonth));
const monthLabel = activeMonth ? `${activeMonth.slice(0, 4)} 年 ${Number(activeMonth.slice(5))} 月` : '';
const monthCategories = [...new Set(monthBooks.map(book => book.category))];
const monthLead = monthBooks[0];
const monthlyReflection = `<section class="monthly-reflection" aria-label="本月留下什么"><div class="month-heading"><span>MONTHLY NOTE · ${monthLabel}</span><strong>本月留下什么</strong></div><div class="month-stats"><div><b>${monthBooks.length}</b><span>本精读</span></div><div><b>${monthCategories.length}</b><span>种视角</span></div></div><div class="month-body"><div><p class="month-label">这个月在读</p><div class="month-tags">${monthCategories.map(category => `<span>${escapeHtml(category)}</span>`).join('')}</div></div><div class="month-takeaway"><p class="month-label">最该带走的一句</p><blockquote>${escapeHtml(monthLead?.review || '')}</blockquote><small>来自 ${escapeHtml(monthLead?.title.replace(/^\d{4}-\d{2}-\d{2}｜/, '') || '')}</small></div></div></section>`;
const bookDomId = (book, index) => `book-${book.date || 'unknown'}-${index}`;
const cards = books.map((book, index) => `
  <button id="${bookDomId(book, index)}" class="book-card" data-index="${index}" aria-label="阅读${escapeHtml(book.title)}${book.author ? '，作者' + escapeHtml(book.author) : ''}，类型${escapeHtml(book.category)}">
    <span class="book-number">${String(books.length - index).padStart(2, '0')}</span>
    <span class="book-meta"><span class="book-date">${escapeHtml(book.date)}</span><span class="book-category">${escapeHtml(book.category)}</span></span>
    <span class="book-title-row"><span class="book-title">${escapeHtml(book.title.replace(/^\d{4}-\d{2}-\d{2}｜/, ''))}</span>${book.author ? `<span class="book-author">${escapeHtml(book.author)}</span>` : ''}</span>
    <span class="book-summary">${escapeHtml(book.summary)}</span>
    <span class="read-link">打开精读笔记 <b>→</b></span>
  </button>`).join('');

let previousMonth = '';
const timeline = books.map((book, index) => {
  const month = book.date.slice(0, 7);
  const monthLabel = month.replace('-', ' · ');
  const monthMarker = month !== previousMonth ? `<div class="timeline-month">${monthLabel}</div>` : '';
  previousMonth = month;
  return `${monthMarker}<button class="timeline-node${index === 0 ? ' active' : ''}" data-target="${bookDomId(book, index)}"><span class="timeline-dot"></span><span class="timeline-day">${book.date.slice(8)}</span><span class="timeline-book">${escapeHtml(book.title.replace(/^\d{4}-\d{2}-\d{2}｜/, ''))}</span></button>`;
}).join('');

fs.writeFileSync(output, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>buku · 读到这里</title>
  <style>
    :root{--ink:#20221e;--paper:#f6f3ec;--card:#fffdf8;--rust:#bc4d2f;--line:#ded8cc;--muted:#747168}
    *{box-sizing:border-box} body{margin:0;overflow-x:hidden;background:var(--paper);color:var(--ink);font-family:"Songti SC","STSong","Noto Serif SC",serif}
    .wrap{width:min(1120px,calc(100% - 40px));margin:auto}.hero{padding:70px 0 42px;border-bottom:1px solid var(--line)}.timeline-nav{display:none}
    .eyebrow{font:600 12px/1.2 ui-sans-serif,system-ui;letter-spacing:.16em;color:var(--rust);text-transform:uppercase}.hero h1{font-size:64px;font-weight:500;letter-spacing:0;margin:13px 0 15px}.hero p{font-size:18px;line-height:1.8;color:var(--muted);max-width:550px;margin:0}
    .quote-box{margin:30px 0 3px;padding:29px 32px 26px;background:var(--ink);color:#f8f3e9;border-radius:4px}.quote-meta{display:flex;justify-content:space-between;align-items:center;gap:12px;font:600 11px ui-sans-serif,system-ui;letter-spacing:.1em;color:#d8ab99}.quote-text{margin:23px 0 17px;font-size:30px;line-height:1.55}.quote-source{font:13px ui-sans-serif,system-ui;color:#cec7ba}.refresh-quote{border:1px solid #80685c;border-radius:99px;padding:7px 11px;background:transparent;color:#f8f3e9;font:12px ui-sans-serif,system-ui;cursor:pointer}.refresh-quote:hover{background:#403e36}.monthly-reflection{display:grid;grid-template-columns:190px 145px minmax(0,1fr);gap:25px;margin:16px 0 3px;padding:27px 31px;background:#eae2d5;border-radius:4px}.month-heading span,.month-label{display:block;margin:0 0 9px;color:var(--rust);font:600 10px ui-sans-serif,system-ui;letter-spacing:.1em}.month-heading strong{font-size:23px;font-weight:500}.month-stats{display:flex;gap:25px;align-items:center}.month-stats div{display:flex;flex-direction:column;gap:2px}.month-stats b{font:500 34px/1 ui-sans-serif,system-ui}.month-stats span{font:11px ui-sans-serif,system-ui;color:var(--muted)}.month-body{display:grid;grid-template-columns:minmax(120px,.7fr) minmax(250px,1.3fr);gap:27px;border-left:1px solid #d3c8b8;padding-left:27px}.month-tags{display:flex;flex-wrap:wrap;gap:6px}.month-tags span{max-width:100%;border:1px solid #cbbda9;border-radius:99px;padding:4px 8px;color:#6d655b;font:11px ui-sans-serif,system-ui;white-space:normal}.month-takeaway blockquote{margin:0 0 7px;font-size:16px;line-height:1.55}.month-takeaway small{color:var(--muted);font:11px ui-sans-serif,system-ui}.toolbox{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:26px 0 21px}.count{font:600 14px ui-sans-serif,system-ui;color:var(--muted)}.search{width:min(350px,100%);border:1px solid var(--line);border-radius:99px;padding:12px 17px;background:transparent;font:14px ui-sans-serif,system-ui;outline:none}.search:focus{border-color:var(--rust)}
    .monthly-reflection,.month-body,.month-tags,.month-takeaway,.toolbox,.book-card,.book-title-row,.page-content{min-width:0}.hero p,.quote-text,.month-takeaway blockquote,.book-title,.book-author,.book-summary,.count,.page-content{overflow-wrap:anywhere;word-break:break-word}
    .shelf{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-bottom:60px}.book-card{position:relative;display:flex;flex-direction:column;text-align:left;border:1px solid var(--line);border-radius:3px;background:var(--card);padding:26px;min-height:286px;cursor:pointer;color:inherit;font-family:inherit;transition:transform .2s,box-shadow .2s}.book-card:hover{transform:translateY(-4px);box-shadow:7px 8px 0 #e5ded1}.book-number{position:absolute;right:22px;top:18px;color:#d5cec1;font:600 13px ui-sans-serif,system-ui}.book-date,.read-link{display:block;font:600 12px ui-sans-serif,system-ui;letter-spacing:.06em;color:var(--rust)}.book-title-row{display:flex;align-items:baseline;flex-wrap:wrap;gap:9px;margin:24px 24px 13px 0}.book-title{font-size:27px;line-height:1.25}.book-author{font:13px ui-sans-serif,system-ui;color:var(--muted);white-space:nowrap}.book-summary{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;color:var(--muted);font-size:15px;line-height:1.7}.read-link{margin-top:auto;padding-top:22px}.read-link b{font-size:17px;margin-left:4px}.empty{display:none;grid-column:1/-1;padding:55px;text-align:center;color:var(--muted)}
    .shelf{display:grid;grid-template-columns:1fr;gap:16px;padding-bottom:60px}.book-card{position:relative;display:flex;flex-direction:column;text-align:left;border:1px solid var(--line);border-radius:3px;background:var(--card);padding:25px 28px;min-height:232px;cursor:pointer;color:inherit;font-family:inherit;transition:transform .2s,box-shadow .2s}.book-card:hover,.book-card.timeline-focus{transform:translateY(-3px);box-shadow:7px 8px 0 #e5ded1}.book-number{position:absolute;right:25px;top:18px;color:#d5cec1;font:600 13px ui-sans-serif,system-ui}.book-meta{display:flex;align-items:center;gap:10px}.book-date,.read-link{display:block;font:600 12px ui-sans-serif,system-ui;letter-spacing:.06em;color:var(--rust)}.book-category{border:1px solid #e5b7a8;border-radius:99px;padding:3px 8px;color:#a84228;font:600 10px ui-sans-serif,system-ui;letter-spacing:.04em}.book-title-row{display:flex;align-items:baseline;flex-wrap:wrap;gap:9px;margin:19px 24px 10px 0}.book-title{font-size:27px;line-height:1.25}.book-author{font:13px ui-sans-serif,system-ui;color:var(--muted);white-space:nowrap}.book-summary{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-width:850px;color:var(--muted);font-size:15px;line-height:1.7}.read-link{margin-top:auto;padding-top:17px}.read-link b{font-size:17px;margin-left:4px}.empty{display:none;grid-column:1/-1;padding:55px;text-align:center;color:var(--muted)}
    dialog{width:min(1180px,calc(100% - 28px));height:min(92vh,940px);padding:0;border:0;background:transparent;box-shadow:none;overflow:visible}dialog::backdrop{background:#28251e99}.close{position:absolute;z-index:9;right:4px;top:0;border:0;background:none;font:28px/1 ui-sans-serif;cursor:pointer;color:#f8f5ef}.book-reading{display:grid;grid-template-columns:54px minmax(0,1fr) 54px;align-items:center;height:100%;padding:25px 18px 20px}.book-spread{position:relative;display:grid;grid-template-columns:1fr 1fr;height:100%;min-height:0;perspective:2000px}.book-spread:before{content:"";position:absolute;z-index:2;left:50%;top:0;bottom:0;width:1px;background:#d2c9bc;transform:translateX(-.5px)}.book-page,.turn-sheet{position:relative;min-width:0;overflow:hidden;padding:31px 44px;background:#fffdf8}.book-page:after,.turn-sheet:after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 22px #a89b871c}.page-left{box-shadow:inset -12px 0 18px #8175650d}.page-right{box-shadow:inset 12px 0 18px #8175650d}.book-page.blank{display:flex;align-items:center;justify-content:center;color:#afa79a;font:600 12px ui-sans-serif,system-ui;letter-spacing:.18em}.page-imprint{display:flex;justify-content:space-between;gap:12px;height:27px;padding-bottom:11px;border-bottom:1px solid #e8e1d7;color:#9a8173;font:600 10px ui-sans-serif,system-ui;letter-spacing:.08em;white-space:nowrap}.page-imprint span:last-child{overflow:hidden;text-overflow:ellipsis}.page-folio{position:absolute;bottom:16px;left:0;right:0;text-align:center;color:#9a9287;font:11px ui-sans-serif,system-ui}.page-content{height:calc(100% - 45px);overflow:hidden;padding-top:20px;font-size:16px;line-height:1.82}.page-content h2{font-size:25px;line-height:1.35;margin:0 0 18px}.page-content h3{font-size:18px;margin:22px 0 8px}.page-content p{margin:0 0 16px}.page-content ol,.page-content ul{margin:0;padding-left:22px}.page-content li{margin:5px 0;padding-left:3px}.page-content code{background:#efe9df;padding:2px 5px;border-radius:3px}.page-content strong{color:var(--rust)}.page-turner{border:0;background:transparent;color:#f3c0ad;font:31px/1 ui-sans-serif;cursor:pointer;padding:12px}.page-turner:disabled{opacity:.2;cursor:default}.turn-sheet{position:absolute;z-index:6;top:0;bottom:0;width:50%;backface-visibility:hidden;will-change:transform;contain:paint}.turn-sheet.forward{right:0;transform-origin:left center}.turn-sheet.backward{left:0;transform-origin:right center}.turn-sheet.animate.forward{animation:turnForward 1.1s cubic-bezier(.4,0,.18,1)}.turn-sheet.animate.backward{animation:turnBack 1.1s cubic-bezier(.4,0,.18,1)}@keyframes turnForward{0%{transform:translateZ(1px) rotateY(0)}12%{transform:translateZ(1px) rotateY(-3deg)}62%{transform:translateZ(1px) rotateY(-142deg)}84%{transform:translateZ(1px) rotateY(-171deg)}100%{transform:translateZ(1px) rotateY(-180deg)}}@keyframes turnBack{0%{transform:translateZ(1px) rotateY(0)}12%{transform:translateZ(1px) rotateY(3deg)}62%{transform:translateZ(1px) rotateY(142deg)}84%{transform:translateZ(1px) rotateY(171deg)}100%{transform:translateZ(1px) rotateY(180deg)}}
    @media(min-width:1500px){.timeline-nav{display:block;position:fixed;z-index:3;left:max(28px,calc(50% - 760px));top:50%;width:190px;max-height:72vh;overflow:auto;transform:translateY(-50%);padding:8px 0 8px 4px}.timeline-title{margin:0 0 17px;color:var(--muted);font:600 10px ui-sans-serif,system-ui;letter-spacing:.14em}.timeline-list{position:relative;padding-left:0}.timeline-list:before{content:"";position:absolute;left:7px;top:28px;bottom:11px;width:1px;background:#d8d0c5}.timeline-month{position:relative;margin:15px 0 8px;padding-left:22px;color:var(--rust);font:600 11px ui-sans-serif,system-ui;letter-spacing:.09em}.timeline-node{position:relative;display:grid;grid-template-columns:24px 29px 1fr;align-items:center;width:100%;border:0;background:transparent;padding:7px 4px 7px 0;text-align:left;color:var(--muted);cursor:pointer;font-family:inherit}.timeline-dot{position:relative;z-index:1;display:block;width:11px;height:11px;border:2px solid #bdb4a6;border-radius:50%;background:var(--paper);transition:.2s}.timeline-day{font:600 11px ui-sans-serif,system-ui;color:#938d83}.timeline-book{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;transition:.2s}.timeline-node:hover .timeline-book,.timeline-node.active .timeline-book{color:var(--ink)}.timeline-node.active .timeline-dot{border-color:var(--rust);background:var(--rust);box-shadow:0 0 0 4px #bc4d2f1a}.timeline-node.active .timeline-day{color:var(--rust)}}
    @media(max-width:760px){.wrap{width:min(100% - 28px,1120px)}.hero{padding-top:48px}.hero h1{font-size:46px}.quote-box{padding:24px 21px}.quote-text{font-size:23px}.monthly-reflection{grid-template-columns:1fr;gap:20px;padding:23px 21px}.month-stats{order:3}.month-body{grid-template-columns:1fr;border-left:0;border-top:1px solid #d3c8b8;padding:18px 0 0}.toolbox{align-items:stretch;flex-direction:column}.shelf{grid-template-columns:1fr}.book-card{min-height:220px}.book-author{white-space:normal}.book-reading{grid-template-columns:33px minmax(0,1fr) 33px;padding:22px 5px 14px}.book-spread{grid-template-columns:1fr}.book-spread:before,.book-page.page-left{display:none}.book-page,.turn-sheet{padding:25px 27px}.turn-sheet{width:100%;left:0!important;right:auto!important}.page-content{font-size:16px;line-height:1.82}.page-content h2{font-size:23px}.page-turner{font-size:27px;padding:5px}}
  </style>
</head>
<body>
  <aside class="timeline-nav" aria-label="阅读时间书脊"><div class="timeline-title">READING SPINE</div><nav class="timeline-list">${timeline}</nav></aside>
  <main class="wrap"><header class="hero"><div class="eyebrow">buku</div><h1>读到这里</h1><p>每天一本值得精读的书。把观点留下，把判断带走。</p></header>
  <section class="quote-box" aria-label="金句回顾"><div class="quote-meta"><span>金句回顾 · 已收录 ${quoteCount} 句</span><button id="refresh-quote" class="refresh-quote">换一句 ↻</button></div><div id="quote-text" class="quote-text"></div><div id="quote-source" class="quote-source"></div></section>
  ${monthlyReflection}
  <section class="toolbox"><div class="count">已收录 <span id="book-count">${books.length}</span> 本 · 按最新阅读排序</div><input id="search" class="search" type="search" placeholder="搜索书名或关键词" autocomplete="off"></section>
  <section id="shelf" class="shelf">${cards}<div id="empty" class="empty">没有找到匹配的书。换个关键词试试。</div></section></main>
  <dialog id="reader"><button class="close" id="close" aria-label="关闭阅读">×</button><div class="book-reading"><button id="previous-page" class="page-turner" aria-label="上一页">‹</button><div class="book-spread"><article id="left-page" class="book-page page-left"></article><article id="right-page" class="book-page page-right"></article></div><button id="next-page" class="page-turner" aria-label="下一页">›</button></div></dialog>
  <script>
    const books=${payload}; const quotes=books.flatMap(book=>book.quotes.map(text=>({text,source:book.title.replace(/^\\d{4}-\\d{2}-\\d{2}｜/, '')}))); const dialog=document.querySelector('#reader'); const bookSpread=document.querySelector('.book-spread'); const leftPage=document.querySelector('#left-page'); const rightPage=document.querySelector('#right-page'); const prevPage=document.querySelector('#previous-page'); const nextPage=document.querySelector('#next-page'); let readingPages=[]; let readingMeta={date:'',label:''}; let spreadIndex=0; let isTurning=false;
    let quoteIndex=Math.floor(Math.random()*quotes.length); function showQuote(){const quote=quotes[quoteIndex];document.querySelector('#quote-text').textContent='“'+quote.text+'”';document.querySelector('#quote-source').textContent='—— '+quote.source;} showQuote(); document.querySelector('#refresh-quote').onclick=()=>{quoteIndex=(quoteIndex+1+Math.floor(Math.random()*Math.max(1,quotes.length-1)))%quotes.length;showQuote();};
    function splitIntoPages(html){const box=document.createElement('div');box.innerHTML=html;const pages=[];let current=[];let size=0;for(const node of [...box.children]){const length=(node.textContent||'').length;if(node.tagName==='H2'&&current.length){pages.push(current.join(''));current=[];size=0;}if(size+length>520&&current.length>1){pages.push(current.join(''));current=[];size=0;}current.push(node.outerHTML);size+=length;}if(current.length)pages.push(current.join(''));return pages;}
    function singlePage(){return window.matchMedia('(max-width: 760px)').matches;} function renderPage(target,html,pageNumber){if(html){target.classList.remove('blank');target.innerHTML='<div class="page-imprint"><span>'+readingMeta.date+'</span><span>'+readingMeta.label+'</span></div><div class="page-content">'+html+'</div><div class="page-folio">— '+pageNumber+' —</div>';}else{target.classList.add('blank');target.textContent='— 完 —';}}
    function renderSpread(){const step=singlePage()?1:2;renderPage(leftPage,singlePage()?null:readingPages[spreadIndex],spreadIndex+1);renderPage(rightPage,readingPages[spreadIndex+(singlePage()?0:1)],spreadIndex+(singlePage()?1:2));prevPage.disabled=spreadIndex===0;nextPage.disabled=spreadIndex+step>=readingPages.length;}
    function turn(direction){const step=singlePage()?1:2;const nextIndex=spreadIndex+direction*step;if(isTurning||nextIndex<0||nextIndex>=readingPages.length)return;isTurning=true;const source=(direction>0||singlePage()?rightPage:leftPage).innerHTML;spreadIndex=nextIndex;renderSpread();const sheet=document.createElement('article');sheet.className='turn-sheet '+(direction>0?'forward':'backward');sheet.innerHTML=source;bookSpread.appendChild(sheet);sheet.addEventListener('animationend',()=>{sheet.remove();isTurning=false;},{once:true});requestAnimationFrame(()=>requestAnimationFrame(()=>sheet.classList.add('animate')));}
    prevPage.onclick=()=>turn(-1);nextPage.onclick=()=>turn(1);window.addEventListener('resize',()=>{if(dialog.open){spreadIndex=Math.min(spreadIndex,Math.max(0,readingPages.length-(singlePage()?1:2)));renderSpread();}});document.addEventListener('keydown',event=>{if(!dialog.open)return;if(event.key==='ArrowRight')turn(1);if(event.key==='ArrowLeft')turn(-1);});
    document.querySelectorAll('.book-card').forEach(card=>card.addEventListener('click',()=>{const book=books[card.dataset.index];readingPages=splitIntoPages(book.content);readingMeta={date:book.date,label:book.title.replace(/^\\d{4}-\\d{2}-\\d{2}｜/, '')+(book.author?' · '+book.author:'')};spreadIndex=0;renderSpread();dialog.showModal();}));
    document.querySelectorAll('.timeline-node').forEach(node=>node.addEventListener('click',()=>{const target=document.querySelector('#'+node.dataset.target);if(!target)return;document.querySelectorAll('.timeline-node').forEach(item=>item.classList.remove('active'));node.classList.add('active');target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('timeline-focus');window.setTimeout(()=>target.classList.remove('timeline-focus'),900);}));
    document.querySelector('#close').onclick=()=>dialog.close(); dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
    const cards=[...document.querySelectorAll('.book-card')], empty=document.querySelector('#empty'); document.querySelector('#search').addEventListener('input',e=>{const query=e.target.value.trim().toLowerCase();let shown=0;cards.forEach(card=>{const yes=card.innerText.toLowerCase().includes(query);card.style.display=yes?'':'none';if(yes)shown++});empty.style.display=shown?'none':'block'});
  </script>
</body></html>`);
console.log(`已整理 ${books.length} 本书：${output}`);
