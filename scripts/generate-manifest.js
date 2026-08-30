const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '../content');
const categories = ['daily', 'articles', 'anime'];
const manifest = {};

// ---------- 自动修补 Markdown 标题 ----------
function ensureTitle(filePath, fallbackTitle) {
    const content = fs.readFileSync(filePath, 'utf8');
    let title = null;
    let hasFrontMatter = false;
    let hasMarkdownTitle = false;

    // 检查是否有 Front Matter 中的 title
    const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontMatterRegex);
    if (match) {
        hasFrontMatter = true;
        const frontMatter = match[1];
        const titleMatch = frontMatter.match(/^title:\s*(.+)$/m);
        if (titleMatch) title = titleMatch[1].trim();
    }

    // 检查是否有 Markdown 一级标题
    if (!title) {
        const titleRegex = /^#\s+(.+)$/m;
        const titleMatch = content.match(titleRegex);
        if (titleMatch) {
            title = titleMatch[1].trim();
            hasMarkdownTitle = true;
        }
    }

    // 如果两者都没有，则自动修补
    if (!title) {
        // 使用 fallbackTitle（通常是文件夹名）作为新标题
        const newTitle = fallbackTitle.replace(/-/g, ' ');
        let newContent;

        if (hasFrontMatter) {
            // 已有 Front Matter，但缺少 title 字段，在 Front Matter 内插入
            const frontMatterEnd = match[0].length;
            const before = content.slice(0, frontMatterEnd);
            const after = content.slice(frontMatterEnd);
            // 在 Front Matter 末尾（--- 之前）插入 title
            const modifiedFrontMatter = match[1] + `\ntitle: ${newTitle}`;
            const newFrontMatter = `---\n${modifiedFrontMatter}\n---`;
            newContent = newFrontMatter + after;
        } else {
            // 没有 Front Matter，直接在文件开头插入 # 标题
            newContent = `# ${newTitle}\n\n` + content;
        }

        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`🔧 已为 ${path.basename(path.dirname(filePath))} 添加标题: ${newTitle}`);
        return newTitle;
    }

    return title;
}

// 解析元数据（标题和日期），并自动修补缺失标题
function parseMeta(filePath, folderName) {
    const content = fs.readFileSync(filePath, 'utf8');
    let title = null;
    let date = null;

    // 1. 尝试解析 YAML Front Matter
    const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontMatterRegex);
    if (match) {
        const frontMatter = match[1];
        const titleMatch = frontMatter.match(/^title:\s*(.+)$/m);
        if (titleMatch) title = titleMatch[1].trim();
        const dateMatch = frontMatter.match(/^date:\s*(.+)$/m);
        if (dateMatch) date = dateMatch[1].trim();
    }

    // 2. 如果 Front Matter 没有 title，尝试第一个 # 标题
    if (!title) {
        const titleRegex = /^#\s+(.+)$/m;
        const titleMatch = content.match(titleRegex);
        if (titleMatch) title = titleMatch[1].trim();
    }

    // 3. 如果仍然没有标题，调用自动修补
    if (!title) {
        title = ensureTitle(filePath, folderName);
    }

    // 4. 提取日期（从 Front Matter 或文件夹名）
    if (!date) {
        const dateRegex = /^(\d{4}-\d{2}-\d{2})/;
        const dateMatch = folderName.match(dateRegex);
        if (dateMatch) date = dateMatch[1];
    }
    if (!date) {
        const stats = fs.statSync(filePath);
        date = stats.mtime.toISOString().slice(0, 10);
    }

    return { title, date };
}

// ---------- 主流程 ----------
categories.forEach(cat => {
    const catPath = path.join(contentDir, cat);
    if (!fs.existsSync(catPath)) {
        manifest[cat] = [];
        return;
    }

    const folders = fs.readdirSync(catPath).filter(item => {
        const itemPath = path.join(catPath, item);
        return fs.statSync(itemPath).isDirectory() &&
               fs.existsSync(path.join(itemPath, 'index.md'));
    });

    const posts = folders.map(folder => {
        const indexMdPath = path.join(catPath, folder, 'index.md');
        const { title, date } = parseMeta(indexMdPath, folder);
        return { folder, title, date };
    });

    // 按日期降序排序
    posts.sort((a, b) => {
        if (a.date && b.date) {
            return b.date.localeCompare(a.date);
        }
        return 0;
    });

    manifest[cat] = posts;
});

// 写入 manifest.json
const manifestPath = path.join(__dirname, '../data/manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✅ Manifest generated with titles and dates!');