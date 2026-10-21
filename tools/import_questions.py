"""Import only chapters 01–04, excluding function and programming exercises."""
import argparse
import json
import re
import shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KINDS = {'判断题': 'judge', '选择题': 'choice', '填空题': 'blank', '程序填空题': 'code'}


def build(source):
    questions, chapters = [], []
    for folder in sorted(source.iterdir()):
        if not folder.is_dir() or folder.name[:2] not in ('01', '02', '03', '04'):
            continue
        chapter = int(folder.name[:2])
        chapters.append({'id': chapter, 'name': folder.name[3:]})
        for file in sorted(folder.glob('*.md')):
            label = file.stem[3:]
            if label not in KINDS:
                continue
            raw = file.read_text(encoding='utf-8-sig')
            destination = ROOT / 'sources' / folder.name / file.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, destination)
            blocks = re.split(r'^### (.+)\n', raw, flags=re.M)
            for index in range(1, len(blocks), 2):
                title, content = blocks[index].strip(), blocks[index + 1].strip()
                match = re.search(r'\*\*答案[：:](.*?)\*\*', content, re.S)
                if not match:
                    raise ValueError(f'Missing answer: {file} / {title}')
                prompt = content[:match.start()].strip()
                answer = (match.group(1).strip() + '\n' + content[match.end():].strip()).strip()
                options = []
                if label == '选择题':
                    parts = re.split(r'(?:^|\u3000+)([A-D])[.．、]\s*', prompt, flags=re.M)
                    prompt = parts[0].strip()
                    options = [{'key': parts[i], 'text': parts[i+1].strip()} for i in range(1, len(parts), 2)]
                    assert len(options) >= 2 and [o['key'] for o in options] == list('ABCD')[:len(options)], (file, title, options)
                    assert answer in [o['key'] for o in options]
                if label == '判断题':
                    assert answer in ('T', 'F')
                note = ''
                if label == '程序填空题':
                    # The notes contain complete solutions. Mask only the existing target expressions.
                    code = answer
                    if title == '顺序表删除':
                        prompt = '在长度为 `L.length` 的顺序表中删除第 `i` 个元素。请补全循环条件。'
                        code = code.replace('j < L.length', '/* 空 1 */')
                    elif title == '单链表删除':
                        prompt = '在带头结点的单链表中删除第 `i` 个元素。请补全 while 条件和删除结点时的指针操作。'
                        code = code.replace('p->next && j < i - 1', '/* 空 1 */').replace('p->next = q->next;', '/* 空 2 */')
                    else:
                        raise ValueError(f'Unknown code question: {title}')
                    prompt += '\n\n' + code
                    note = '根据笔记中的完整代码遮去待填位置；参考答案保留笔记原文。'
                damaged = '公式缺失' in answer or '公式已损坏' in prompt
                if damaged:
                    note = '原笔记中部分公式缺失，本题仅供查阅，不计入答题进度。'
                questions.append({
                    'id': f'{chapter:02d}-{KINDS[label]}-{(index+1)//2:03d}',
                    'chapter': chapter, 'type': KINDS[label], 'label': label,
                    'number': (index+1)//2, 'title': title, 'prompt': prompt,
                    'options': options, 'answer': answer, 'note': note,
                    'referenceOnly': damaged,
                    'source': destination.relative_to(ROOT).as_posix(),
                })
    assert len(chapters) == 4
    assert len({q['id'] for q in questions}) == len(questions)
    data = {'version': 1, 'chapters': chapters, 'questions': questions}
    (ROOT / 'data').mkdir(exist_ok=True)
    (ROOT / 'data' / 'questions.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # A classic script also works when index.html is opened directly from disk.
    (ROOT / 'data' / 'questions.js').write_text('window.QUESTION_BANK = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(json.dumps({'total': len(questions), 'types': dict(Counter(q['label'] for q in questions)),
                      'chapters': {c['name']: sum(q['chapter'] == c['id'] for q in questions) for c in chapters},
                      'referenceOnly': sum(q['referenceOnly'] for q in questions)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    build(parser.parse_args().source)
