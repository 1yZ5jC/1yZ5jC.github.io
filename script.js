// ---------- 全局配置 ----------
const MARKED_OPTIONS = { gfm: true, breaks: true };

// ---------- 状态 ----------
let manifest = {};
let currentCategory = 'daily';
let currentFolder = null;

const postListEl = document.getElementById('post-list');
const markdownBody = document.getElementById('markdown-body');
const navBtns = document.querySelectorAll('.nav-btn');
const themeToggle = document.getElementById('theme-toggle');

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

// ---------- 渲染侧边栏 ----------
function renderSidebar(category) {
    const posts = manifest[category] || [];
    postListEl.innerHTML = posts.map(p =>
        `<li data-folder="${p.folder}" class="${p.folder === currentFolder ? 'active-post' : ''}">${p.title}</li>`
    ).join('');

    postListEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            const folder = li.dataset.folder;
            if (category === 'anime') {
                document.querySelectorAll('#post-list li').forEach(l => l.classList.remove('active-post'));
                li.classList.add('active-post');
                currentFolder = folder;
                return;
            } else {
                loadMarkdown(category, folder);
            }
        });
    });

    if (category === 'anime') {
        loadAllAnime();
        currentFolder = null;
        return;
    }

    if (posts.length > 0 && !currentFolder) {
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
    document.querySelectorAll('#post-list li').forEach(li => {
        li.classList.toggle('active-post', li.dataset.folder === folder);
    });

    const mdPath = `content/${category}/${folder}/index.md`;
    const basePath = `content/${category}/${folder}/`;

    try {
        const response = await fetch(mdPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const mdText = await response.text();

        const postMeta = manifest[category]?.find(p => p.folder === folder);
        const title = postMeta?.title || folder;
        const date = postMeta?.date || '';

        const hasTitle = hasMarkdownTitle(mdText);
        let html = marked.parse(mdText, MARKED_OPTIONS);

        let headerHtml = '';
        if (!hasTitle) {
            headerHtml += `<h1 class="post-title">${title}</h1>`;
        }
        if (date) {
            headerHtml += `<p class="post-date">📅 ${formatDate(date)}</p>`;
        }

        markdownBody.innerHTML = headerHtml + html;

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

            // 移除正文中的第一个 # 标题（如果有），因为我们将统一使用 manifest 标题
            let processedMd = mdText;
            const hasTitle = hasMarkdownTitle(mdText);
            if (hasTitle) {
                processedMd = mdText.replace(/^#\s+.*\n?/, '');
            }

            let html = marked.parse(processedMd, MARKED_OPTIONS);

            // 标题+日期
            const headerHtml = `
                <div class="anime-post-header">
                    <h2 class="anime-title">🎬 ${p.title}</h2>
                    ${p.date ? `<p class="post-date">📅 ${formatDate(p.date)}</p>` : ''}
                </div>
            `;

            // 图片处理
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

// ---------- 导航切换 ----------
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        currentCategory = category;
        currentFolder = null;
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