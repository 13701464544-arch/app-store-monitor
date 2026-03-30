require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

//  { name: 'OPPO 官网', url: 'https://www.oppo.com/cn/news/', type: 'html' },
  //{ name: 'VIVO 官网', url: 'https://www.vivo.com.cn/news/', type: 'html' },
  //{ name: '腾讯新闻', url: 'https://news.qq.com/', type: 'html' },
  //{ name: '今日头条', url: 'https://www.toutiao.com/', type: 'html' },
  //{ name: 'YouTube', url: 'https://www.youtube.com/feed/trending', type: 'html' },
  //{ name: 'Donews', url: 'https://www.donews.com/', type: 'html' },
  //{ name: '华尔街', url: 'https://www.wsj.com/', type: 'html' }

const SOURCES = [
  // 官方商店动态 (RSS稳定)
  { name: 'Apple Newsroom', url: 'https://www.apple.com/newsroom/rss-feed.xml', type: 'rss' },
  { name: 'Google Play 博客', url: 'https://blog.google/products/google-play/rss/', type: 'rss' },
  { name: '小米应用商店', url: 'https://dev.mi.com/console/doc/rss?cid=85', type: 'rss' }, // 开发者公告，常含应用信息
  // 科技媒体 (抓取RSS)
  { name: '36氪-应用', url: 'https://36kr.com/feed', type: 'rss' },  // 36氪全站RSS
  { name: '虎嗅-早报', url: 'https://www.huxiu.com/rss/0.xml', type: 'rss' },
  { name: '品玩', url: 'https://www.pingwest.com/feed', type: 'rss' },
  { name: '钛媒体', url: 'https://www.tmtpost.com/rss.xml', type: 'rss' },
  { name: 'Donews', url: 'https://www.donews.com/rss.xml', type: 'rss' },
  // 部分国内资讯站仍提供RSS
  { name: '搜狐科技', url: 'https://www.sohu.com/c/8/1460/feed.rss', type: 'rss' }
];

const STORES = ['App Store', 'Google Play', '应用宝', 'OPPO软件商店', 'VIVO应用商店', '小米应用商店'];

function detectStore(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  if (text.includes('app store') || text.includes('ios')) return 'App Store';
  if (text.includes('google play') || text.includes('android')) return 'Google Play';
  if (text.includes('应用宝')) return '应用宝';
  if (text.includes('oppo') && (text.includes('商店') || text.includes('软件商店'))) return 'OPPO软件商店';
  if (text.includes('vivo') && (text.includes('商店') || text.includes('软件商店'))) return 'VIVO应用商店';
  if (text.includes('小米') && (text.includes('商店') || text.includes('应用商店'))) return '小米应用商店';
  return '其他';
}

async function fetchRSS(url, sourceName) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data, { xmlMode: true });
    const items = [];
    $('item').slice(0, 10).each((i, el) => {
      const title = $(el).find('title').text();
      const link = $(el).find('link').text();
      const pubDate = $(el).find('pubDate').text();
      const description = $(el).find('description').text();
      items.push({ title, content: description, pubTime: pubDate, link, source: sourceName });
    });
    return items;
  } catch (err) {
    console.error(`RSS抓取失败 ${sourceName}:`, err.message);
    return [];
  }
}

async function fetchHTML(url, sourceName) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const items = [];
    $('a').each((i, el) => {
      if (i > 30) return;
      const title = $(el).text().trim();
      const link = $(el).attr('href');
      if (title && title.length > 10 && title.length < 200 && link && !link.startsWith('javascript:')) {
        items.push({
          title,
          content: '',
          pubTime: new Date().toISOString(),
          link: link.startsWith('http') ? link : new URL(link, url).href,
          source: sourceName
        });
      }
    });
    return items.slice(0, 10);
  } catch (err) {
    console.error(`HTML抓取失败 ${sourceName}:`, err.message);
    return [];
  }
}

async function generateAI(text, type) {
  if (!DEEPSEEK_API_KEY) return '未配置API Key';
  const prompt = type === 'summary'
    ? `请将以下信息的主要内容提炼为30-50字：\n${text}`
    : `请对以下信息进行影响分析（30-50字）：\n${text}`;
  try {
    const response = await axios.post(DEEPSEEK_API_URL, {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 100
    }, {
      headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }
    });
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('DeepSeek API错误:', err.message);
    return 'AI分析失败';
  }
}

async function main() {
  console.log('开始爬取...', new Date().toISOString());
  let allItems = [];

  for (const source of SOURCES) {
    console.log(`抓取 ${source.name} ...`);
    let items = [];
    if (source.type === 'rss') {
      items = await fetchRSS(source.url, source.name);
    } else {
      items = await fetchHTML(source.url, source.name);
    }
    items.forEach(item => {
      item.store = detectStore(item.title, item.content);
      item.links = [item.link];
    });
    allItems.push(...items);
    await new Promise(r => setTimeout(r, 1000));
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  allItems = allItems.filter(item => {
    const pub = new Date(item.pubTime);
    return !isNaN(pub) && pub >= oneDayAgo;
  });

  const merged = [];
  const used = new Array(allItems.length).fill(false);
  for (let i = 0; i < allItems.length; i++) {
    if (used[i]) continue;
    const group = [allItems[i]];
    used[i] = true;
    const baseTitle = allItems[i].title.substring(0, 50).toLowerCase();
    for (let j = i + 1; j < allItems.length; j++) {
      if (used[j]) continue;
      const compareTitle = allItems[j].title.substring(0, 50).toLowerCase();
      if (baseTitle.includes(compareTitle) || compareTitle.includes(baseTitle)) {
        group.push(allItems[j]);
        used[j] = true;
      }
    }
    const mergedItem = {
      id: Date.now() + i,
      title: group.reduce((a, b) => a.title.length > b.title.length ? a : b).title,
      content: group[0].content,
      pubTime: group[0].pubTime,
      store: group[0].store,
      links: [...new Set(group.flatMap(g => g.links))].slice(0, 3),
      source: group.map(g => g.source).join(',')
    };
    merged.push(mergedItem);
  }

  for (let i = 0; i < merged.length; i++) {
    const item = merged[i];
    const fullText = `${item.title}\n${item.content}`;
    console.log(`生成AI摘要 ${i+1}/${merged.length} ...`);
    item.summary = await generateAI(fullText, 'summary');
    await new Promise(r => setTimeout(r, 500));
    item.impact = await generateAI(fullText, 'impact');
    await new Promise(r => setTimeout(r, 500));
  }

  const storeStats = {};
  STORES.forEach(s => storeStats[s] = 0);
  merged.forEach(item => {
    if (storeStats[item.store] !== undefined) storeStats[item.store]++;
    else storeStats[item.store] = 1;
  });

  const output = {
    lastCrawl: now.toISOString(),
    nextCrawl: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    items: merged,
    storeStats
  };

  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'data.json'), JSON.stringify(output, null, 2));
  console.log(`数据生成完成，共 ${merged.length} 条信息`);
}

main().catch(console.error);
