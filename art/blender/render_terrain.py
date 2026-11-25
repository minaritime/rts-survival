"""
지도 한 장 전체(바닥 + 절벽 + 괴물 입구)를 찍는다.
  blender -b -P render_terrain.py -- <지도 .ts 파일> <출력.png> [샘플 수]

칸 (c, r) 은 Blender 늘리기 전 좌표로 x ∈ [c, c+1], y ∈ [-(r+1), -r] (r 이 클수록 남쪽).
장면은 남북으로 늘려 찍으므로(common.STRETCH_Y) 바닥 칸이 그림에서 정확히 TILE_PX 정사각형이 된다.
절벽 바위는 윗면이 그 칸에 맞도록 남쪽으로 h·cos45 만큼 밀어 놓는다. 그러면 앞면이 남쪽 칸으로 조금 내려온다.
"""
import math
import os
import random
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

def read_rows(ts_path):
    text = open(ts_path, encoding='utf-8').read()
    rows = re.findall(r"^\s*'([^']*)',\s*$", text, flags=re.MULTILINE)
    if not rows or any(len(r) != len(rows[0]) for r in rows):
        raise ValueError(f'지도 줄을 못 읽음: {ts_path}')
    return rows


def link(nt, out_socket, in_socket):
    nt.links.new(out_socket, in_socket)


def socket(sockets, name, kind):
    return next(s for s in sockets if s.name == name and s.type == kind)


def ground_material():
    m = bpy.data.materials.new('ground')
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    nt = m.node_tree
    nodes = nt.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.95

    coord = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 0.18
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.62
    link(nt, coord.outputs['Object'], noise.inputs['Vector'])

    # 1층: 어두운 현무암 바탕 (작은 무늬로 얼룩덜룩)
    noise.inputs['Scale'].default_value = 0.6
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.008, 0.01, 0.016, 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (0.035, 0.038, 0.048, 1)
    link(nt, noise.outputs['Fac'], ramp.inputs['Fac'])

    # 2층: 먼지 낀 갈색 얼룩 (경계가 또렷한 덩어리)
    dust_noise = nodes.new('ShaderNodeTexNoise')
    dust_noise.inputs['Scale'].default_value = 0.22
    dust_noise.inputs['Detail'].default_value = 3.0
    link(nt, coord.outputs['Object'], dust_noise.inputs['Vector'])
    dust_mask = nodes.new('ShaderNodeValToRGB')
    dust_mask.color_ramp.elements[0].position = 0.55
    dust_mask.color_ramp.elements[1].position = 0.62
    link(nt, dust_noise.outputs['Fac'], dust_mask.inputs['Fac'])
    dust = nodes.new('ShaderNodeMix')
    dust.data_type = 'RGBA'
    link(nt, dust_mask.outputs['Color'], socket(dust.inputs, 'Factor', 'VALUE'))
    link(nt, ramp.outputs['Color'], socket(dust.inputs, 'A', 'RGBA'))
    socket(dust.inputs, 'B', 'RGBA').default_value = (0.07, 0.055, 0.042, 1)

    # 3층: 균열 (어둡게 곱하기)
    cracks = nodes.new('ShaderNodeTexVoronoi')
    cracks.feature = 'DISTANCE_TO_EDGE'
    cracks.inputs['Scale'].default_value = 0.8
    cracks.inputs['Randomness'].default_value = 1.0
    link(nt, coord.outputs['Object'], cracks.inputs['Vector'])
    crack_ramp = nodes.new('ShaderNodeValToRGB')
    crack_ramp.color_ramp.elements[0].position = 0.0
    crack_ramp.color_ramp.elements[0].color = (0.62, 0.62, 0.62, 1)  # 옅게 (진하면 큰 판처럼 보임)
    crack_ramp.color_ramp.elements[1].position = 0.012
    crack_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    link(nt, cracks.outputs['Distance'], crack_ramp.inputs['Fac'])

    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    socket(mix.inputs, 'Factor', 'VALUE').default_value = 1.0
    link(nt, socket(dust.outputs, 'Result', 'RGBA'), socket(mix.inputs, 'A', 'RGBA'))
    link(nt, crack_ramp.outputs['Color'], socket(mix.inputs, 'B', 'RGBA'))
    link(nt, socket(mix.outputs, 'Result', 'RGBA'), bsdf.inputs['Base Color'])

    # 요철: 잔무늬 + 균열이 파인 것
    fine = nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 7.0
    fine.inputs['Detail'].default_value = 6.0
    link(nt, coord.outputs['Object'], fine.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    link(nt, fine.outputs['Fac'], bump.inputs['Height'])
    crack_bump = nodes.new('ShaderNodeBump')
    crack_bump.inputs['Strength'].default_value = 0.6
    link(nt, crack_ramp.outputs['Color'], crack_bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], crack_bump.inputs['Normal'])
    link(nt, crack_bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def rock_material():
    m = common.material('cliff', (0.05, 0.05, 0.06), roughness=0.85)
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.4
    link(nt, coord.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.015, 0.015, 0.02, 1)
    ramp.color_ramp.elements[1].color = (0.075, 0.068, 0.072, 1)
    link(nt, noise.outputs['Fac'], ramp.inputs['Fac'])
    link(nt, ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def add_mesh_object(name, bm, material, parent):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = False
    return obj


def rough_boulder(bm, center, radius_xy, height, rng, jitter=0.06):
    """각진 바위 하나: 정이십면체를 납작하게 하고 꼭짓점을 흔든다"""
    mat = Matrix.Translation(center) @ Matrix.Diagonal((radius_xy, radius_xy * rng.uniform(0.85, 1.1), height, 1))
    made = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=mat)
    for v in made['verts']:
        v.co += Vector((rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter)))


