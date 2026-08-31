// scripts/generate-manifest.js

const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '../content');
const categories = ['daily', 'articles', 'anime'];
const manifest = {};

// 解析 index.md 中的元数据
function parseMeta(filePath, folderName) {
    const content = fs.readFileSync(filePath, 'utf8');
    let title = null;
    let date = null;
    let tags = [];
    let order = null;   // 用于同天排序的数字或时间字符串

    // 1. 解析 YAML Front Matter
    const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontMatterRegex);
    if (match) {
        const frontMatter = match[1];
        // 提取 title
        const titleMatch = frontMatter.match(/^title:\s*(.+)$/m);
        if (titleMatch) title = titleMatch[1].trim();
        // 提取 date
        const dateMatch = frontMatter.match(/^date:\s*(.+)$/m);
        if (dateMatch) date = dateMatch[1].trim();
        // 提取 tags（支持数组或逗号分隔字符串）
        const tagsMatch = frontMatter.match(/^tags:\s*(.+)$/m);
        if (tagsMatch) {
            let raw = tagsMatch[1].trim();
            // 尝试解析为数组 [tag1, tag2]
            if (raw.startsWith('[') && raw.endsWith(']')) {
                tags = raw.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            } else {
                // 否则按逗号分隔
                tags = raw.split(',').map(s => s.trim());
            }
        }
        // 提取 order（用于同天排序）
        const orderMatch = frontMatter.match(/^order:\s*(.+)$/m);
        if (orderMatch) order = orderMatch[1].trim();
        // 也可提取 time（如 "14:30"）作为排序依据
        const timeMatch = frontMatter.match(/^time:\s*(.+)$/m);
        if (timeMatch && !order) order = timeMatch[1].trim(); // time 也用于排序
    }

    // 2. 如果 Front Matter 没有 title，尝试第一个 # 标题
    if (!title) {
        const titleRegex = /^#\s+(.+)$/m;
        const titleMatch = content.match(titleRegex);
        if (titleMatch) title = titleMatch[1].trim();
    }

    // 3. 如果仍然没有标题，使用文件夹名
    if (!title) {
        title = folderName.replace(/-/g, ' ');
    }

    // 4. 如果还没有日期，从文件夹名提取
    if (!date) {
        const dateRegex = /^(\d{4}-\d{2}-\d{2})/;
        const dateMatch = folderName.match(dateRegex);
        if (dateMatch) date = dateMatch[1];
    }
    if (!date) {
        const stats = fs.statSync(filePath);
        date = stats.mtime.toISOString().slice(0, 10);
    }

    // 5. 如果没有 order，默认按标题排序（或留空）
    if (!order) order = '';

    return { title, date, tags, order };
}

// 自动修补缺失标题（保留原功能）
function ensureTitle(filePath, fallbackTitle) {
    const content = fs.readFileSync(filePath, 'utf8');
    let title = null;
    let hasFrontMatter = false;

    const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontMatterRegex);
    if (match) {
        hasFrontMatter = true;
        const frontMatter = match[1];
        const titleMatch = frontMatter.match(/^title:\s*(.+)$/m);
        if (titleMatch) title = titleMatch[1].trim();
    }

    if (!title) {
        const titleRegex = /^#\s+(.+)$/m;
        const titleMatch = content.match(titleRegex);
        if (titleMatch) title = titleMatch[1].trim();
    }

    if (!title) {
        const newTitle = fallbackTitle.replace(/-/g, ' ');
        let newContent;
        if (hasFrontMatter) {
            // 已有 Front Matter，插入 title
            const frontMatterEnd = match[0].length;
            const before = content.slice(0, frontMatterEnd);
            const after = content.slice(frontMatterEnd);
            const modifiedFrontMatter = match[1] + `\ntitle: ${newTitle}`;
            const newFrontMatter = `---\n${modifiedFrontMatter}\n---`;
            newContent = newFrontMatter + after;
        } else {
            newContent = `# ${newTitle}\n\n` + content;
        }
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`🔧 已为 ${path.basename(path.dirname(filePath))} 添加标题: ${newTitle}`);
        return newTitle;
    }
    return title;
}

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
        const { title, date, tags, order } = parseMeta(indexMdPath, folder);
        return { folder, title, date, tags, order };
    });

    // 排序：先按日期降序，同一天按 order 升序（数字或字符串），再按标题
    posts.sort((a, b) => {
        if (a.date !== b.date) {
            return b.date.localeCompare(a.date); // 日期降序
        }
        // 同一天：比较 order
        if (a.order !== b.order) {
            // 如果是数字字符串，转为数字比较
            const aNum = parseFloat(a.order);
            const bNum = parseFloat(b.order);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return a.order.localeCompare(b.order);
        }
        // order 相同，按标题
        return a.title.localeCompare(b.title);
    });

    manifest[cat] = posts;
});

// 写入 manifest.json
const manifestPath = path.join(__dirname, '../data/manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✅ Manifest generated with tags and order!');