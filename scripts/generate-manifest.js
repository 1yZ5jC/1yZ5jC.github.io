const fs = require('fs');
const path = require('path');

const contentDir = path.join(__dirname, '../content');
const categories = ['daily', 'articles', 'anime'];
const manifest = {};

categories.forEach(cat => {
    const catPath = path.join(contentDir, cat);
    if (!fs.existsSync(catPath)) return;
    const folders = fs.readdirSync(catPath).filter(item => {
        const itemPath = path.join(catPath, item);
        return fs.statSync(itemPath).isDirectory() && 
               fs.existsSync(path.join(itemPath, 'index.md')); // 必须有 index.md 才视为文章
    });
    manifest[cat] = folders.map(folder => ({
        folder: folder,
        title: folder.replace(/-/g, ' ') // 简单从文件夹名生成标题
    }));
});

fs.writeFileSync(
    path.join(__dirname, '../data/manifest.json'),
    JSON.stringify(manifest, null, 2)
);
console.log('✅ Manifest generated!');