CLIFF_HEIGHT = 0.7


def rock_slab(bm, cx, cy, h, rng):
    """칸 하나를 꽉 채우는 바위 판. 이웃 칸 판과 살짝 겹쳐 끊김 없는 벽이 된다. 윗면만 울퉁불퉁"""
    mat = Matrix.Translation((cx, cy, h / 2)) @ Matrix.Diagonal((0.56, 0.56, h / 2, 1))
    made = bmesh.ops.create_cube(bm, size=2.0, matrix=mat)
    for v in made['verts']:
        if v.co.z > h * 0.5:
            v.co += Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), rng.uniform(-0.08, 0.1)))


def build_cliffs(rows, root, rng):
    bm = bmesh.new()
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch != '#':
                continue
            h = CLIFF_HEIGHT * rng.uniform(0.9, 1.1)
            slab_h = h * 0.55
            # 받침 판 윗면을 그 칸에 맞추려고 남쪽으로 미는 양 (그 위 바위는 칸보다 살짝 솟아도 됨).
            # 전체 높이 h 로 계산하면 벽이 1.6칸 두께로 보이고 앞면이 남쪽 칸 한가운데를 넘는다
            shift = slab_h * common.HEIGHT_TO_SCREEN
            cx = c + 0.5
            cy = -(r + 0.5) - shift
            rock_slab(bm, cx, cy, slab_h, rng)
            # 받침 위에 크기가 제각각인 뾰족한 바위를 겹겹이 (평평한 돌바닥처럼 보이지 않게)
            rough_boulder(bm, Vector((cx, cy, h * 0.45)), rng.uniform(0.45, 0.6), h * rng.uniform(0.45, 0.7), rng, 0.12)
            for _ in range(rng.randint(3, 5)):
                rough_boulder(bm, Vector((cx + rng.uniform(-0.45, 0.45), cy + rng.uniform(-0.45, 0.45), h * 0.5)),
                              rng.uniform(0.18, 0.38), h * rng.uniform(0.25, 0.6), rng, 0.08)
    return add_mesh_object('cliffs', bm, rock_material(), root)


