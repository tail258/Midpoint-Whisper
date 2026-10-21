# Midpoint Whisper

个人数据结构刷题网站。包含 PTA 笔记前四章的判断、选择、填空和程序填空，共 145 题，排除函数题和编程题。原笔记有 1 题公式缺失，仅供查阅，不计答题进度。

选择章节和题型后直接答题；点击「题号」跳转。判断、选择自动判分，填空对照答案自评。错题、收藏、草稿与答题位置保存在当前浏览器。支持左右方向键翻题。

纯静态页面，可直接打开 `index.html`，或用 `python -m http.server 4173` 在本地预览。GitHub Pages 从 `main` 分支根目录发布。

题库来自 `sources/` 中的原始笔记，`tools/import_questions.py` 负责生成 `data/questions.json` 和可直接离线加载的 `data/questions.js`。

```powershell
python tools/import_questions.py --source "path/to/PTA-notes"
```
