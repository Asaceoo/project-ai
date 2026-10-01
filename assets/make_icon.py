# -*- coding: utf-8 -*-
"""生成 ACE 开发助手应用图标 assets/app.ico（多尺寸，4x 超采样抗锯齿）。
设计：品牌蓝渐变圆角方块 + 白色圆角徽章块 + 品牌蓝对勾（通过/交付）+ 右上里程碑菱形。
重新生成：python assets/make_icon.py"""
import os
from PIL import Image, ImageDraw

SS = 4
DESIGN = 32  # 设计坐标空间（32x32）
W = H = 256 * SS
K = W // DESIGN  # 超采样画布每设计单位像素数（1024/32 = 32）


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


TOP, BOT = (76, 139, 255), (14, 66, 210)
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = img.load()
for y in range(H):
    t = y / (H - 1)
    c = lerp(TOP, BOT, t)
    for x in range(W):
        px[x, y] = c + (255,)

mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=int(8 * K), fill=255)
img.putalpha(mask)

d = ImageDraw.Draw(img)
# 白色圆角徽章块（占主体 56%，小尺寸下仍清晰）
d.rounded_rectangle([7 * K, 7 * K, 25 * K, 25 * K], radius=int(7 * K), fill=(255, 255, 255, 255))
# 徽章内品牌蓝对勾（验收/交付通过）
d.line([(9.5 * K, 16 * K), (15 * K, 21.5 * K), (23 * K, 11 * K)],
       fill=(30, 86, 239, 255), width=int(7 * K), joint='curve')
# 右上角里程碑菱形（淡蓝点缀，呼应里程碑实体）
d.regular_polygon((27.5 * K, 25.5 * K, 4.8 * K), n_sides=4, rotation=45,
                  fill=(169, 209, 255, 235))

img256 = img.resize((256, 256), Image.LANCZOS)
sizes = [256, 128, 64, 48, 32, 16]
imgs = [img256.resize((s, s), Image.LANCZOS) for s in sizes]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app.ico')
img256.save(out, format='ICO', sizes=[(s, s) for s in sizes], append_images=imgs[1:])
print('saved', out, '| sizes:', sizes)
