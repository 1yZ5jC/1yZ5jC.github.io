// ---------- 全局配置 ----------
const MARKED_OPTIONS = { gfm: true, breaks: true };

// ---------- 状态 ----------
let manifest = {};
let currentCategory = 'daily';
let currentFolder = null;
let currentPosts = [];        // 当前板块的所有文章（排序后）
let searchKeyword = '';

const postListEl = document.getElementById('post-list');
const markdownBody = document.getElementById('markdown-body');
const navBtns = document.querySelectorAll('.nav-btn');
const themeToggle = document.getElementById('theme-toggle');
const searchInput = document.getElementById('search-input');

// ---------- 辅助函数 ----------
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    return dateStr;
}

function hasMarkdownTitle(mdText) {
    const lines = mdText.split('\n');
    for (let line of lines) {
        if (line.trim() === '') continue;
        return /^#\s+/.test(line.trim());
    }
    return false;
}

function stripFrontMatter(mdText) {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
    return mdText.replace(frontMatterRegex, '');
}

// ---------- 加载 manifest ----------
async function loadManifest() {
    try {
        const response = await fetch('data/manifest.json');
        if (!response.ok) throw new Error('manifest.json 加载失败');
        manifest = await response.json();
        ['daily', 'articles', 'anime'].forEach(cat => {
            if (!manifest[cat]) manifest[cat] = [];
        });
        console.log('📋 Manifest 加载成功', manifest);
    } catch (err) {
        console.warn('⚠️ 未找到 manifest.json', err);
        manifest = { daily: [], articles: [], anime: [] };
    }
}

// ---------- 根据关键词过滤并渲染侧边栏 ----------
function renderFilteredSidebar(category, keyword) {
    const posts = currentPosts;
    let filtered = posts;
    if (keyword.trim() !== '') {
        const lower = keyword.toLowerCase();
        filtered = posts.filter(p => {
            // 匹配标题
            if (p.title.toLowerCase().includes(lower)) return true;
            // 匹配标签
            if (p.tags && Array.isArray(p.tags)) {
                return p.tags.some(tag => tag.toLowerCase().includes(lower));
            }
            return false;
        });
    }

    // 生成列表 HTML
    postListEl.innerHTML = filtered.map(p =>
        `<li data-folder="${p.folder}" class="${p.folder === currentFolder ? 'active-post' : ''}">${p.title}</li>`
    ).join('');

    // 绑定点击事件
    postListEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            const folder = li.dataset.folder;
            if (category === 'anime') {
                document.querySelectorAll('#post-list li').forEach(l => l.classList.remove('active-post'));
                li.classList.add('active-post');
                currentFolder = folder;
                // 注意：动漫板块内容不变，仅高亮
            } else {
                loadMarkdown(category, folder);
            }
        });
    });

    // 如果过滤后只有一篇，且不是动漫板块，自动加载该篇
    if (category !== 'anime' && filtered.length === 1) {
        const folder = filtered[0].folder;
        loadMarkdown(category, folder);
    } else if (filtered.length === 0) {
        markdownBody.innerHTML = '<p style="opacity:0.6; text-align:center;">🔍 没有匹配的文章</p>';
    }
}

// ---------- 渲染侧边栏 ----------
function renderSidebar(category) {
    currentPosts = manifest[category] || [];
    searchKeyword = searchInput.value || '';
    // 保存当前分类到全局，供搜索使用
    renderFilteredSidebar(category, searchKeyword);

    // 动漫板块特殊处理：直接加载全部内容
    if (category === 'anime') {
        loadAllAnime();
        currentFolder = null;
        return;
    }

    // 如果没有任何过滤，且没有选中文章，自动加载第一篇
    const posts = currentPosts;
    if (searchKeyword.trim() === '' && posts.length > 0 && !currentFolder) {
        loadMarkdown(category, posts[0].folder);
    } else if (posts.length === 0) {
        markdownBody.innerHTML = '<p style="opacity:0.6; text-align:center;">📭 这个板块还没有文章，快去写吧！</p>';
    }
}

