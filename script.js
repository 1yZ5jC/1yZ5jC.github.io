// ---------- 全局配置 ----------
const MARKED_OPTIONS = {
    gfm: true,
    breaks: true,
};

// ---------- 状态管理 ----------
let manifest = {};
let currentCategory = 'daily';
let currentFolder = null; // 当前选中的文章文件夹（仅用于非动漫板块）

const postListEl = document.getElementById('post-list');
const markdownBody = document.getElementById('markdown-body');
const navBtns = document.querySelectorAll('.nav-btn');
const themeToggle = document.getElementById('theme-toggle');

// ---------- 加载文章清单 ----------
async function loadManifest() {
    try {
        const response = await fetch('data/manifest.json');
        if (!response.ok) throw new Error('manifest.json 加载失败');
        manifest = await response.json();
        // 确保每个分类存在
        ['daily', 'articles', 'anime'].forEach(cat => {
            if (!manifest[cat]) manifest[cat] = [];
        });
        console.log('📋 Manifest 加载成功', manifest);
    } catch (err) {
        console.warn('⚠️ 未找到 manifest.json，使用空列表', err);
        manifest = { daily: [], articles: [], anime: [] };
    }
}

// ---------- 渲染侧边栏 ----------
function renderSidebar(category) {
    const posts = manifest[category] || [];
    // 生成列表 HTML
    postListEl.innerHTML = posts.map(p => 
        `<li data-folder="${p.folder}" class="${p.folder === currentFolder ? 'active-post' : ''}">${p.title}</li>`
    ).join('');

    // 绑定点击事件
    postListEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            const folder = li.dataset.folder;
            if (category === 'anime') {
                // 动漫板块：只高亮，不重新加载（内容已全部展示）
                document.querySelectorAll('#post-list li').forEach(l => l.classList.remove('active-post'));
                li.classList.add('active-post');
                currentFolder = folder; // 记录高亮，但内容不变
                return;
            } else {
                // 其他板块：正常加载单篇文章
                loadMarkdown(category, folder);
            }
        });
    });

    // 特殊处理：动漫板块直接显示全部简评
    if (category === 'anime') {
        loadAllAnime();
        currentFolder = null; // 重置选中（因为不需要单篇高亮）
        return;
    }

    // 非动漫板块：自动加载第一篇
    if (posts.length > 0 && !currentFolder) {
        loadMarkdown(category, posts[0].folder);
    } else if (posts.length === 0) {
        markdownBody.innerHTML = '<p style="opacity:0.6; text-align:center;">📭 这个板块还没有文章，快去写吧！</p>';
    }
}

// ---------- 加载并渲染单篇 Markdown ----------
async function loadMarkdown(category, folder) {
    currentCategory = category;
    currentFolder = folder;

    // 更新导航按钮激活态
    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });

    // 更新侧边栏高亮
    document.querySelectorAll('#post-list li').forEach(li => {
        li.classList.toggle('active-post', li.dataset.folder === folder);
    });

    const mdPath = `content/${category}/${folder}/index.md`;
    const basePath = `content/${category}/${folder}/`;

    try {
        const response = await fetch(mdPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const mdText = await response.text();
        let html = marked.parse(mdText, MARKED_OPTIONS);
        markdownBody.innerHTML = html;

        // 修正图片路径（相对路径补全）
        const images = markdownBody.querySelectorAll('img');
        images.forEach(img => {
            let src = img.getAttribute('src');
            if (!src) return;
            if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) {
                img.src = basePath + src;
            }
        });
    } catch (err) {
        markdownBody.innerHTML = `<p style="color: #dc2626;">⚠️ 加载失败：${err.message}</p>`;
    }
}

// ---------- 加载所有动漫简评（一次性全部展示） ----------
async function loadAllAnime() {
    const posts = manifest['anime'] || [];
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
            const mdText = await response.text();
            let html = marked.parse(mdText, MARKED_OPTIONS);
            // 处理图片路径
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const imgs = tempDiv.querySelectorAll('img');
            imgs.forEach(img => {
                let src = img.getAttribute('src');
                if (src && !/^https?:\/\//i.test(src) && !src.startsWith('/')) {
                    img.src = basePath + src;
                }
            });
            // 添加文章标题（作为分隔）
            const titleHtml = `<h2 class="anime-title">🎬 ${p.title}</h2>`;
            htmlContent += `<div class="anime-post">${titleHtml}${tempDiv.innerHTML}</div><hr class="anime-divider">`;
        } catch (err) {
            htmlContent += `<p style="color: #dc2626;">⚠️ 加载“${p.title}”失败：${err.message}</p>`;
        }
    }
    markdownBody.innerHTML = htmlContent;
}

// ---------- 导航切换事件 ----------
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        currentCategory = category;
        currentFolder = null; // 重置，让新板块自动加载第一篇
        renderSidebar(category);
    });
});

// ---------- 明暗主题切换 ----------
let darkMode = false;
themeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
    themeToggle.textContent = darkMode ? '☀️ 亮色' : '🌙 暗色';
});

// ---------- 初始化 ----------
async function init() {
    await loadManifest();
    renderSidebar('daily'); // 默认显示日常
}

init();