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
   //{ name: '华尔街', url: 'https://www.wsj.com/', type: 'html' }

const SOURCES = [
  // ========== 官方应用商店动态 ==========
  { name: 'Apple App Store 新闻', url: 'https://www.apple.com/newsroom/rss-feed.xml', type: 'rss' },
  { name: 'Google Play 官方博客', url: 'https://blog.google/products/google-play/rss/', type: 'rss' },
  { name: '小米应用商店开发者', url: 'https://dev.mi.com/console/doc/rss?cid=85', type: 'rss' },
  { name: 'OPPO 开放平台', url: 'https://open.oppomobile.com/bbs/forum.php?mod=forumdisplay&fid=2', type: 'html' },
  { name: 'VIVO 开发者社区', url: 'https://dev.vivo.com.cn/document', type: 'html' },
  
  // ========== 应用评测和推荐网站 ==========
  { name: 'App Store 推荐', url: 'https://www.appstore.com/', type: 'html' },
  { name: 'Google Play 推荐', url: 'https://play.google.com/store/apps', type: 'html' },
  
  // ========== 移动应用行业媒体 ==========
  { name: 'AppAdvice', url: 'https://appadvice.com/feed', type: 'rss' },
  { name: 'Android Police', url: 'https://www.androidpolice.com/feed', type: 'rss' },
  { name: '9to5Google', url: 'https://9to5google.com/feed', type: 'rss' },
  { name: '9to5Mac', url: 'https://9to5mac.com/feed', type: 'rss' },
  
  // ========== 国内应用相关媒体 ==========
   { name: 'IT之家', url: 'https://www.ithome.com/rss/', type: 'rss' },
  { name: '鞭牛士', url: 'https://www.bianews.com/feed', type: 'rss' },
  { name: '36氪', url: 'https://36kr.com/feed', type: 'rss' },
  { name: '品玩', url: 'https://www.pingwest.com/feed', type: 'rss' },
  { name: '钛媒体', url: 'https://www.tmtpost.com/rss.xml', type: 'rss' },
  { name: '金融界-科技', url: 'https://finance.jrj.com.cn/rss/tech.xml', type: 'rss' },

   { name: '虎嗅-科技', url: 'https://www.huxiu.com/rss/0.xml', type: 'rss' },
  { name: 'Donews', url: 'https://www.donews.com/rss.xml', type: 'rss' },
];

const STORES = ['App Store', 'Google Play', '应用宝', 'OPPO软件商店', 'VIVO应用商店', '小米应用商店'];