def build_pebbles(rows, root, rng):
    """빈 땅에 작은 돌을 흩어 놓아 바닥이 밋밋하지 않게"""
    bm = bmesh.new()
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch != '.' or rng.random() > 0.35:
                continue
            for _ in range(rng.randint(1, 3)):
                s = rng.uniform(0.03, 0.09)
                center = Vector((c + rng.uniform(0.1, 0.9), -(r + rng.uniform(0.1, 0.9)), s * 0.3))
                rough_boulder(bm, center, s, s * 0.6, rng)
    return add_mesh_object('pebbles', bm, rock_material(), root)


def build_entrances(rows, root):
    """괴물 입구: 어두운 금속 판 위에 붉게 빛나는 줄 3개"""
    plate = common.material('hazard_plate', (0.05, 0.03, 0.03), metallic=0.6, roughness=0.5)
    glow = common.material('hazard', (0.3, 0.0, 0.0), roughness=0.4, emission=(1.0, 0.05, 0.02), emission_strength=1.4)
    plates, strips = bmesh.new(), bmesh.new()
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch not in 'NE':
                continue
            cx, cy = c + 0.5, -(r + 0.5)
            bmesh.ops.create_cube(plates, size=2.0,
                                  matrix=Matrix.Translation((cx, cy, 0.015)) @ Matrix.Diagonal((0.48, 0.48, 0.015, 1)))
            for i in (-1, 0, 1):  # 입구 방향과 나란한 줄
                along_x = ch == 'N'
                off = i * 0.27
                pos = (cx + off, cy, 0.035) if along_x else (cx, cy + off, 0.035)
                size = (0.05, 0.4, 0.01) if along_x else (0.4, 0.05, 0.01)
                bmesh.ops.create_cube(strips, size=2.0, matrix=Matrix.Translation(pos) @ Matrix.Diagonal((*size, 1)))
    add_mesh_object('entrance_plates', plates, plate, root)
    return add_mesh_object('entrances', strips, glow, root)


def main():
    args = common.script_args()
    ts_path, out = args[0], args[1]
    samples = int(args[2]) if len(args) > 2 else 24
    rows = read_rows(ts_path)
    width, height = len(rows[0]), len(rows)
    rng = random.Random(42)

    common.reset_scene(samples=samples)
    bpy.context.scene.render.film_transparent = False
    common.add_lights()
    root = common.stretch_root(stretch=True)

    bpy.ops.mesh.primitive_plane_add(size=1, location=(width / 2, -height / 2, 0))
    ground = bpy.context.active_object
    ground.scale = (width + 2, height + 2, 1)
    # 무늬는 물체 자기 좌표로 계산하므로, 키운 크기를 굳혀야 1 단위 = 1칸 이 된다
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ground.parent = root
    ground.data.materials.append(ground_material())

    build_cliffs(rows, root, rng)
    build_pebbles(rows, root, rng)
    build_entrances(rows, root)

    common.add_camera(width / 2, -height / 2, width, height, stretch=True)
    # ART_CROP="x0,y0,x1,y1" (0~1, 왼쪽 아래 기준): 고치는 동안 일부만 빨리 찍기
    crop = os.environ.get('ART_CROP')
    if crop:
        # 잘린 그림이 게임용 지형(public/...)을 덮어쓰지 않게 이름을 바꾼다
        stem, ext = os.path.splitext(out)
        out = f'{stem}.crop{ext}'
        x0, y0, x1, y1 = (float(v) for v in crop.split(','))
        render = bpy.context.scene.render
        render.use_border = True
        render.use_crop_to_border = True
        render.border_min_x, render.border_min_y, render.border_max_x, render.border_max_y = x0, y0, x1, y1
    if out.lower().endswith('.jpg'):
        # 지형은 투명한 곳이 없으니 JPEG 로 (PNG 는 약 9MB, JPEG 는 약 1MB)
        settings = bpy.context.scene.render.image_settings
        settings.file_format = 'JPEG'
        settings.color_mode = 'RGB'
        settings.quality = 90
    common.render_to(out)


main()
