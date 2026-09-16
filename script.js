// ---------- 全局配置 ----------
const MARKED_OPTIONS = { gfm: true, breaks: true };
const PAGE_SIZE = 10; // 每页显示文章数

// ---------- 状态 ----------
let manifest = {};
let currentCategory = 'daily';
let currentFolder = null;
let currentPosts = [];        // 当前板块的所有文章（排序后）
let filteredPosts = [];       // 经过搜索/日期筛选后的文章
let searchKeyword = '';
let dateStart = '';
let dateEnd = '';
let sortOrder = 'desc';       // 'desc' 或 'asc'
let currentPage = 1;

// DOM
const postListEl = document.getElementById('post-list');
const markdownBody = document.getElementById('markdown-body');
const navBtns = document.querySelectorAll('.nav-btn');
const themeToggle = document.getElementById('theme-toggle');
const searchInput = document.getElementById('search-input');
const dateStartInput = document.getElementById('date-start');
const dateEndInput = document.getElementById('date-end');
const sortBtn = document.getElementById('sort-btn');
const paginationEl = document.getElementById('pagination');

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

// ---------- 应用筛选 + 排序 ----------
function applyFiltersAndSort() {
    let posts = [...(manifest[currentCategory] || [])];

    // 1. 搜索过滤（标题或标签）
    if (searchKeyword.trim() !== '') {
        const lower = searchKeyword.toLowerCase();
        posts = posts.filter(p =>
            p.title.toLowerCase().includes(lower) ||
            (p.tags && Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(lower)))
        );
    }

    // 2. 日期范围过滤
    if (dateStart) {
        posts = posts.filter(p => p.date && p.date >= dateStart);
    }
    if (dateEnd) {
        posts = posts.filter(p => p.date && p.date <= dateEnd);
    }

    // 3. 排序（基于日期 + order）
    posts.sort((a, b) => {
        // 日期比较
        if (a.date !== b.date) {
            const cmp = a.date.localeCompare(b.date);
            return sortOrder === 'desc' ? -cmp : cmp;
        }
        // 同天按 order
        if (a.order !== b.order) {
            const aNum = parseFloat(a.order);
            const bNum = parseFloat(b.order);
            let cmp;
            if (!isNaN(aNum) && !isNaN(bNum)) {
                cmp = aNum - bNum;
            } else {
                cmp = String(a.order).localeCompare(String(b.order));
            }
            return sortOrder === 'desc' ? cmp : -cmp; // 倒序时 order 降序？可自行调整
        }
        // 按标题
        return a.title.localeCompare(b.title);
    });

    filteredPosts = posts;
    currentPage = 1; // 重置页码
}

// ---------- 渲染分页控件 ----------
function renderPagination(totalPages) {
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    let html = '';
    // 上一页
    html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

    // 页码（最多显示 5 个）
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    // 下一页
    html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;

    paginationEl.innerHTML = html;

    // 绑定事件
    paginationEl.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (page >= 1 && page <= totalPages && page !== currentPage) {
                currentPage = page;
                renderCurrentPage();
            }
        });
    });
}

// ---------- 渲染当前页内容 ----------
function renderCurrentPage() {
    const totalPages = Math.ceil(filteredPosts.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pagePosts = filteredPosts.slice(startIdx, startIdx + PAGE_SIZE);

    // 渲染侧边栏列表
    postListEl.innerHTML = pagePosts.map(p =>
        `<li data-folder="${p.folder}" class="${p.folder === currentFolder ? 'active-post' : ''}">${p.title}</li>`
    ).join('');

    // 绑定点击
    postListEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            const folder = li.dataset.folder;
            if (currentCategory === 'anime') {
                document.querySelectorAll('#post-list li').forEach(l => l.classList.remove('active-post'));
                li.classList.add('active-post');
                currentFolder = folder;
                return;
            }
            loadMarkdown(currentCategory, folder);
        });
    });

    // 渲染分页控件
    renderPagination(totalPages);

    // 内容区逻辑
    if (currentCategory === 'anime') {
        // 动漫板块：展示当前页所有动漫简评
        loadAllAnime(pagePosts);
    } else {
        // 非动漫：如果当前没有选中文章且本页有文章，自动加载第一篇
        if (pagePosts.length === 0) {
            markdownBody.innerHTML = '<p style="opacity:0.6; text-align:center;">🔍 没有匹配的文章</p>';
        } else if (!currentFolder || !pagePosts.some(p => p.folder === currentFolder)) {
            // 当前选中的文章不在本页，加载本页第一篇
            const first = pagePosts[0];
            if (first) loadMarkdown(currentCategory, first.folder);
        }
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
        let mdText = await response.text();

        const cleanMd = stripFrontMatter(mdText);
        const postMeta = manifest[category]?.find(p => p.folder === folder);
        const title = postMeta?.title || folder;
        const date = postMeta?.date || '';
        const tags = postMeta?.tags || [];

        const hasTitle = hasMarkdownTitle(cleanMd);
        let html = marked.parse(cleanMd, MARKED_OPTIONS);

        let headerHtml = '';
        if (!hasTitle) headerHtml += `<h1 class="post-title">${title}</h1>`;
        if (date) headerHtml += `<p class="post-date">📅 ${formatDate(date)}</p>`;
        if (tags.length > 0) {
            headerHtml += `<p class="post-tags">🏷️ ${tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</p>`;
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

// ---------- 加载指定页的动漫简评 ----------
async function loadAllAnime(pagePosts) {
    if (!pagePosts || pagePosts.length === 0) {
        markdownBody.innerHTML = '<p style="opacity:0.6; text-align:center;">📭 还没有动漫评价，快来写吧！</p>';
        return;
    }

    let htmlContent = '';
    for (const p of pagePosts) {
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

// ---------- 事件绑定 ----------

// 搜索
searchInput.addEventListener('input', () => {
    searchKeyword = searchInput.value.trim();
    applyFiltersAndSort();
    renderCurrentPage();
});

// 日期筛选
dateStartInput.addEventListener('change', () => {
    dateStart = dateStartInput.value;
    applyFiltersAndSort();
    renderCurrentPage();
});
dateEndInput.addEventListener('change', () => {
    dateEnd = dateEndInput.value;
    applyFiltersAndSort();
    renderCurrentPage();
});

// 排序切换
sortBtn.addEventListener('click', () => {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    sortBtn.dataset.order = sortOrder;
    sortBtn.textContent = sortOrder === 'desc' ? '↓ 最新在前' : '↑ 最早在前';
    applyFiltersAndSort();
    renderCurrentPage();
});

// 导航切换
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        currentCategory = category;
        currentFolder = null;
        // 清空筛选条件
        searchInput.value = '';
        dateStartInput.value = '';
        dateEndInput.value = '';
        searchKeyword = '';
        dateStart = '';
        dateEnd = '';
        sortOrder = 'desc';
        sortBtn.dataset.order = 'desc';
        sortBtn.textContent = '↓ 最新在前';

        applyFiltersAndSort();
        renderCurrentPage();
    });
});

// 明暗主题
let darkMode = false;
themeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '');
    themeToggle.textContent = darkMode ? '☀️ 亮色' : '🌙 暗色';
});

// ---------- 初始化 ----------
async function init() {
    await loadManifest();
    applyFiltersAndSort();
    renderCurrentPage();
}

init();