function detectStore(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  
  // ========== 1. App Store 相关 ==========
  if (text.includes('app store') || 
      text.includes('ios') || 
      text.includes('苹果商店') ||
      text.includes('苹果应用商店') ||
      (text.includes('苹果') && (text.includes('应用') || text.includes('商店') || text.includes('app')))) {
    return 'App Store';
  }
  
  // ========== 2. Google Play 相关 ==========
  if (text.includes('google play') || 
      text.includes('android') || 
      text.includes('谷歌商店') ||
      text.includes('谷歌应用商店') ||
      (text.includes('谷歌') && (text.includes('应用') || text.includes('商店')))) {
    return 'Google Play';
  }
  
  // ========== 3. 应用宝相关 ==========
  if (text.includes('应用宝') || 
      text.includes('腾讯应用宝')) {
    return '应用宝';
  }
  
  // ========== 4. OPPO 软件商店相关 ==========
  if ((text.includes('oppo') || text.includes('欧普')) && 
      (text.includes('软件商店') || text.includes('应用商店') || text.includes('商店'))) {
    return 'OPPO软件商店';
  }
  // 单独提到 OPPO 应用/软件相关
  if (text.includes('oppo') && (text.includes('应用') || text.includes('软件'))) {
    return 'OPPO软件商店';
  }
  
  // ========== 5. VIVO 应用商店相关 ==========
  if ((text.includes('vivo') || text.includes('维沃')) && 
      (text.includes('软件商店') || text.includes('应用商店') || text.includes('商店'))) {
    return 'VIVO应用商店';
  }
  if (text.includes('vivo') && (text.includes('应用') || text.includes('软件'))) {
    return 'VIVO应用商店';
  }
  
  // ========== 6. 小米应用商店相关 ==========
  if (text.includes('小米') && 
      (text.includes('应用商店') || text.includes('应用市场') || text.includes('软件商店'))) {
    return '小米应用商店';
  }
  if (text.includes('小米') && (text.includes('应用') || text.includes('软件'))) {
    return '小米应用商店';
  }
  
  // ========== 7. 华为应用市场（可选，您要求的是6个商店，但可以扩展）==========
  if (text.includes('华为') && 
      (text.includes('应用市场') || text.includes('应用商店') || text.includes('软件商店'))) {
    return '其他';  // 如果您想单独显示华为，可以改为 '华为应用市场'
  }
  
  // ========== 8. 通用应用商店关键词 ==========
  // 当文章提到"应用商店"、"应用市场"等，但无法识别具体品牌时
  if (text.includes('应用商店') || 
      text.includes('应用市场') || 
      text.includes('软件商店') || 
      text.includes('软件市场') ||
      text.includes('app store') ||
      text.includes('google play')) {
    return '其他应用商店';
  }
   
  // ========== 9. 手机品牌相关（可能隐含应用商店）==========
  // 如果提到手机品牌但没有明确商店，可能与应用相关
  const phoneBrands = ['华为', '荣耀', '三星', '小米', 'oppo', 'vivo', '魅族', '一加', 'realme'];
  for (const brand of phoneBrands) {
    if (text.includes(brand) && (text.includes('应用') || text.includes('软件') || text.includes('商店'))) {
      return '其他应用商店';
    }
    
  }
  
  // ========== 10. 游戏/应用分发相关 ==========
  if (text.includes('游戏平台') || 
      text.includes('应用分发') || 
      text.includes('app分发') ||
      text.includes('手游平台')) {
    return '其他应用商店';
  }
  
  return '其他';
}
// 判断是否与应用商店/应用生态相关
function isAppEcoRelated(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  
  // 核心关键词（必须包含至少1个）
  const coreKeywords = [
    'app store', 'google play', '应用商店', '应用市场', '软件商店',
    'app发布', 'app更新', '应用发布', '应用更新', '应用上架',
    'ios应用', 'android应用', '安卓应用', '苹果应用',
    '应用宝', 'oppo软件商店', 'vivo应用商店', '小米应用商店',
    '华为应用市场', 'app下载', '应用下载'
  ];
  
  // 扩展关键词（辅助判断）
  const extendedKeywords = [
    'app', '应用', '软件', '商店', '市场', '发布', '更新',
    '上架', '下载', 'ios', 'android', '安卓', '苹果',
    '开发者', 'app store', 'google play', 'play store'
  ];
  
  // 排除关键词（如果包含这些词，直接过滤掉）
  const excludeKeywords = [
    '猪价', '生猪', '猪肉', '油价', '石油', '原油', '期货', '股市', 'A股',
    '基金', '债券', '理财', '银行', '保险', '房价', '房地产',
    '军事', '战争', '导弹', '空袭', '伊朗', '美国副总统', '特朗普',
    '选举', '政治', '外交', '航母', '军舰', '航天', '火箭',
    '足球', '篮球', '体育', '比赛', '奥运会',
    '法院', '判决', '起诉', '律师', '侵权', '赔偿',
    '离婚', '明星', '八卦', '综艺', '电视剧', '电影',
    '食品', '零食', '餐饮', '火锅', '奶茶', '咖啡',
    '汽车', '电动车', '充电桩', '电池', '芯片', '半导体',
    '钢铁', '煤炭', '化工', '化肥', '水泥', '建材'
  ];
  
  // 1. 检查排除关键词（只要包含一个，直接过滤掉）
  for (const keyword of excludeKeywords) {
    if (text.includes(keyword)) {
      console.log(`  过滤掉: 包含排除词 "${keyword}"`);
      return false;
    }
  }
  
  // 2. 检查核心关键词（必须包含至少1个）
  for (const keyword of coreKeywords) {
    if (text.includes(keyword)) {
      return true;
    }
  }
  
  // 3. 如果包含多个扩展关键词，也可能相关
  let matchCount = 0;
  for (const keyword of extendedKeywords) {
    if (text.includes(keyword)) matchCount++;
  }
  
  // 至少包含3个扩展关键词才保留（减少误判）
  if (matchCount >= 3) {
    console.log(`  扩展关键词命中 ${matchCount} 个`);
    return true;
  }
  
  // 4. 标题长度较短且包含"应用"或"软件"的也保留
  if (title.length < 50 && (text.includes('应用') || text.includes('软件'))) {
    return true;
  }
  
  return false;
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
console.log('当前工作目录:', __dirname);
console.log('public 目录路径:', publicDir);

if (!fs.existsSync(publicDir)) {
  console.log('创建 public 目录...');
  fs.mkdirSync(publicDir);
}

const dataFilePath = path.join(publicDir, 'data.json');
console.log('准备写入文件:', dataFilePath);

fs.writeFileSync(dataFilePath, JSON.stringify(output, null, 2));
console.log('文件写入成功！文件大小:', fs.statSync(dataFilePath).size, '字节');

// 验证文件是否存在
if (fs.existsSync(dataFilePath)) {
  console.log('✓ data.json 文件确认存在');
} else {
  console.error('✗ data.json 文件不存在！');
}
}

main().catch(console.error);
