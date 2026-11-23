# 멀티 번역기 아이콘(icons/icon16·32·48·128.png)과 웹스토어 아이콘(store-icon128.png)을 그린다.
# 2026-11-23 사용자: 예전 아이콘은 파란 네모에 '한' 한 글자라 한국어 전용처럼 보였다 — 여러 언어 번역기로 보이게.
# 말풍선 안에 네 글자(A·가·文·ก — 라틴·한글·한자·태국 글자)를 색을 달리해 넣는다. 작은 크기(16·32)는 글자가
# 뭉개져서 두 글자(A·文)만. 크게(1024) 그려 줄인다(가장자리 매끈). 돌리기: py -3 extension/make-icons.py
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'icons')
FONTS = r'C:\Windows\Fonts'
BIG = 1024

BLUE_A = (59, 130, 246)   # 위 왼쪽
BLUE_B = (30, 64, 175)    # 아래 오른쪽
GLYPHS4 = [
    ('A', 'segoeuib.ttf', (37, 99, 235)),     # 라틴
    ('가', 'malgunbd.ttf', (225, 29, 72)),    # 한글
    ('文', 'msyhbd.ttc', (5, 150, 105)),      # 한자
    ('ก', 'LEELAWDB.TTF', (217, 119, 6), 1.3),  # 태국 글자(키가 작아 크게)
]
GLYPHS2 = [GLYPHS4[0], GLYPHS4[2]]


def gradient(size):
    g = Image.new('RGB', (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(BLUE_A[i] + (BLUE_B[i] - BLUE_A[i]) * t) for i in range(3))
    return g


GRAD = gradient(BIG)


def draw_glyph(d, ch, font_file, color, cx, cy, h):
    font = ImageFont.truetype(os.path.join(FONTS, font_file), int(h))
    l, t, r, b = d.textbbox((0, 0), ch, font=font)
    d.text((cx - (l + r) / 2, cy - (t + b) / 2), ch, font=font, fill=color)


def icon(glyphs, pad=0.0):
    """pad: 바깥 빈 칸 비율(웹스토어 아이콘은 128 안에 96 그림 + 16 여백)."""
    S = BIG
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    inner = int(S * (1 - 2 * pad))
    o = int(S * pad)
    # 둥근 네모 바탕(파랑 그러데이션)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([o, o, o + inner - 1, o + inner - 1], radius=int(inner * 0.22), fill=255)
    img.paste(GRAD.resize((S, S)), (0, 0), mask)
    d = ImageDraw.Draw(img)
    P = lambda v: o + inner * v  # noqa: E731 — 0..1 → 픽셀
    # 하얀 말풍선 + 꼬리(아래 왼쪽)
    x0, y0, x1, y1 = P(0.12), P(0.12), P(0.88), P(0.76)
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(inner * 0.15), fill=(255, 255, 255))
    d.polygon([(P(0.24), P(0.74)), (P(0.44), P(0.74)), (P(0.2), P(0.9))], fill=(255, 255, 255))
    bw, bh = x1 - x0, y1 - y0
    if len(glyphs) == 4:
        cells = [(0.29, 0.29), (0.71, 0.29), (0.29, 0.71), (0.71, 0.71)]
        h = inner * 0.255
    else:
        cells = [(0.29, 0.5), (0.71, 0.5)]
        h = inner * 0.36
    for g, (fx, fy) in zip(glyphs, cells):
        ch, f, c = g[:3]
        draw_glyph(d, ch, f, c, x0 + bw * fx, y0 + bh * fy, h * (g[3] if len(g) > 3 else 1))
    return img


def save(img, size, path):
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    four, two = icon(GLYPHS4), icon(GLYPHS2)
    for s in (16, 32, 48, 128):
        save(two if s <= 32 else four, s, os.path.join(OUT, f'icon{s}.png'))
    store = os.path.join(HERE, 'store')
    if os.path.isdir(store):
        save(icon(GLYPHS4, pad=16 / 128), 128, os.path.join(store, 'store-icon128.png'))
        save(icon(GLYPHS4), 512, os.path.join(store, 'icon512.png'))  # 홍보 그림(make-store-images.js)에 쓴다
    print('ok', OUT)