// ---------- 加载单篇 ----------
async function loadMarkdown(category, folder) {
    currentCategory = category;
    currentFolder = folder;

    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.category === category));
    // 更新高亮（在过滤后的列表中）
    document.querySelectorAll('#post-list li').forEach(li => {
        li.classList.toggle('active-post', li.dataset.folder === folder);
    });

    const mdPath = `content/${category}/${folder}/index.md`;
    const basePath = `content/${category}/${folder}/`;

    try {
        const response = await fetch(mdPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let mdText = await response.text();

        const cleanMd = stripFrontMatter(mdText);
        const postMeta = manifest[category]?.find(p => p.folder === folder);
        const title = postMeta?.title || folder;
        const date = postMeta?.date || '';
        const tags = postMeta?.tags || [];

        const hasTitle = hasMarkdownTitle(cleanMd);
        let html = marked.parse(cleanMd, MARKED_OPTIONS);

        let headerHtml = '';
        if (!hasTitle) {
            headerHtml += `<h1 class="post-title">${title}</h1>`;
        }
        if (date) {
            headerHtml += `<p class="post-date">📅 ${formatDate(date)}</p>`;
        }
        // 显示标签（如果有）
        if (tags.length > 0) {
            headerHtml += `<p class="post-tags">🏷️ ${tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</p>`;
        }

        markdownBody.innerHTML = headerHtml + html;

        // 图片路径修正
        const images = markdownBody.querySelectorAll('img');
        images.forEach(img => {
            let src = img.getAttribute('src');
            if (src && !/^https?:\/\//i.test(src) && !src.startsWith('/')) {
                img.src = basePath + src;
            }
        });
    } catch (err) {
        markdownBody.innerHTML = `<p style="color: #dc2626;">⚠️ 加载失败：${err.message}</p>`;
    }
}

// ---------- 加载全部动漫 ----------
async function loadAllAnime() {
    const posts = currentPosts; // 注意这里是动漫板块的当前列表
    if (posts.length === 0) {
        markdownBody.innerHTML = '<p style="opacity:0.6; text-align:center;">📭 还没有动漫评价，快来写吧！</p>';
        return;
    }

    let htmlContent = '';
    for (const p of posts) {
        const folder = p.folder;
        const mdPath = `content/anime/${folder}/index.md`;
        const basePath = `content/anime/${folder}/`;
        try {
            const response = await fetch(mdPath);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            let mdText = await response.text();

            let cleanMd = stripFrontMatter(mdText);
            if (hasMarkdownTitle(cleanMd)) {
                cleanMd = cleanMd.replace(/^#\s+.*\n?/, '');
            }
            let html = marked.parse(cleanMd, MARKED_OPTIONS);

            const headerHtml = `
                <div class="anime-post-header">
                    <h2 class="anime-title">🎬 ${p.title}</h2>
                    ${p.date ? `<p class="post-date">📅 ${formatDate(p.date)}</p>` : ''}
                    ${p.tags && p.tags.length ? `<p class="post-tags">🏷️ ${p.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</p>` : ''}
                </div>
            `;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const imgs = tempDiv.querySelectorAll('img');
            imgs.forEach(img => {
                let src = img.getAttribute('src');
                if (src && !/^https?:\/\//i.test(src) && !src.startsWith('/')) {
                    img.src = basePath + src;
                }
            });

            htmlContent += `
                <div class="anime-post">
                    ${headerHtml}
                    ${tempDiv.innerHTML}
                </div>
                <hr class="anime-divider">
            `;
        } catch (err) {
            htmlContent += `<p style="color: #dc2626;">⚠️ 加载“${p.title}”失败：${err.message}</p>`;
        }
    }
    markdownBody.innerHTML = htmlContent;
}

// ---------- 搜索事件 ----------
searchInput.addEventListener('input', () => {
    searchKeyword = searchInput.value.trim();
    renderFilteredSidebar(currentCategory, searchKeyword);
});

// ---------- 导航切换 ----------
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        currentCategory = category;
        currentFolder = null;
        // 清空搜索框
        searchInput.value = '';
        searchKeyword = '';
        renderSidebar(category);
    });
});

// ---------- 明暗主题 ----------
let darkMode = false;
themeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
    themeToggle.textContent = darkMode ? '☀️ 亮色' : '🌙 暗色';
});

// ---------- 初始化 ----------
async function init() {
    await loadManifest();
    renderSidebar('daily');
}

init();