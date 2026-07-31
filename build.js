#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, '每日读书推送');
const output = path.join(__dirname, 'index.html');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function extractSection(markdown, heading) {
  const pattern = new RegExp(`## ${heading}\\n+([\\s\\S]*?)(?=\\n## |$)`);
  return (markdown.match(pattern) || [])[1] || '';
}

function stripListMarker(line) {
  return line.replace(/^(?:\d+\.|[-*])\s*/, '').trim();
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
  const section = extractSection(markdown, '金句');
  return section.split('\n')
    .map(stripListMarker)
    .filter(Boolean);
}

function extractQuoteHighlight(text) {
  const clean = String(text || '').trim().replace(/^[“”"']+|[“”"'。！？；]+$/g, '');
  let candidate = clean;
  let pivot = -1;
  let pivotLength = 0;

  for (const marker of ['而是', '不如']) {
    const index = clean.lastIndexOf(marker);
    if (index > pivot) {
      pivot = index;
      pivotLength = marker.length;
    }
  }

  if (pivot >= 0) {
    candidate = clean.slice(pivot + pivotLength);
  } else {
    const clauses = clean.split(/[，；：]/).map(value => value.trim()).filter(Boolean);
    candidate = clauses.at(-1) || clean;
  }

  const innerClauses = candidate.split(/[，；：]/).map(value => value.trim()).filter(Boolean);
  candidate = innerClauses.at(-1) || candidate;
  candidate = candidate.replace(/^(?:(?:本质上|首先|通常|往往|因为|所以|那么|其实|在于|来自|意味着)|[而也就却仍它这是他])+/, '').trim();

  if (candidate.length > 14) {
    const anchors = ['取决于', '意味着', '需要', '才能', '才会', '仍能', '能让', '敢把', '在于', '来自', '让', '把', '被', '比'];
    let picked = '';
    for (const anchor of anchors) {
      const index = candidate.lastIndexOf(anchor);
      if (index < 0) continue;
      for (const start of [index, index + anchor.length]) {
        const next = candidate.slice(start).trim();
        if (next.length >= 4 && next.length <= 14) {
          picked = next;
          break;
        }
      }
      if (picked) break;
    }
    if (picked) candidate = picked;
  }

  if (candidate.length > 14) candidate = candidate.slice(-14);
  if (candidate.length < 5 && pivot >= 0) {
    const withPivot = clean.slice(pivot).replace(/[。！？；]+$/, '');
    if (withPivot.length <= 14) candidate = withPivot;
  }
  if (candidate.length < 4) {
    const clauses = clean.split(/[，；：]/).map(value => value.trim()).filter(Boolean);
    candidate = clauses.at(-1) || clean;
  }
  if (candidate.endsWith('才会') && candidate.length > 6) candidate = candidate.slice(0, -2);
  if (candidate.endsWith('的') && candidate.length > 6) candidate = candidate.slice(0, -1);
  return candidate.length > 14 ? candidate.slice(-14) : candidate;
}

function extractReviewLine(markdown) {
  const section = extractSection(markdown, '以后回看时看这 3 行');
  return section.split('\n')
    .map(stripListMarker)
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
    const reason = extractSection(markdown, '今天为什么读这本');
    const summary = reason.replace(/\n+/g, ' ').trim().slice(0, 82) + (reason.length > 82 ? '…' : '');
    const topic = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').split('-')[0];
    const quotes = extractQuotes(markdown);
    return {
      title,
      author,
      category,
      date,
      topic,
      summary,
      quotes,
      quoteHighlights: quotes.map(extractQuoteHighlight),
      review: extractReviewLine(markdown),
      content: markdownToHtml(markdown)
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

const payload = JSON.stringify(books).replace(/</g, '\\u003c');
const quoteCount = books.reduce((total, book) => total + book.quotes.length, 0);
const activeMonth = books[0]?.date.slice(0, 7) || '';
const monthBooks = books.filter(book => book.date.startsWith(activeMonth));
const monthLabel = activeMonth ? `${activeMonth.slice(0, 4)} 年 ${Number(activeMonth.slice(5))} 月` : '';
const monthCategories = [...new Set(monthBooks.map(book => book.category))];
const monthLead = monthBooks[0];
const bookDomId = (book, index) => `book-${book.date || 'unknown'}-${index}`;
const displayTitle = book => (book?.title || '').replace(/^\d{4}-\d{2}-\d{2}｜/, '');
const latest = books[0];
const latestIndexLabel = String(books.length).padStart(2, '0');
const latestDateParts = latest?.date ? latest.date.split('-') : ['2026', '07', '29'];
const tones = ['orange', 'blue', 'green'];
const booksByIndex = new Map(books.map((book, index) => [book, index]));
const booksByDay = new Map();
monthBooks.forEach(book => {
  const day = Number(book.date.slice(8));
  const entries = booksByDay.get(day) || [];
  entries.push(booksByIndex.get(book));
  booksByDay.set(day, entries);
});
const activeYear = Number(activeMonth.slice(0, 4)) || 2026;
const activeMonthNumber = Number(activeMonth.slice(5)) || 7;
const firstDay = activeMonth ? new Date(activeYear, activeMonthNumber - 1, 1).getDay() : 3;
const calendarOffset = (firstDay + 6) % 7;
const daysInMonth = activeMonth ? new Date(activeYear, activeMonthNumber, 0).getDate() : 31;
const now = new Date();
const currentDay = now.getFullYear() === activeYear && now.getMonth() + 1 === activeMonthNumber ? now.getDate() : -1;
const calendarCells = Array.from({ length: calendarOffset + daysInMonth }, (_, index) => {
  const day = index - calendarOffset + 1;
  if (day < 1) return '<span class="calendar-day empty-day"></span>';
  const dayBooks = booksByDay.get(day) || [];
  const bookIndex = dayBooks[0];
  const isLatest = latest?.date && Number(latest.date.slice(8)) === day;
  const className = ['calendar-day', bookIndex !== undefined ? 'has-book' : '', isLatest ? 'is-today' : '', day === currentDay ? 'is-current-day' : ''].filter(Boolean).join(' ');
  const attrs = bookIndex !== undefined ? ` type="button" data-open-index="${bookIndex}"` : ' type="button" disabled';
  return `<button class="${className}"${attrs}><span>${day}</span>${bookIndex !== undefined ? '<i></i>' : ''}${dayBooks.length > 1 ? `<em>${dayBooks.length}</em>` : ''}</button>`;
}).join('');
const featureCard = latest ? `
  <section id="today-panel" class="panel active-panel">
    <article class="feature-card">
      <div class="date-rail"><span>${escapeHtml(latestDateParts[0])}</span><b>${escapeHtml(latestDateParts[1])}</b><b>${escapeHtml(latestDateParts[2])}</b><small>第 ${latestIndexLabel} 本</small></div>
      <div class="feature-copy">
        <h2>${escapeHtml(displayTitle(latest))}</h2>
        <p class="feature-author">${escapeHtml(latest.author || '')}</p>
        <p class="feature-category">${escapeHtml(latest.category || '')}</p>
        <span class="short-line"></span>
      </div>
      <span class="blue-shape" aria-hidden="true"></span>
    </article>
    <button class="primary-cta open-reader" type="button" data-open-index="0"><span class="cta-action">开始阅读</span><span class="cta-takeaway">${escapeHtml(latest.review || '')}</span><span class="icon" aria-hidden="true">→</span></button>
    <section class="quote-box" aria-label="金句回顾" data-count="${quoteCount}">
      <div class="quote-count"><b>${quoteCount}</b><span>已收录</span></div>
      <div class="quote-meta"><span>金句回顾<span class="quote-meta-count"> · 已收录 ${quoteCount} 句</span></span><button id="refresh-quote" class="refresh-quote" type="button">换一句 <span aria-hidden="true">↻</span></button></div>
      <div id="quote-text" class="quote-text"></div>
      <div id="quote-source" class="quote-source"></div>
    </section>
    <section class="monthly-reflection" aria-label="本月留下什么">
      <div class="month-heading"><span>MONTHLY NOTE · ${monthLabel}</span><strong>本月留下什么</strong></div>
      <div class="month-stats"><div><b>${monthBooks.length}</b><span>本精读</span></div><div><b>${monthCategories.length}</b><span>种视角</span></div></div>
      <div class="month-takeaway"><p class="month-label">最该带走的一句</p><blockquote>${escapeHtml(monthLead?.review || '')}</blockquote><small>来自 ${escapeHtml(displayTitle(monthLead) || '')}</small></div>
    </section>
  </section>` : '<section id="today-panel" class="panel active-panel empty-state">还没有读书记录。</section>';
const calendarPanel = `
  <section id="calendar-panel" class="panel" hidden>
    <header class="calendar-intro"><h2>书单日历</h2><p>把每天读过的书，留在时间里。</p></header>
    <section class="calendar-card" aria-label="书单日历">
      <div class="calendar-head"><h2>${activeMonth ? activeMonth.replace('-', ' · ') : '书单日历'}</h2><div>${monthBooks.length} 本精读 / ${monthCategories.length} 种视角</div></div>
      <div class="week-row"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      <div class="calendar-grid">${calendarCells}</div>
    </section>
    <section class="month-dashboard"><span><b>${monthBooks.length}</b> 本精读</span><span><b>${monthCategories.length}</b> 种视角</span><span>已读 <b>${books.length}/${books.length}</b></span></section>
    <section class="toolbox"><div class="count">已收录 <span id="book-count">${books.length}</span> 本 · 按最新阅读排序</div><input id="search" class="search" type="search" placeholder="搜索书名或关键词" autocomplete="off"></section>
    <section id="shelf" class="shelf">
      <div class="spine-line" aria-hidden="true"></div>
`;
const cards = books.map((book, index) => `
  <button id="${bookDomId(book, index)}" class="book-card open-reader tone-${tones[index % tones.length]}" type="button" data-open-index="${index}" data-date="${escapeHtml(book.date.slice(5).replace('-', '.'))}" aria-label="阅读${escapeHtml(book.title)}${book.author ? '，作者' + escapeHtml(book.author) : ''}，类型${escapeHtml(book.category)}">
    <span class="book-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="book-title-row"><span class="book-title">${escapeHtml(displayTitle(book))}</span><span class="book-category">${escapeHtml(book.category)}</span></span>
    <span class="icon" aria-hidden="true">→</span>
  </button>`).join('');

const quotePanel = `
  <section id="quotes-panel" class="panel quote-archive-panel" hidden>
    <article class="quote-poster" aria-label="金句海报">
      <header class="quote-poster-head">
        <div><span>QUOTE POSTER</span><strong>金句回顾</strong></div>
        <div class="quote-poster-index"><b id="archive-quote-current">01</b><span>/ ${String(quoteCount).padStart(2, '0')}</span></div>
      </header>
      <div class="quote-poster-body"><blockquote id="archive-quote-text"></blockquote></div>
      <footer class="quote-poster-foot">
        <div class="quote-poster-source"><span id="archive-quote-source"></span><small id="archive-quote-author"></small></div>
        <div class="quote-poster-actions"><button id="archive-open-source" class="open-reader" type="button" data-open-index="0">读这本 <span aria-hidden="true">→</span></button><button id="archive-refresh-quote" type="button">换一句 <span aria-hidden="true">↻</span></button></div>
      </footer>
    </article>
  </section>`;

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
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>buku · 读到这里</title>
  <style>
    :root{--cream:#F8F3EF;--blue:#BE411C;--orange:#BE411C;--green:#BE411C;--ink:#2E3030;--muted:#70777A;--line:#D9CEC4;--shadow:none;--display:"Songti SC","STSongti-SC-Regular","Noto Serif CJK SC","SimSun",serif;--serif:"Songti SC","STSongti-SC-Regular","Noto Serif CJK SC","SimSun",serif;--sans:"Avenir Next","Avenir","PingFang SC","Hiragino Sans GB",ui-sans-serif,system-ui,sans-serif;--num:"DIN Alternate","Avenir Next Condensed","Avenir Next",ui-sans-serif,system-ui,sans-serif}
    *{box-sizing:border-box} [hidden]{display:none!important}
    body{margin:0;overflow-x:hidden;background:var(--cream);color:var(--ink);font-family:var(--serif);text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
    button,input{font:inherit;color:inherit} button{cursor:pointer}
    .brand-row{position:relative;z-index:20;display:flex;align-items:center;justify-content:space-between}
    .feature-category,.quote-count,.calendar-intro,.cta-takeaway{display:none}.calendar-day em{position:absolute;right:3px;top:2px;color:var(--orange);font:900 10px var(--sans);font-style:normal}
    .tab:focus{outline:none}.tab:focus-visible{box-shadow:inset 0 -3px 0 currentColor}
    .app-shell{position:relative;width:min(430px,100%);min-height:100vh;margin:auto;background:var(--cream);overflow:hidden}
    .hero{position:relative;overflow:hidden;min-height:326px;padding:34px 24px 76px;background:var(--cream)}
    .hero:before{content:"";position:absolute;z-index:0;left:-86px;top:-42px;width:410px;height:332px;background:var(--green);border-bottom-right-radius:170px 118px}
    .hero:after{content:"";position:absolute;z-index:1;right:-62px;top:-58px;width:256px;height:178px;background:var(--cream);border-bottom-left-radius:170px}
    .brand{position:relative;z-index:3;font:900 15px/1 var(--sans);letter-spacing:.24em}
    .brand:after{content:"✱";position:absolute;right:-316px;top:-5px;font:900 29px/1 var(--sans);letter-spacing:0}
    .hero h1{position:relative;z-index:2;isolation:isolate;margin:31px 0 4px;font-size:56px;font-weight:900;line-height:.98;letter-spacing:0}
    .hero h1:before{content:"";position:absolute;z-index:-1;right:-192px;top:132px;width:138px;height:138px;background:var(--orange);border-radius:50%}
    .hero p{position:relative;z-index:2;max-width:324px;margin:13px 0 0;font-size:16px;line-height:1.68;font-weight:800}
    .hero p:before{content:"";position:absolute;left:-88px;top:-12px;width:78px;height:132px;background:var(--blue);border-radius:0 76px 76px 0}
    .hero p:after{content:"↷";position:absolute;right:-52px;top:-104px;font:900 70px/1 var(--sans);transform:rotate(-15deg)}
    .title-line,.short-line{display:block;height:3px;background:var(--green);border-radius:99px;transform:rotate(-2deg)}
    .title-line{position:relative;z-index:2;width:178px;margin-top:7px;background:var(--ink)}.short-line{width:42px;background:var(--orange);margin:19px auto 0}
    .tabs{position:relative;z-index:5;display:grid;grid-template-columns:repeat(3,1fr);height:74px;margin:-56px 24px 18px;padding:0 18px;background:var(--cream);border:1px solid var(--line);border-radius:5px 5px 0 0;box-shadow:var(--shadow)}
    .tab{position:relative;border:0;background:transparent;padding:20px 6px 17px;font-weight:900;font-size:20px}.tab.active:after{content:"";position:absolute;left:26px;right:26px;bottom:12px;height:3px;background:var(--ink);border-radius:99px;transform:rotate(-2deg)}
    .panel{padding:0 24px 28px}
    .feature-card{position:relative;overflow:hidden;display:grid;grid-template-columns:104px minmax(0,1fr);min-height:326px;background:var(--cream);border:0;border-radius:8px;box-shadow:var(--shadow)}
    .feature-card:before{content:"";position:absolute;z-index:0;left:-88px;top:78px;width:116px;height:164px;background:var(--blue);border-radius:0 92px 92px 0}
    .date-rail{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--orange);color:var(--cream);font-family:var(--num);font-weight:900}
    .date-rail span,.date-rail b{line-height:1}.date-rail span{font-size:16px}.date-rail b{font-size:23px}.date-rail b:before,.date-rail span:after{content:"";display:block;width:16px;height:2px;margin:10px auto 0;background:var(--cream);border-radius:99px}.date-rail small{margin-top:10px;color:var(--ink);font:900 13px var(--sans)}
    .feature-copy{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;min-width:0;text-align:center;padding:38px 28px 38px 18px}.section-kicker{margin:0 0 26px;font-size:23px;font-weight:900}
    .section-kicker:after{content:"";display:block;width:98px;height:3px;margin:10px auto 0;background:var(--ink);border-radius:99px;transform:rotate(-2deg)}
    .feature-copy h2{margin:0;font-size:34px;line-height:1.34;font-weight:900;overflow-wrap:anywhere;word-break:break-word}.feature-author{margin:22px 0 0;font-size:17px;font-weight:800}
    .blue-shape{position:absolute;right:-78px;bottom:0;width:154px;height:238px;background:var(--blue);border-radius:112px 0 0 0;background-image:repeating-radial-gradient(ellipse at 48% 58%,transparent 0 13px,color-mix(in srgb,var(--ink) 34%,transparent) 14px 15px,transparent 16px 24px)}
    .primary-cta{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:84px;margin:18px 0 20px;padding:18px 25px;border:0;border-radius:10px;background:var(--blue);color:var(--ink);font-size:27px;font-weight:900;box-shadow:0 16px 32px color-mix(in srgb,var(--blue) 34%,transparent)}
    .primary-cta:before{content:"↝";color:var(--green);font:900 36px/1 var(--sans);transform:rotate(-10deg)}.primary-cta span:first-child{position:relative;z-index:1;padding:4px 28px}.primary-cta span:first-child:before{content:"";position:absolute;z-index:-1;left:-8px;right:-8px;top:1px;bottom:1px;background:var(--cream);border-radius:58% 42% 48% 52%;transform:rotate(-2deg)}.primary-cta .icon{font-size:32px;color:var(--ink)}
    .quote-box,.monthly-reflection,.calendar-card,.book-card,.content-card{background:var(--cream);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 34px color-mix(in srgb,var(--ink) 8%,transparent)}
    .quote-box{position:relative;padding:28px 22px;margin-top:20px}.quote-box:before{content:"“";position:absolute;left:20px;top:94px;font:900 38px/1 var(--sans)}.quote-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;font:900 12px var(--sans);letter-spacing:.08em}.refresh-quote{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;border:1px solid var(--orange);border-radius:99px;background:transparent;padding:7px 11px;font:900 12px var(--sans)}.quote-text{margin:24px 12px 14px 20px;font-size:23px;line-height:1.7;font-weight:800;overflow-wrap:anywhere;word-break:break-word}.quote-text:after{content:"";display:block;width:132px;height:3px;margin-top:14px;background:var(--green);border-radius:99px;transform:rotate(-3deg)}.quote-source{font:800 13px var(--sans)}
    .monthly-reflection{margin-top:18px;padding:18px}.month-heading span,.month-label{display:block;margin:0 0 8px;color:var(--orange);font:900 11px var(--sans);letter-spacing:.14em}.month-heading strong{font-size:24px}.month-stats{display:flex;gap:18px;margin:15px 0}.month-stats b{font:900 30px/1 var(--num)}.month-stats span{margin-left:5px;font:900 12px var(--sans)}.month-takeaway blockquote{margin:0 0 9px;font-size:17px;line-height:1.65;font-weight:800;overflow-wrap:anywhere;word-break:break-word}.month-takeaway small{font:800 12px var(--sans)}
    .calendar-card{padding:24px 20px 22px;border:0;border-radius:12px;box-shadow:var(--shadow)}.calendar-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}.calendar-head h2{margin:0;font-size:28px}.calendar-head h2:after{content:"";display:block;width:116px;height:3px;margin-top:8px;background:var(--green);border-radius:99px;transform:rotate(-3deg)}.calendar-head div{font:900 12px var(--sans)}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:-1px}.orange-dot{background:var(--orange)}.blue-dot{background:var(--blue)}.week-row,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.week-row{margin-bottom:8px;text-align:center;font:900 13px var(--sans)}.calendar-day{position:relative;display:grid;place-items:center;min-height:39px;border:0;background:transparent;font:900 20px var(--num)}.calendar-day.has-book{color:var(--blue)}.calendar-day.is-today{background:var(--orange);color:var(--cream);border-radius:50%}.calendar-day i{position:absolute;bottom:1px;width:5px;height:5px;background:var(--orange);border-radius:50%}
    .month-dashboard{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;margin:18px 0;padding:12px 0;border-radius:8px;background:var(--blue);color:var(--cream);box-shadow:0 16px 28px color-mix(in srgb,var(--blue) 28%,transparent)}.month-dashboard span{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;border-right:1px solid var(--cream);font:900 13px ui-sans-serif,system-ui}.month-dashboard span:last-child{border-right:0}.month-dashboard b{font-size:21px;color:var(--ink)}
    .toolbox{display:flex;flex-direction:column;gap:11px;margin-bottom:15px}.count{font:900 13px ui-sans-serif,system-ui}.search{width:100%;border:1px solid color-mix(in srgb,var(--ink) 22%,transparent);border-radius:4px;background:var(--cream);padding:13px 15px;font:800 15px ui-sans-serif,system-ui;outline:none}.search:focus{box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 42%,transparent)}
    .shelf{position:relative;display:grid;gap:10px;padding-bottom:20px}.spine-line{position:absolute;left:14px;top:0;bottom:0;width:2px;background:var(--ink)}.book-card{position:relative;z-index:1;display:grid;grid-template-columns:64px 66px minmax(0,1fr) 30px;align-items:center;gap:10px;width:100%;min-height:62px;padding:0 10px 0 0;text-align:left;font-family:inherit}.book-card:hover,.book-card.timeline-focus{transform:translateX(3px)}.book-number{display:grid;place-items:center;align-self:stretch;border-radius:8px 0 0 8px;background:var(--orange);color:var(--cream);font:900 21px ui-sans-serif,system-ui}.book-thumb{display:grid;place-items:center;height:50px;background:var(--green);font:900 12px/1.1 ui-sans-serif,system-ui;text-align:center}.tone-blue .book-number{background:var(--blue)}.tone-blue .book-thumb{background:var(--cream)}.tone-green .book-number{background:var(--green);color:var(--ink)}.tone-green .book-thumb{background:var(--orange);color:var(--cream)}.book-title-row{display:flex;flex-direction:column;gap:4px;min-width:0}.book-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:900}.book-category{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:900 11px ui-sans-serif,system-ui;color:var(--green)}.book-card .icon{font:900 24px ui-sans-serif,system-ui}.empty{display:none;padding:32px 0;text-align:center;font-weight:900}
    dialog{width:min(430px,100vw);max-width:100vw;height:100vh;max-height:100vh;margin:0 auto;padding:0;border:0;background:transparent}dialog::backdrop{background:color-mix(in srgb,var(--ink) 45%,transparent)}dialog button:focus{outline:0}.reader-shell{display:flex;flex-direction:column;height:100%;background:var(--cream);overflow:hidden}.reader-hero{position:relative;overflow:hidden;flex:0 0 528px;padding:36px 24px 34px;background:var(--cream)}.reader-hero:before{content:"";position:absolute;z-index:0;left:-86px;top:-54px;width:456px;height:550px;background:var(--green);border-bottom-right-radius:210px 148px}.reader-hero:after{content:"";position:absolute;z-index:1;right:-36px;bottom:-1px;width:160px;height:118px;background:var(--blue);border-radius:108px 0 0 0;background-image:repeating-radial-gradient(ellipse at 58% 48%,transparent 0 13px,color-mix(in srgb,var(--ink) 32%,transparent) 14px 15px,transparent 16px 24px)}.reader-brand{position:relative;z-index:2;margin-bottom:54px;font:900 15px/1 var(--sans);letter-spacing:.24em}.reader-top{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:72px}.reader-top:after{content:"↶";position:absolute;right:68px;top:36px;font:900 58px/1 var(--sans);transform:rotate(-28deg)}.close{display:inline-flex;align-items:center;gap:8px;min-width:0;border:0;background:transparent;padding:0;font:900 20px var(--sans)}.close .icon{font-size:27px}.page-count{position:relative;z-index:3;flex:0 0 auto;font:900 18px var(--sans);color:color-mix(in srgb,var(--ink) 35%,transparent)}.page-count:before{content:"";position:absolute;z-index:-1;right:-56px;top:-96px;width:196px;height:150px;background:var(--cream);border-bottom-left-radius:155px}.page-count b{font-size:30px;color:var(--ink)}.reader-kicker{position:relative;z-index:2;display:inline-block;margin-bottom:26px;font-size:23px;font-weight:900}.reader-kicker:after{content:"";display:block;width:112px;height:3px;margin-top:8px;background:color-mix(in srgb,var(--green) 64%,var(--ink));border-radius:99px;transform:rotate(-2deg)}.reader-title{position:relative;z-index:2;margin:0;max-width:382px;font-size:42px;line-height:1.17;font-weight:900;overflow-wrap:anywhere;word-break:keep-all}.reader-title:after{content:"";display:block;width:168px;height:3px;margin-top:10px;background:color-mix(in srgb,var(--green) 64%,var(--ink));border-radius:99px;transform:rotate(-2deg)}.reader-bookline{position:relative;z-index:2;margin:20px 0 0;font-size:18px;font-weight:900}
    .reader-body{flex:1;overflow:auto;padding:28px 18px 18px}.progress-line{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:10px 14px;margin-bottom:22px;font:900 15px var(--sans)}.progress-line b{font-size:28px}.progress-track{height:8px;background:color-mix(in srgb,var(--ink) 10%,transparent);border-radius:99px;overflow:hidden}.progress-fill{display:block;height:100%;width:0;background:var(--blue);border-radius:99px}#reader-time{grid-column:3;justify-self:end}.content-card{padding:30px 24px;border:0;border-radius:20px;box-shadow:0 18px 45px color-mix(in srgb,var(--ink) 8%,transparent)}.reader-page-content{font-size:22px;line-height:1.9;font-weight:500;overflow-wrap:anywhere;word-break:break-word}.reader-page-content h3{margin:22px 0 8px;font-size:23px;line-height:1.35}.reader-page-content p{margin:0 0 24px}.reader-page-content ol,.reader-page-content ul{margin:0 0 24px;padding-left:25px}.reader-page-content li{margin:8px 0}.reader-page-content strong{background:linear-gradient(transparent 64%,color-mix(in srgb,var(--green) 78%,transparent) 0);padding:0 2px}.judgement{margin-top:24px;padding:16px 18px;background:var(--green);border:0;border-radius:5px;font-size:21px;line-height:1.8;font-weight:900;overflow-wrap:anywhere;word-break:break-word}.judgement:after{content:"↝";float:right;font:900 32px/1 var(--sans);margin:4px 0 0 8px}.reader-bottom{display:grid;grid-template-columns:1fr 1.35fr;margin-top:18px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--cream)}.reader-bottom button{min-height:76px;border:0;border-right:1px solid var(--line);background:transparent;font:900 16px var(--sans)}.reader-bottom button:last-child{border-right:0;background:var(--blue);color:var(--cream);font-size:22px}.reader-bottom button:disabled{cursor:default;opacity:.45}.reader-bottom .icon{font-size:25px;margin:0 7px}
    .hero h1,.tab,.section-kicker,.feature-copy h2,.quote-text,.month-heading strong,.calendar-head h2,.book-title,.reader-kicker,.reader-title,.reader-page-content h3,.judgement{font-family:var(--display)}
    .hero p,.feature-author,.quote-text,.month-takeaway blockquote,.reader-page-content{font-family:var(--serif)}
    .brand,.quote-meta,.refresh-quote,.month-heading span,.month-label,.month-stats span,.month-takeaway small,.calendar-head div,.week-row,.count,.search,.book-thumb,.book-category,.close,.reader-brand,.reader-bottom button{font-family:var(--sans)}
    .date-rail,.book-number,.calendar-day,.month-stats b,.month-dashboard,.page-count,.progress-line b{font-family:var(--num)}
    .hero h1{font-weight:900}.hero p{font-weight:800}.feature-copy h2,.reader-title{font-weight:900}.reader-page-content{font-weight:400}.quote-text{font-weight:700}.tab,.section-kicker,.feature-author{font-weight:900}
    .app-shell.calendar-mode .hero{min-height:90px;padding:34px 24px 18px;background:var(--cream)}
    .app-shell.calendar-mode .hero:before,.app-shell.calendar-mode .hero:after,.app-shell.calendar-mode .hero h1,.app-shell.calendar-mode .hero p,.app-shell.calendar-mode .title-line,.app-shell.calendar-mode .brand:after,.app-shell.calendar-mode .hero h1:before{display:none}
    .app-shell.calendar-mode .tabs{height:62px;margin:0 24px 18px;padding:0;background:transparent;border:0;box-shadow:none}
    .app-shell.calendar-mode .tab{font-size:20px;padding:14px 6px 15px}.app-shell.calendar-mode .tab.active:after{left:38px;right:38px;bottom:10px}
    .app-shell.calendar-mode .panel{padding-top:0}.app-shell.calendar-mode .calendar-card{margin-top:0}
    .timeline-nav{display:none}@media(max-width:430px){.hero h1{font-size:54px}.feature-copy h2{font-size:32px}.reader-title{font-size:42px}.reader-page-content{font-size:22px}}@media(max-width:374px){.hero h1{font-size:48px}.feature-copy h2{font-size:28px}.reader-title{font-size:38px}.tabs{margin-left:18px;margin-right:18px}.panel{padding-left:18px;padding-right:18px}}@media(min-width:760px){body{padding:28px 0}.app-shell,dialog{border-radius:8px;box-shadow:0 18px 48px color-mix(in srgb,var(--ink) 18%,transparent)}dialog{margin:auto}}
    .hero{min-height:236px;padding:26px 20px 54px}.hero:before{left:-78px;top:-42px;width:338px;height:252px;border-bottom-right-radius:142px 92px}.hero:after{right:-76px;top:-70px;width:216px;height:148px}.brand{font-size:13px}.brand:after{right:-302px;font-size:24px}.hero h1{margin:27px 0 3px;font-size:43px;line-height:1.03}.hero h1:before{right:-142px;top:104px;width:96px;height:96px}.hero p{max-width:286px;margin-top:10px;font-size:14px;line-height:1.58}.hero p:before{left:-76px;top:-2px;width:56px;height:92px}.hero p:after{right:-42px;top:-86px;font-size:52px}.title-line{width:142px;margin-top:5px}
    .tabs{height:58px;margin:-38px 20px 14px;padding:0 12px;box-shadow:0 10px 26px color-mix(in srgb,var(--ink) 8%,transparent)}.tab{padding:15px 6px 13px;font-size:17px}.tab.active:after{left:24px;right:24px;bottom:9px}.panel{padding:0 20px 22px}
    .feature-card{grid-template-columns:78px minmax(0,1fr);min-height:218px;border-radius:8px;box-shadow:0 12px 30px color-mix(in srgb,var(--ink) 8%,transparent)}.feature-card:before{left:-70px;top:66px;width:88px;height:124px}.date-rail{gap:8px}.date-rail span{font-size:13px}.date-rail b{font-size:18px}.date-rail b:before,.date-rail span:after{width:13px;margin-top:7px}.date-rail small{margin-top:7px;font-size:11px}.feature-copy{padding:24px 18px 22px 12px}.section-kicker{margin-bottom:18px;font-size:18px}.section-kicker:after{width:82px;margin-top:7px}.feature-copy h2{font-size:25px;line-height:1.32}.feature-author{margin-top:14px;font-size:14px}.short-line{margin-top:12px}.blue-shape{right:-68px;width:118px;height:164px}
    .primary-cta{min-height:62px;margin:14px 0 16px;padding:12px 20px;border-radius:9px;font-size:21px;box-shadow:0 10px 24px color-mix(in srgb,var(--blue) 30%,transparent)}.primary-cta:before{font-size:27px}.primary-cta span:first-child{padding:3px 24px}.primary-cta .icon{font-size:27px}
    .quote-box{padding:20px 18px;margin-top:16px}.quote-box:before{top:72px;font-size:30px}.quote-meta{font-size:11px}.refresh-quote{padding:6px 10px;font-size:11px}.quote-text{margin:18px 8px 12px 18px;font-size:18px;line-height:1.58}.monthly-reflection{margin-top:14px;padding:16px}.month-heading strong{font-size:20px}.month-stats{margin:12px 0}.month-stats b{font-size:24px}.month-takeaway blockquote{font-size:15px;line-height:1.55}
    .calendar-card{padding:20px 18px}.calendar-head h2{font-size:24px}.calendar-day{min-height:35px;font-size:18px}.month-dashboard{margin:14px 0;padding:10px 0}.app-shell.calendar-mode .hero{min-height:76px;padding:28px 20px 12px}.app-shell.calendar-mode .tabs{height:52px;margin:0 20px 14px}.app-shell.calendar-mode .tab{font-size:17px;padding:13px 6px 12px}.app-shell.calendar-mode .tab.active:after{left:34px;right:34px}
    .reader-hero{flex-basis:318px;padding:24px 20px 24px}.reader-hero:before{left:-80px;top:-62px;width:392px;height:336px;border-bottom-right-radius:172px 104px}.reader-hero:after{right:-44px;width:126px;height:90px}.reader-brand{margin-bottom:30px;font-size:13px}.reader-top{margin-bottom:38px}.reader-top:after{right:56px;top:28px;font-size:42px}.close{font-size:17px}.close .icon{font-size:24px}.page-count{font-size:15px}.page-count:before{right:-54px;top:-78px;width:166px;height:118px}.page-count b{font-size:25px}.reader-kicker{margin-bottom:16px;font-size:18px}.reader-kicker:after{width:92px;margin-top:6px}.reader-title{max-width:340px;font-size:30px;line-height:1.2}.reader-title:after{width:134px;margin-top:8px}.reader-bookline{margin-top:15px;font-size:15px}.reader-body{padding:18px 16px 16px}.progress-line{gap:8px 10px;margin-bottom:16px;font-size:13px}.progress-line b{font-size:23px}.content-card{padding:22px 20px;border-radius:16px}.reader-page-content{font-size:18px;line-height:1.78}.reader-page-content h3{font-size:19px}.reader-page-content p{margin-bottom:18px}.judgement{margin-top:18px;padding:13px 14px;font-size:17px;line-height:1.68}.reader-bottom{margin-top:14px;border-radius:14px}.reader-bottom button{min-height:62px;font-size:14px}.reader-bottom button:last-child{font-size:18px}
    .hero{min-height:208px;padding:24px 20px 46px}.hero:before{width:318px;height:224px;border-bottom-right-radius:128px 82px}.hero h1{font-size:36px;line-height:1.05;margin-top:24px}.hero h1:before{top:86px;width:78px;height:78px}.hero p{max-width:270px;font-size:13px;line-height:1.5}.title-line{width:122px}
    .tabs{height:50px;margin:-30px 20px 12px}.tab{font-size:15px;padding:12px 6px 10px}.tab.active:after{bottom:7px}
    .feature-card{grid-template-columns:70px minmax(0,1fr);min-height:174px}.feature-copy{padding:20px 18px 18px 10px}.feature-copy h2{font-size:22px;line-height:1.28}.feature-author{margin-top:11px;font-size:13px}.date-rail span{font-size:12px}.date-rail b{font-size:16px}.date-rail small{font-size:10px}.blue-shape{right:-74px;width:112px;height:134px}.short-line{margin-top:10px}
    .primary-cta{min-height:52px;margin:12px 0 14px;font-size:18px}.primary-cta:before{font-size:23px}.primary-cta .icon{font-size:23px}.quote-box{padding:17px 16px}.quote-box:before{top:62px;font-size:26px}.quote-text{font-size:16px;line-height:1.52}.quote-source{font-size:12px}.monthly-reflection{padding:14px}.month-heading strong{font-size:18px}.month-takeaway blockquote{font-size:14px}
    .calendar-head h2{font-size:21px}.calendar-day{font-size:16px;min-height:32px}.book-card{min-height:56px;grid-template-columns:58px 58px minmax(0,1fr) 26px}.book-title{font-size:15px}.book-number{font-size:18px}.book-thumb{height:44px;font-size:11px}.book-category{font-size:10px}
    .reader-hero{flex-basis:250px;padding:22px 20px 18px}.reader-hero:before{width:350px;height:264px;border-bottom-right-radius:146px 84px}.reader-brand{margin-bottom:24px}.reader-top{margin-bottom:24px}.reader-top:after{display:none}.reader-kicker{display:none!important}.reader-title{max-width:318px;font-size:24px;line-height:1.2}.reader-title:after{width:112px;margin-top:7px}.reader-bookline{margin-top:10px;font-size:13px}.reader-hero:after{width:96px;height:70px}.page-count b{font-size:22px}.reader-body{padding:14px 14px 14px}.progress-line{grid-template-columns:auto auto 1fr;font-size:12px;margin-bottom:12px}.progress-line b{font-size:20px}.content-card{padding:18px 17px;border-radius:14px}.reader-page-content{font-size:16px;line-height:1.72}.reader-page-content h3{font-size:17px}.reader-page-content p{margin-bottom:15px}.judgement{font-size:15px;line-height:1.6}.reader-bottom button{min-height:54px}.reader-bottom button:last-child{font-size:16px}


    .brand-row .brand:after{right:-236px}

    body{background:var(--cream);color:var(--ink)}
    .app-shell,.reader-shell{background:var(--cream)}
    .hero:before,.hero:after,.hero h1:before,.hero p:before,.hero p:after,.brand:after,.reader-hero:before,.reader-hero:after,.reader-top:after,.page-count:before{display:none}
    .hero{min-height:0;padding:16px 20px 12px;overflow:visible;border-bottom:1px solid var(--line);background:transparent}
    .brand{color:var(--orange);font-size:12px;letter-spacing:.25em}
    .hero h1{margin:10px 0 5px;font-size:32px;line-height:1.15;font-weight:500;letter-spacing:.04em}
    .hero p{max-width:none;margin:0;color:var(--muted);font-size:12.5px;line-height:1.45;font-weight:400;white-space:nowrap}
    .title-line{display:none}
    .tabs,.app-shell.calendar-mode .tabs{grid-template-columns:repeat(3,96px);justify-content:start;height:40px;margin:0 20px 12px;padding:0;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none}
    .tab,.app-shell.calendar-mode .tab{padding:9px 7px;color:var(--muted);font-size:14px;font-weight:400}
    .tab.active{color:var(--orange)}
    .tab.active:after,.app-shell.calendar-mode .tab.active:after{left:0;right:0;bottom:-1px;height:2px;border-radius:0;background:var(--orange);transform:none}
    .panel{padding-right:20px;padding-left:20px}

    .feature-card{grid-template-columns:64px minmax(0,1fr);min-height:235px;border:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none}
    .feature-card:before{left:7px;top:7px;width:24px;height:24px;border-top:1.5px solid var(--orange);border-left:1.5px solid var(--orange);border-radius:0;background:none}
    .date-rail{margin:18px 0 60px;color:var(--ink);border-right:1px dashed var(--line);background:transparent;font-weight:500}
    .date-rail small{color:var(--orange)}
    .date-rail b:before,.date-rail span:after{background:var(--line)}
    .feature-copy{padding:24px 18px 78px 16px;text-align:left}
    .section-kicker{display:none}
    .feature-copy h2{font-size:23px;line-height:1.32;font-weight:500;word-break:keep-all}
    .feature-author{margin-top:10px;color:var(--ink);font-size:12px;font-weight:400}
    .feature-category{display:block;margin:4px 0 0;color:var(--muted);font-size:10.5px;line-height:1.4}
    .short-line{width:18px;height:2px;margin:8px 0 0;border-radius:0;background:var(--orange);transform:none}
    .blue-shape{display:none}
    .primary-cta{position:relative;z-index:3;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;width:calc(100% - 8px);min-height:64px;margin:-60px 4px 18px;padding:10px 14px;color:var(--cream);border-radius:0;background:var(--orange);box-shadow:none;font-size:13.5px;font-weight:400}
    .primary-cta:before,.primary-cta .cta-action:before{display:none;content:none}
    .primary-cta .cta-action{grid-column:2;position:static;padding:0;white-space:nowrap}
    .primary-cta .cta-takeaway{display:block;grid-column:1;grid-row:1;max-width:195px;text-align:left;font-size:12.5px;line-height:1.5}
    .primary-cta .icon{grid-column:3;color:var(--cream);font-size:22px}

    .quote-box{position:relative;display:grid;grid-template-columns:56px minmax(0,1fr);grid-template-rows:auto 1fr auto;min-height:168px;margin-top:0;padding:0;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none}
    .quote-box:before{display:none}
    .quote-count{display:flex;grid-column:1;grid-row:1 / 4;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-right:1px solid var(--line)}
    .quote-count b{color:var(--orange);font:500 34px/1 var(--serif)}
    .quote-count span{color:var(--muted);font:400 10px var(--serif)}
    .quote-meta{grid-column:2;padding:12px 16px 0;color:var(--orange);font-family:var(--serif);font-size:12px;font-weight:400;letter-spacing:.06em}
    .quote-meta-count{display:none}
    .refresh-quote{color:var(--orange);border:0;border-radius:0;background:transparent;padding:3px 0;font-family:var(--serif);font-size:12px;font-weight:400}
    .quote-text{grid-column:2;margin:0;padding:14px 18px 8px 20px;font-size:17px;line-height:1.62;font-weight:500}
    .quote-text:after{display:none}
    .quote-source{grid-column:2;padding:0 18px 13px 20px;color:var(--muted);font-family:var(--serif);font-size:11px;font-weight:400}

    .monthly-reflection{display:grid;grid-template-columns:96px minmax(0,1fr);grid-template-rows:auto 1fr;min-height:185px;margin-top:16px;padding:0;border:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none}
    .month-heading{grid-row:1 / 3;padding:12px;border-right:1px solid var(--line)}
    .month-heading span{color:var(--orange);font-family:var(--serif);font-size:10px;font-weight:500}
    .month-heading strong{font-size:18px;line-height:1.45;font-weight:500}
    .month-stats{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0;border-bottom:1px solid var(--line)}
    .month-stats div{padding:10px;text-align:center}
    .month-stats div+div{border-left:1px dashed var(--line)}
    .month-stats b{color:var(--orange);font-size:24px;font-weight:500}
    .month-stats span{display:block;margin:3px 0 0;color:var(--muted);font-family:var(--serif);font-size:10px;font-weight:400}
    .month-takeaway{padding:12px 16px}
    .month-label,.month-takeaway small{display:none}
    .month-takeaway blockquote{margin:0;font-size:15px;line-height:1.65;font-weight:400}

    .app-shell.calendar-mode .hero{min-height:0;padding:35px 34px 23px;border-bottom:1px solid var(--line)}
    .app-shell.calendar-mode .panel{padding:0 34px 36px}
    .calendar-intro{display:block;margin:0 4px 24px}
    .calendar-intro h2{margin:0 0 7px;font-size:34px;line-height:1.25;font-weight:500}
    .calendar-intro p{margin:0;color:var(--muted);font-size:14px;line-height:1.7}
    .calendar-card{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
    .calendar-head{margin:0 4px 20px}
    .calendar-head h2{color:var(--orange);font-size:20px;font-weight:500;letter-spacing:.08em}
    .calendar-head h2:after{display:none}
    .calendar-head div{font-family:var(--serif);font-size:13px;font-weight:400}
    .week-row{gap:0;margin-bottom:10px;font-family:var(--serif);font-size:14px;font-weight:400}
    .calendar-grid{gap:0;border-top:1px solid var(--line);border-left:1px solid var(--line)}
    .calendar-day{min-height:48px;color:var(--ink);border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;background:transparent;font-family:var(--serif);font-size:18px;font-weight:400}
    .calendar-day.has-book{color:var(--ink)}
    .calendar-day i{bottom:6px;background:var(--orange)}
    .calendar-day.is-today{color:var(--cream);background:transparent}
    .calendar-day.is-today span{position:relative;z-index:1;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--orange)}
    .calendar-day.is-current-day:not(.is-today) span{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--ink);border-radius:50%}
    .calendar-day em{right:4px;top:3px;color:var(--orange);font:500 10px var(--serif)}
    .month-dashboard{display:none}
    .toolbox{gap:14px;margin:34px 4px 0;padding-top:25px;border-top:1px solid var(--line)}
    .count{color:var(--orange);font-family:var(--serif);font-size:17px;font-weight:500}
    .search{width:72%;padding:9px 4px;color:var(--muted);border:0;border-bottom:1px solid var(--ink);border-radius:0;background:transparent;font-family:var(--serif);font-size:15px;font-weight:400;box-shadow:none}
    .search:focus{border-color:var(--orange);box-shadow:none}
    .shelf{gap:0;padding-bottom:20px}
    .spine-line,.book-thumb{display:none}
    .book-card{grid-template-columns:54px minmax(0,1fr) 48px 20px;gap:10px;min-height:64px;padding:0 4px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none}
    .book-card:hover,.book-card.timeline-focus{transform:none;background:color-mix(in srgb,var(--orange) 4%,transparent)}
    .book-number,.tone-blue .book-number,.tone-green .book-number{grid-column:1;align-self:center;color:var(--orange);background:transparent;font-family:var(--serif);font-size:23px;font-weight:500}
    .book-title-row{grid-column:2}
    .book-title{font-size:16px;font-weight:500}
    .book-category{color:var(--muted);font-family:var(--serif);font-size:12px;font-weight:400}
    .book-card:after{content:attr(data-date);grid-column:3;color:var(--muted);font:400 12px var(--serif);letter-spacing:.06em}
    .book-card .icon{grid-column:4;color:var(--orange)}

    .app-shell.calendar-mode .quote-archive-panel{padding-top:0;padding-bottom:20px}
    .quote-poster{position:relative;display:grid;grid-template-rows:auto 1fr auto;height:calc(100svh - 143px);min-height:557px;padding:22px 22px 20px;overflow:hidden;border:1px solid var(--line);background:linear-gradient(var(--orange),var(--orange)) left 12px top 12px/42px 2px no-repeat,linear-gradient(var(--orange),var(--orange)) left 12px top 12px/2px 42px no-repeat,linear-gradient(var(--orange),var(--orange)) right 12px bottom 12px/42px 2px no-repeat,linear-gradient(var(--orange),var(--orange)) right 12px bottom 12px/2px 42px no-repeat,radial-gradient(circle at 88% 12%,color-mix(in srgb,var(--orange) 7%,transparent) 0 74px,transparent 75px),transparent}
    .quote-poster:before{content:"";position:absolute;left:22px;right:22px;top:82px;border-top:1px solid var(--line)}
    .quote-poster-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:2px 4px 18px}
    .quote-poster-head>div:first-child{display:flex;flex-direction:column;gap:6px}
    .quote-poster-head>div:first-child span{color:var(--orange);font-size:9px;letter-spacing:.2em}
    .quote-poster-head>div:first-child strong{font-size:19px;line-height:1.2;font-weight:500}
    .quote-poster-index{display:flex;align-items:baseline;gap:5px}
    .quote-poster-index b{color:var(--orange);font:500 28px/1 var(--serif)}
    .quote-poster-index span{color:var(--muted);font-size:11px}
    .quote-poster-body{position:relative;display:flex;align-items:center;min-height:0;padding:28px 4px 20px}
    .quote-poster-body:before{content:"“";position:absolute;left:-2px;top:18px;color:color-mix(in srgb,var(--orange) 18%,transparent);font:500 74px/1 var(--serif)}
    .quote-poster-body blockquote{position:relative;z-index:1;width:100%;margin:0;font-size:clamp(23px,7vw,30px);line-height:1.7;font-weight:500;letter-spacing:.025em;text-wrap:pretty}
    .quote-poster-body mark{color:var(--orange);background:linear-gradient(transparent 76%,color-mix(in srgb,var(--orange) 20%,transparent) 0);padding:0 .05em;font-weight:600;box-decoration-break:clone;-webkit-box-decoration-break:clone}
    .quote-poster-body blockquote:after{content:"";display:block;width:34px;height:2px;margin-top:24px;background:var(--orange)}
    .quote-poster-foot{padding:18px 4px 2px;border-top:1px solid var(--line)}
    .quote-poster-source{display:flex;flex-direction:column;gap:6px;min-width:0}
    .quote-poster-source span{font-size:14px;line-height:1.5;font-weight:500;overflow-wrap:anywhere}
    .quote-poster-source small{color:var(--muted);font-size:11px}
    .quote-poster-actions{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding-right:18px}
    .quote-poster-actions button{border:0;border-bottom:1px solid var(--orange);outline:0;background:transparent;padding:5px 0;color:var(--orange);font-size:12px}
    .quote-poster-actions button:focus-visible{box-shadow:0 2px 0 var(--orange)}

    dialog{background:var(--cream)}
    .reader-hero{flex:0 0 auto;padding:18px 20px 14px;overflow:visible;background:transparent}
    .reader-brand{margin-bottom:14px;color:var(--orange);font-size:12px}
    .reader-top{margin:0 0 16px;padding-bottom:9px;border-bottom:1px solid var(--line)}
    .close{color:var(--muted);font-family:var(--serif);font-size:13px;font-weight:400}
    .close .icon{color:var(--ink);font-size:19px}
    .page-count,.page-count b{color:var(--muted);font-size:13px;font-weight:400}
    .reader-kicker{display:none}
    .reader-title{max-width:none;font-size:24px;line-height:1.25;font-weight:500}
    .reader-title:after{display:none}
    .reader-bookline{margin-top:8px;color:var(--muted);font-size:12px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .reader-bookline:after{content:"";display:block;width:20px;height:2px;margin-top:10px;background:var(--orange)}
    .reader-body{padding:12px 16px 20px}
    .progress-line{grid-template-columns:auto auto 1fr auto;gap:6px 10px;margin-bottom:14px;font-family:var(--serif);font-size:12px;font-weight:400}
    .progress-line b{color:var(--orange);font-size:13px;font-weight:500}
    .progress-track{grid-column:1 / -1;height:3px;border-radius:0;background:#E7DED7}
    .progress-fill{border-radius:0;background:var(--orange)}
    #reader-time{grid-column:4;grid-row:1}
    .content-card{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);padding:0;border:1px solid var(--line);border-radius:0;background:transparent;box-shadow:none}
    .content-card:before{content:attr(data-section);grid-column:1;padding-top:18px;color:var(--orange);border-right:1px dashed var(--line);text-align:center;font:500 18px/1 var(--serif)}
    .reader-page-content{grid-column:2;padding:18px 16px;font-size:16px;line-height:1.72;font-weight:400}
    .reader-page-content h3{margin:0 0 12px;font-size:18px;line-height:1.4;font-weight:500}
    .reader-page-content p,.reader-page-content ol,.reader-page-content ul{margin-bottom:14px}
    .reader-page-content li{margin:5px 0}
    .reader-page-content strong{color:var(--orange);background:none}
    .judgement{display:none}
    .reader-bottom{grid-template-columns:1fr 1fr;margin-top:14px;border:1px solid var(--line);border-radius:0;background:transparent}
    .reader-bottom button{min-height:52px;font-family:var(--serif);font-size:14px;font-weight:400}
    .reader-bottom button:last-child{color:var(--cream);background:var(--orange);font-size:15px}

    @media(min-width:381px) and (max-width:480px){
      .feature-card{min-height:clamp(225px,calc(30svh - 18px),270px)}
      .quote-box{min-height:clamp(158px,calc(30svh - 85px),205px)}
      .monthly-reflection{min-height:clamp(174px,calc(50svh - 237px),235px);margin-top:clamp(14px,calc(5svh - 26px),20px)}
    }

    @media(min-width:341px) and (max-width:380px){
      .feature-card{min-height:230px}
      .quote-box{min-height:160px}
      .monthly-reflection{min-height:176px;margin-top:14px}
    }

    @media(max-width:340px){
      .hero,.app-shell.calendar-mode .hero{padding-right:14px;padding-left:14px}
      .tabs,.app-shell.calendar-mode .tabs{margin-right:14px;margin-left:14px}
      .panel,.app-shell.calendar-mode .panel{padding-right:14px;padding-left:14px}
      .feature-card{grid-template-columns:56px minmax(0,1fr)}
      .feature-card{min-height:205px}
      .date-rail{margin-bottom:52px}
      .feature-copy{padding-right:14px;padding-left:14px}
      .feature-copy{padding-top:22px;padding-bottom:62px}
      .feature-copy h2{font-size:21px}
      .primary-cta{min-height:48px;margin-top:-52px;margin-bottom:16px;padding:8px 12px}
      .primary-cta .cta-takeaway{max-width:150px;font-size:10.5px;line-height:1.45}
      .quote-box{grid-template-columns:48px minmax(0,1fr);grid-template-rows:auto auto auto;min-height:0}
      .quote-count b{font-size:30px}
      .quote-meta{padding:10px 12px 0;font-size:11px}
      .refresh-quote{font-size:11px}
      .quote-text{padding:10px 14px 4px 16px;font-size:15.5px;line-height:1.52}
      .quote-source{padding:0 14px 11px 16px;font-size:10.5px}
      .monthly-reflection{grid-template-columns:72px minmax(0,1fr);grid-template-rows:auto auto;min-height:0;margin-top:12px}
      .month-heading{padding:10px}
      .month-heading strong{font-size:16px;line-height:1.4}
      .month-stats div{padding:7px 10px}
      .month-stats b{font-size:22px}
      .month-takeaway{padding:8px 12px}
      .month-takeaway blockquote{font-size:13px;line-height:1.5}
      .tabs,.app-shell.calendar-mode .tabs{grid-template-columns:repeat(3,minmax(0,1fr))}
      .quote-poster{padding:18px 17px 16px}
      .quote-poster:before{left:17px;right:17px;top:74px}
      .quote-poster-head{padding-right:2px;padding-left:2px}
      .quote-poster-head>div:first-child strong{font-size:17px}
      .quote-poster-index b{font-size:25px}
      .quote-poster-body{padding-right:2px;padding-left:2px}
      .quote-poster-body blockquote{font-size:23px;line-height:1.68}
      .quote-poster-foot{padding-right:2px;padding-left:2px}
      .content-card{grid-template-columns:32px minmax(0,1fr)}
      .reader-hero,.reader-body{padding-right:14px;padding-left:14px}
      .reader-title{font-size:22px}
      .reader-page-content{padding:16px 14px;font-size:15.5px}
    }
  </style>
</head>
<body>
  <main class="app-shell">
    <header class="hero">
      <div class="brand-row">
        <div class="brand">BUKU</div>
      </div>
      <h1>读到这里</h1><span class="title-line" aria-hidden="true"></span><p>每天一本值得精读的书。把观点留下，把判断带走。</p>
    </header>
    <nav class="tabs" aria-label="读书视图"><button class="tab active" type="button" data-tab="today-panel">今日精读</button><button class="tab" type="button" data-tab="calendar-panel">书单日历</button><button class="tab" type="button" data-tab="quotes-panel">金句回顾</button></nav>
    ${featureCard}
    ${calendarPanel}${cards}<div id="empty" class="empty">没有找到匹配的书。换个关键词试试。</div></section></section>
${quotePanel}
	  </main>
  <dialog id="reader">
    <div class="reader-shell">
      <header class="reader-hero">
        <div class="reader-brand">BUKU</div>
        <div class="reader-top"><button class="close" id="close" type="button" aria-label="返回书单"><span class="icon" aria-hidden="true">←</span><span>书籍详情</span></button><div class="page-count"><b id="reader-current">01</b> / <span id="reader-total">01</span></div></div>
        <div class="reader-kicker" id="reader-kicker" aria-hidden="true"></div>
        <h2 class="reader-title" id="reader-title"></h2>
        <p class="reader-bookline" id="reader-bookline"></p>
      </header>
      <div class="reader-body">
        <div class="progress-line"><span>阅读进度</span><b id="reader-percent">0%</b><div class="progress-track"><span class="progress-fill" id="progress-fill"></span></div><span id="reader-time">还需 0 分钟</span></div>
        <article class="content-card" data-section="01"><div id="reader-page-content" class="reader-page-content"></div><div class="judgement" id="reader-judgement"></div></article>
        <div class="reader-bottom"><button id="previous-page" type="button"><span class="icon" aria-hidden="true">←</span>上一段</button><button id="next-page" type="button">下一段 <span class="icon" aria-hidden="true">→</span></button></div>
      </div>
    </div>
  </dialog>
  <script>
    const books=${payload}; const dialog=document.querySelector('#reader'); const prevPage=document.querySelector('#previous-page'); const nextPage=document.querySelector('#next-page'); let readerSections=[]; let readerBook=null; let sectionIndex=0;
    const quotes=books.flatMap((book,bookIndex)=>book.quotes.map((text,quoteIndex)=>({text,highlight:book.quoteHighlights?.[quoteIndex]||'',source:book.title.replace(/^\\d{4}-\\d{2}-\\d{2}｜/, ''),author:book.author||book.category||'',bookIndex}))); let quoteIndex=Math.floor(Math.random()*Math.max(1,quotes.length)); let archiveQuoteIndex=quoteIndex;
    function showQuote(){const quote=quotes[quoteIndex];if(!quote)return;document.querySelector('#quote-text').textContent='“'+quote.text+'”';document.querySelector('#quote-source').textContent='—— '+quote.source;} showQuote();
    const refresh=document.querySelector('#refresh-quote'); if(refresh)refresh.onclick=()=>{quoteIndex=(quoteIndex+1+Math.floor(Math.random()*Math.max(1,quotes.length-1)))%quotes.length;showQuote();};
    function renderPosterQuote(text,highlight){const target=document.querySelector('#archive-quote-text');const index=highlight?text.lastIndexOf(highlight):-1;if(index<0){target.textContent='“'+text+'”';return;}const mark=document.createElement('mark');mark.textContent=highlight;target.replaceChildren(document.createTextNode('“'+text.slice(0,index)),mark,document.createTextNode(text.slice(index+highlight.length)+'”'));}
    function showArchiveQuote(){const quote=quotes[archiveQuoteIndex];if(!quote)return;document.querySelector('#archive-quote-current').textContent=String(archiveQuoteIndex+1).padStart(2,'0');renderPosterQuote(quote.text,quote.highlight);document.querySelector('#archive-quote-source').textContent='—— '+quote.source;document.querySelector('#archive-quote-author').textContent=quote.author;document.querySelector('#archive-open-source').dataset.openIndex=quote.bookIndex;} showArchiveQuote();
    const archiveRefresh=document.querySelector('#archive-refresh-quote'); if(archiveRefresh)archiveRefresh.onclick=()=>{archiveQuoteIndex=(archiveQuoteIndex+1+Math.floor(Math.random()*Math.max(1,quotes.length-1)))%quotes.length;showArchiveQuote();};
    const appShell=document.querySelector('.app-shell');
    document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(item=>item.classList.remove('active'));document.querySelectorAll('.panel').forEach(panel=>{panel.hidden=true;panel.classList.remove('active-panel')});tab.classList.add('active');appShell.classList.toggle('calendar-mode',tab.dataset.tab!=='today-panel');const panel=document.querySelector('#'+tab.dataset.tab);panel.hidden=false;panel.classList.add('active-panel');}));
    function splitIntoSections(html){const box=document.createElement('div');box.innerHTML=html;const sections=[];let current={title:'继续阅读',html:''};[...box.children].forEach(node=>{if(node.tagName==='H2'){if(current.html.trim())sections.push(current);current={title:node.textContent.trim(),html:''};}else{current.html+=node.outerHTML;}});if(current.html.trim())sections.push(current);return sections.length?sections:[{title:'继续阅读',html:html}];}
    function estimateMinutes(fromIndex){const rest=readerSections.slice(fromIndex).map(section=>section.html.replace(/<[^>]+>/g,'')).join('');return Math.max(1,Math.ceil(rest.length/420));}
    function renderReader(){const total=Math.max(1,readerSections.length);const current=readerSections[sectionIndex]||{title:'继续阅读',html:''};const percent=Math.round(((sectionIndex+1)/total)*100);document.querySelector('#reader-current').textContent=String(sectionIndex+1).padStart(2,'0');document.querySelector('#reader-total').textContent=String(total).padStart(2,'0');document.querySelector('#reader-percent').textContent=percent+'%';document.querySelector('#progress-fill').style.width=percent+'%';document.querySelector('#reader-time').textContent='还需 '+estimateMinutes(sectionIndex)+' 分钟';document.querySelector('#reader-kicker').textContent=sectionIndex===0?'今日精读':'继续阅读';document.querySelector('#reader-title').textContent=current.title;document.querySelector('#reader-bookline').textContent=(readerBook.title||'').replace(/^\\d{4}-\\d{2}-\\d{2}｜/,'')+(readerBook.author?' · '+readerBook.author:'');document.querySelector('#reader-page-content').innerHTML=current.html;document.querySelector('.content-card').dataset.section=String(sectionIndex+1).padStart(2,'0');document.querySelector('#reader-judgement').textContent='判断：'+(readerBook.review||readerBook.quotes?.[0]||'把这一段变成一个可以执行的判断。');prevPage.disabled=sectionIndex===0;nextPage.disabled=sectionIndex>=total-1;dialog.querySelector('.reader-body').scrollTop=0;}
	    function openReader(index,startSection=0){readerBook=books[index];if(!readerBook)return;readerSections=splitIntoSections(readerBook.content);sectionIndex=Math.max(0,Math.min(startSection,readerSections.length-1));renderReader();dialog.showModal();}
    document.querySelectorAll('.open-reader,[data-open-index]').forEach(node=>node.addEventListener('click',()=>openReader(Number(node.dataset.openIndex))));
    prevPage.onclick=()=>{if(sectionIndex>0){sectionIndex-=1;renderReader();}};nextPage.onclick=()=>{if(sectionIndex<readerSections.length-1){sectionIndex+=1;renderReader();}};document.addEventListener('keydown',event=>{if(!dialog.open)return;if(event.key==='ArrowRight')nextPage.click();if(event.key==='ArrowLeft')prevPage.click();if(event.key==='Escape')dialog.close();});
	    document.querySelector('#close').onclick=()=>dialog.close(); dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
    const cards=[...document.querySelectorAll('.book-card')], empty=document.querySelector('#empty'), search=document.querySelector('#search'); if(search)search.addEventListener('input',e=>{const query=e.target.value.trim().toLowerCase();let shown=0;cards.forEach(card=>{const yes=card.innerText.toLowerCase().includes(query);card.style.display=yes?'':'none';if(yes)shown++});empty.style.display=shown?'none':'block'});
    const params=new URLSearchParams(location.search); if(params.get('tab')==='quotes')document.querySelector('[data-tab="quotes-panel"]').click();if(params.has('reader'))openReader(Number(params.get('reader'))||0,Number(params.get('section'))||0);
  </script>
</body></html>`);
console.log(`已整理 ${books.length} 本书：${output}`);
