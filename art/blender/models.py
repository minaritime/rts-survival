"""
게임에 나오는 것들의 3D 모델 (어두운 SF, 저폴리).
모든 모델은 바닥 원점(0, 0, 0) = 칸 한가운데에 서고, 앞쪽은 +X(동쪽)를 본다.
1 단위 = 1칸.
"""
import math
import random

import bpy

import common

# ---------- 재질 (한 번 만들어 같이 씀) ----------
_MATS = {}


def mat(name):
    if name in _MATS:
        return _MATS[name]
    specs = {
        'rock': dict(color=(0.045, 0.045, 0.055), roughness=0.92),
        'crystal': dict(color=(0.02, 0.35, 0.65), roughness=0.12, emission=(0.05, 0.6, 1.0), emission_strength=2.2),
        'leaf': dict(color=(0.03, 0.16, 0.13), roughness=0.7),
        'leaf_dead': dict(color=(0.07, 0.07, 0.06), roughness=0.85),
        'pod': dict(color=(0.55, 0.02, 0.3), roughness=0.3, emission=(1.0, 0.1, 0.55), emission_strength=2.5),
        'hull': dict(color=(0.13, 0.14, 0.16), metallic=0.8, roughness=0.45),
        'rust': dict(color=(0.22, 0.09, 0.04), metallic=0.5, roughness=0.8),
        'ember': dict(color=(0.3, 0.1, 0.0), emission=(1.0, 0.38, 0.05), emission_strength=4.0),
        'pad': dict(color=(0.08, 0.085, 0.1), metallic=0.7, roughness=0.5),
        'feed_on': dict(color=(0.4, 0.3, 0.0), emission=(1.0, 0.78, 0.15), emission_strength=4.0),
        'feed_off': dict(color=(0.12, 0.1, 0.04), roughness=0.5),
        'hide': dict(color=(0.32, 0.3, 0.36), roughness=0.75),
        'hide_dark': dict(color=(0.14, 0.13, 0.17), roughness=0.8),
        'eye': dict(color=(0.2, 0.4, 0.0), emission=(0.6, 1.0, 0.2), emission_strength=4.0),
        'armor': dict(color=(0.07, 0.11, 0.2), metallic=0.65, roughness=0.4),
        'armor_light': dict(color=(0.22, 0.27, 0.36), metallic=0.7, roughness=0.35),
        'suit': dict(color=(0.03, 0.035, 0.045), roughness=0.7),
        'visor': dict(color=(0.0, 0.3, 0.5), roughness=0.05, emission=(0.1, 0.8, 1.0), emission_strength=5.0),
        'gun': dict(color=(0.05, 0.05, 0.055), metallic=0.9, roughness=0.35),
        'hazard': dict(color=(0.55, 0.2, 0.02), roughness=0.55),
        'hazard_light': dict(color=(0.75, 0.55, 0.05), metallic=0.2, roughness=0.4),
        'olive': dict(color=(0.1, 0.13, 0.07), metallic=0.5, roughness=0.5),
        'olive_light': dict(color=(0.2, 0.24, 0.14), metallic=0.6, roughness=0.4),
        'steel': dict(color=(0.2, 0.2, 0.22), metallic=0.85, roughness=0.35),
        'steel_light': dict(color=(0.42, 0.42, 0.45), metallic=0.85, roughness=0.3),
        'visor_orange': dict(color=(0.5, 0.15, 0.0), roughness=0.05, emission=(1.0, 0.45, 0.05), emission_strength=4.0),
        # 괴물: 검붉은 껍질 + 빨갛게 빛나는 눈·갈라진 틈
        'carapace': dict(color=(0.16, 0.03, 0.03), metallic=0.2, roughness=0.45),
        'carapace_light': dict(color=(0.32, 0.08, 0.05), metallic=0.25, roughness=0.4),
        'monster_eye': dict(color=(0.5, 0.0, 0.0), emission=(1.0, 0.08, 0.02), emission_strength=6.0),
        'monster_glow': dict(color=(0.4, 0.02, 0.0), emission=(1.0, 0.07, 0.02), emission_strength=4.0),
        'bone': dict(color=(0.55, 0.5, 0.42), roughness=0.6),
        'flesh': dict(color=(0.35, 0.05, 0.06), roughness=0.55),
    }
    _MATS[name] = common.material(name, **specs[name])
    return _MATS[name]


# ---------- 도형 도우미 ----------
def part(kind, material, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), parent=None, **kw):
    ops = {
        'cube': bpy.ops.mesh.primitive_cube_add,
        'cyl': bpy.ops.mesh.primitive_cylinder_add,
        'cone': bpy.ops.mesh.primitive_cone_add,
        'ico': bpy.ops.mesh.primitive_ico_sphere_add,
        'uv': bpy.ops.mesh.primitive_uv_sphere_add,
    }
    ops[kind](location=loc, rotation=rot, **kw)
    obj = bpy.context.active_object
    obj.scale = scale
    common.assign(obj, mat(material))
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    if parent is not None:
        e.parent = parent
    bpy.context.scene.collection.objects.link(e)
    return e


# ---------- 자원 ----------
def mineral(root, seed=1):
    """바위 받침에서 결정이 바깥쪽으로 기울며 솟는다. 가운데가 가장 높다"""
    random.seed(seed)
    base = part('ico', 'rock', subdivisions=1, loc=(0, 0, 0.02), scale=(0.34, 0.3, 0.1), parent=root)
    common.flat_shading(base)
    count = 9
    for i in range(count):
        a = i / count * math.tau + random.uniform(-0.3, 0.3)
        r = 0.0 if i == 0 else random.uniform(0.08, 0.24)
        h = (0.95 if i == 0 else random.uniform(0.35, 0.7)) * random.uniform(0.9, 1.1)
        lean = 0.0 if i == 0 else random.uniform(0.25, 0.5)
        c = part('cone', 'crystal', vertices=6, radius1=random.uniform(0.07, 0.11) * (1.4 if i == 0 else 1),
                 radius2=0.0, depth=h,
                 loc=(math.cos(a) * r, math.sin(a) * r, h / 2 - 0.02),
                 # 바깥쪽으로 기울이기: 반지름 방향 축으로 돌림
                 rot=(-math.sin(a) * lean, math.cos(a) * lean, random.uniform(0, math.pi)),
                 parent=root)
        common.flat_shading(c)


def berry_bush(root, fill=1.0, seed=2):
    """fill: 1 가득, 0.5 반, 0 빈 덤불"""
    random.seed(seed)
    leaf = 'leaf' if fill > 0 else 'leaf_dead'
    for _ in range(7):
        a = random.uniform(0, math.tau)
        r = random.uniform(0.05, 0.28)
        s = random.uniform(0.16, 0.24)
        o = part('ico', leaf, subdivisions=1, loc=(math.cos(a) * r, math.sin(a) * r, 0.12 + random.uniform(0, 0.12)),
                 scale=(s, s, s * 0.7), rot=(0, 0, random.uniform(0, math.pi)), parent=root)
        common.flat_shading(o)
    pods = round(6 * fill)
    for i in range(pods):
        a = i / max(pods, 1) * math.tau + random.uniform(-0.3, 0.3)
        r = random.uniform(0.15, 0.3)
        part('uv', 'pod', segments=8, ring_count=6, loc=(math.cos(a) * r, math.sin(a) * r, 0.22 + random.uniform(0, 0.12)),
             scale=(0.075, 0.075, 0.075), parent=root)


def debris(root, seed=3):
    """추락한 기계 잔해: 어두운 금속판 몇 장 + 휜 뼈대 + 원통 부품 + 불씨"""
    random.seed(seed)
    for i in range(4):
        sx, sy, sz = random.uniform(0.14, 0.3), random.uniform(0.1, 0.22), 0.02
        p = part('cube', 'rust' if i == 0 else 'hull',
                 loc=(random.uniform(-0.18, 0.18), random.uniform(-0.18, 0.18), 0.05 + i * 0.03),
                 scale=(sx, sy, sz),
                 rot=(random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), random.uniform(0, math.pi)), parent=root)
        common.bevel(p, 0.008, 1)
    for i in range(3):  # 휜 뼈대
        part('cube', 'gun', loc=(-0.12 + i * 0.1, 0.02, 0.14 + i * 0.03), scale=(0.015, 0.015, 0.16),
             rot=(0.4 + i * 0.25, 0.7 - i * 0.3, 0.3), parent=root)
    part('cyl', 'hull', vertices=10, loc=(0.1, -0.08, 0.1), scale=(0.06, 0.06, 0.2), rot=(1.3, 0.3, 0.7), parent=root)
    part('cyl', 'pad', vertices=10, loc=(0.1, -0.08, 0.1), scale=(0.065, 0.065, 0.02), rot=(1.3, 0.3, 0.7), parent=root)
    part('ico', 'ember', subdivisions=1, loc=(-0.06, 0.08, 0.1), scale=(0.05, 0.05, 0.04), parent=root)
    part('ico', 'ember', subdivisions=1, loc=(0.05, 0.12, 0.06), scale=(0.025, 0.025, 0.02), parent=root)


def feeder(root, on=True):
    """식량 배급처: 육각 받침 + 원통 탱크 + 빛나는 띠 + 안테나"""
    pad = part('cyl', 'pad', vertices=6, loc=(0, 0, 0.04), scale=(0.47, 0.47, 0.04), parent=root)
    common.bevel(pad, 0.02, 1)
    part('cyl', 'hull', vertices=12, loc=(0, 0, 0.3), scale=(0.25, 0.25, 0.24), parent=root)
    part('cyl', 'feed_on' if on else 'feed_off', vertices=12, loc=(0, 0, 0.32), scale=(0.262, 0.262, 0.04), parent=root)
    part('cyl', 'feed_on' if on else 'feed_off', vertices=12, loc=(0, 0, 0.18), scale=(0.262, 0.262, 0.02), parent=root)
    part('uv', 'hull', segments=12, ring_count=6, loc=(0, 0, 0.54), scale=(0.25, 0.25, 0.1), parent=root)
    part('cyl', 'gun', vertices=6, loc=(0.12, 0.05, 0.75), scale=(0.015, 0.015, 0.2), parent=root)
    part('uv', 'feed_on' if on else 'feed_off', segments=8, ring_count=6, loc=(0.12, 0.05, 0.96), scale=(0.035, 0.035, 0.035), parent=root)
    for a in range(3):
        ang = a / 3 * math.tau + 0.4
        part('cube', 'pad', loc=(math.cos(ang) * 0.36, math.sin(ang) * 0.36, 0.1), scale=(0.07, 0.05, 0.06),
             rot=(0, 0, ang), parent=root)


# ---------- 생물 ----------
def grazer(root):
    """사냥감: 다리 넷 달린 외계 초식 동물. 앞은 +X"""
    body = part('uv', 'hide', segments=10, ring_count=6, loc=(0, 0, 0.3), scale=(0.3, 0.17, 0.15), parent=root)
    common.flat_shading(body)
    part('uv', 'hide_dark', segments=8, ring_count=5, loc=(0.02, 0, 0.42), scale=(0.2, 0.12, 0.06), parent=root)
    head = part('uv', 'hide', segments=8, ring_count=5, loc=(0.32, 0, 0.36), scale=(0.11, 0.08, 0.08), parent=root)
    common.flat_shading(head)
    for side in (1, -1):
        part('uv', 'eye', segments=6, ring_count=4, loc=(0.4, 0.045 * side, 0.39), scale=(0.022, 0.022, 0.022), parent=root)
    for fx in (0.17, -0.17):
        for side in (1, -1):
            part('cyl', 'hide_dark', vertices=6, loc=(fx, 0.1 * side, 0.1), scale=(0.035, 0.035, 0.1), parent=root)


def commander(root):
    """
    지휘관: 장갑복 입은 사람. 앞은 +X.
    돌려주는 dict 의 골반·어깨 빈 객체를 돌려 걷는 동작을 만든다.
    """
    rig = {}
    # 다리 (골반에서 매달림)
    for side, name in ((1, 'legL'), (-1, 'legR')):
        hip = empty(name, loc=(0, 0.09 * side, 0.36), parent=root)
        part('cube', 'suit', loc=(0, 0, -0.17), scale=(0.06, 0.055, 0.17), parent=hip)
        part('cube', 'armor', loc=(0.02, 0, -0.33), scale=(0.08, 0.06, 0.035), parent=hip)  # 장화
        part('cube', 'armor_light', loc=(0.04, 0, -0.12), scale=(0.035, 0.06, 0.06), parent=hip)  # 무릎 보호대
        rig[name] = hip
    # 몸통
    torso = part('cube', 'armor', loc=(0, 0, 0.52), scale=(0.11, 0.15, 0.17), parent=root)
    common.bevel(torso, 0.03, 2)
    part('cube', 'visor', loc=(0.112, 0, 0.57), scale=(0.005, 0.07, 0.012), parent=root)  # 가슴 불빛
    pack = part('cube', 'armor_light', loc=(-0.13, 0, 0.55), scale=(0.05, 0.11, 0.13), parent=root)
    common.bevel(pack, 0.02, 1)
    part('cyl', 'visor', vertices=8, loc=(-0.185, 0, 0.6), scale=(0.02, 0.02, 0.06), parent=root)
    # 어깨 + 팔
    for side, name in ((1, 'armL'), (-1, 'armR')):
        shoulder = empty(name, loc=(0, 0.19 * side, 0.64), parent=root)
        pad = part('uv', 'armor_light', segments=8, ring_count=5, loc=(0, 0, 0.02), scale=(0.08, 0.07, 0.06), parent=shoulder)
        common.flat_shading(pad)
        part('cube', 'suit', loc=(0, 0, -0.14), scale=(0.045, 0.045, 0.13), parent=shoulder)
        rig[name] = shoulder
    # 총 (오른손)
    part('cube', 'gun', loc=(0.16, -0.19, 0.42), scale=(0.16, 0.025, 0.035), parent=root)
    # 머리
    helmet = part('uv', 'armor', segments=10, ring_count=7, loc=(0, 0, 0.78), scale=(0.1, 0.095, 0.1), parent=root)
    common.flat_shading(helmet)
    part('cube', 'visor', loc=(0.075, 0, 0.785), scale=(0.035, 0.075, 0.03), parent=root)
    return rig


def _humanoid(root, armor, armor_light, suit, visor, scale=1.0):
    """사람 모양 공용 틀 (지휘관과 같은 짜임). 앞은 +X. 걷기용 골반·어깨 빈 객체 dict 를 돌려준다"""
    rig = {}
    s = scale
    for side, name in ((1, 'legL'), (-1, 'legR')):
        hip = empty(name, loc=(0, 0.09 * side * s, 0.36 * s), parent=root)
        part('cube', suit, loc=(0, 0, -0.17 * s), scale=(0.06 * s, 0.055 * s, 0.17 * s), parent=hip)
        part('cube', armor, loc=(0.02 * s, 0, -0.33 * s), scale=(0.08 * s, 0.06 * s, 0.035 * s), parent=hip)
        rig[name] = hip
    torso = part('cube', armor, loc=(0, 0, 0.52 * s), scale=(0.11 * s, 0.15 * s, 0.17 * s), parent=root)
    common.bevel(torso, 0.03 * s, 2)
    for side, name in ((1, 'armL'), (-1, 'armR')):
        shoulder = empty(name, loc=(0, 0.19 * side * s, 0.64 * s), parent=root)
        pad = part('uv', armor_light, segments=8, ring_count=5, loc=(0, 0, 0.02 * s), scale=(0.07 * s, 0.065 * s, 0.055 * s),
                   parent=shoulder)
        common.flat_shading(pad)
        part('cube', suit, loc=(0, 0, -0.14 * s), scale=(0.045 * s, 0.045 * s, 0.13 * s), parent=shoulder)
        rig[name] = shoulder
    helmet = part('uv', armor_light, segments=10, ring_count=7, loc=(0, 0, 0.78 * s), scale=(0.1 * s, 0.095 * s, 0.1 * s),
                  parent=root)
    common.flat_shading(helmet)
    part('cube', visor, loc=(0.075 * s, 0, 0.785 * s), scale=(0.035 * s, 0.075 * s, 0.03 * s), parent=root)
    return rig


def worker(root):
    """일꾼: 주황 작업복 + 노란 안전모 + 손에 드릴 + 등에 탱크 (지휘관보다 조금 작게)"""
    s = 0.9
    rig = _humanoid(root, 'hazard', 'hazard_light', 'suit', 'visor', scale=s)
    tank = part('cyl', 'hull', vertices=10, loc=(-0.15 * s, 0, 0.56 * s), scale=(0.06 * s, 0.06 * s, 0.13 * s), parent=root)
    common.bevel(tank, 0.01, 1)
    part('cyl', 'gun', vertices=8, loc=(0.15 * s, -0.19 * s, 0.4 * s), scale=(0.03 * s, 0.03 * s, 0.12 * s),
         rot=(0, math.pi / 2, 0), parent=root)
    part('cone', 'armor_light', vertices=8, radius1=0.045 * s, radius2=0.0, depth=0.12 * s,
         loc=(0.32 * s, -0.19 * s, 0.4 * s), rot=(0, math.pi / 2, 0), parent=root)
    return rig


def rifleman(root):
    """소총병: 회녹색 장갑 + 주황 바이저 + 긴 소총"""
    rig = _humanoid(root, 'olive', 'olive_light', 'suit', 'visor_orange')
    part('cube', 'gun', loc=(0.2, -0.17, 0.48), scale=(0.24, 0.025, 0.035), parent=root)
    part('cube', 'gun', loc=(0.06, -0.17, 0.43), scale=(0.04, 0.02, 0.06), parent=root)
    part('cube', 'olive_light', loc=(-0.13, 0, 0.56), scale=(0.045, 0.1, 0.11), parent=root)
    return rig


def assault(root):
    """돌격병: 두꺼운 강철 중장갑(조금 크게) + 왼팔 큰 방패 + 오른손 빛나는 칼날. 소총병과 실루엣이 다르게"""
    s = 1.08
    rig = _humanoid(root, 'steel', 'steel_light', 'suit', 'visor_orange', scale=s)
    # 큰 어깨 덧판 + 가슴판
    for side in (1, -1):
        pad = part('cube', 'steel_light', loc=(0, 0.2 * side * s, 0.7 * s), scale=(0.1 * s, 0.07 * s, 0.035 * s), parent=root)
        common.bevel(pad, 0.015, 1)
    chest = part('cube', 'steel_light', loc=(0.09 * s, 0, 0.55 * s), scale=(0.035 * s, 0.12 * s, 0.11 * s), parent=root)
    common.bevel(chest, 0.015, 1)
    # 방패 (왼쪽 앞, 몸을 반쯤 가림)
    shield = part('cube', 'steel', loc=(0.17 * s, 0.22 * s, 0.45 * s), scale=(0.025 * s, 0.13 * s, 0.22 * s), parent=root)
    common.bevel(shield, 0.02, 2)
    part('cube', 'hazard_light', loc=(0.2 * s, 0.22 * s, 0.6 * s), scale=(0.008 * s, 0.11 * s, 0.018 * s), parent=root)
    # 칼날 (오른손, 앞으로)
    part('cube', 'gun', loc=(0.13 * s, -0.2 * s, 0.4 * s), scale=(0.05 * s, 0.035 * s, 0.04 * s), parent=root)
    part('cube', 'steel_light', loc=(0.3 * s, -0.2 * s, 0.4 * s), scale=(0.13 * s, 0.012 * s, 0.035 * s), parent=root)
    part('cube', 'visor_orange', loc=(0.3 * s, -0.2 * s, 0.37 * s), scale=(0.12 * s, 0.014 * s, 0.008 * s), parent=root)
    return rig


def pose_walk(rig, phase):
    """phase: 0..1 한 걸음 주기. 0 이면 서 있는 자세"""
    swing = math.sin(phase * math.tau) * math.radians(28)
    rig['legL'].rotation_euler = (0, swing, 0)
    rig['legR'].rotation_euler = (0, -swing, 0)
    rig['armL'].rotation_euler = (0, -swing * 0.7, 0)
    rig['armR'].rotation_euler = (0, swing * 0.4, 0)


# ---------- 건물 ----------
def _command_center_base(root):
    """사령부 받침: 3x3 칸을 꽉 채우는 착륙장 + 네 귀퉁이 불빛"""
    pad = part('cube', 'pad', loc=(0, 0, 0.08), scale=(1.42, 1.42, 0.08), parent=root)
    common.bevel(pad, 0.04, 2)
    for sx in (1, -1):
        for sy in (1, -1):
            part('cube', 'armor_light', loc=(1.2 * sx, 1.2 * sy, 0.2), scale=(0.14, 0.14, 0.08), parent=root)
            part('cube', 'visor', loc=(1.2 * sx, 1.2 * sy, 0.29), scale=(0.06, 0.06, 0.015), parent=root)


def command_center(root):
    """사령부: 팔각 본체 + 윗단 + 지휘탑(빛나는 창) + 레이더. 3x3 칸"""
    _command_center_base(root)
    body = part('cyl', 'hull', vertices=8, loc=(0, 0.05, 0.5), scale=(1.05, 1.05, 0.34), parent=root)
    common.bevel(body, 0.05, 2)
    part('cyl', 'visor', vertices=8, loc=(0, 0.05, 0.62), scale=(1.065, 1.065, 0.025), parent=root)
    deck = part('cyl', 'armor', vertices=8, loc=(0, 0.1, 0.95), scale=(0.75, 0.75, 0.12), parent=root)
    common.bevel(deck, 0.03, 2)
    # 지휘탑 (북쪽 = 뒤쪽에 두어 앞이 가리지 않게)
    tower = part('cube', 'armor_light', loc=(0, 0.35, 1.3), scale=(0.34, 0.26, 0.26), parent=root)
    common.bevel(tower, 0.03, 2)
    part('cube', 'visor', loc=(0, 0.09, 1.36), scale=(0.28, 0.01, 0.06), parent=root)
    # 레이더
    part('cyl', 'gun', vertices=8, loc=(0.45, 0.45, 1.45), scale=(0.025, 0.025, 0.35), parent=root)
    dish = part('cone', 'armor_light', vertices=12, radius1=0.2, radius2=0.04, depth=0.08,
                loc=(0.45, 0.45, 1.82), rot=(0.6, 0, 0.8), parent=root)
    common.flat_shading(dish)
    # 앞쪽 문
    part('cube', 'pad', loc=(0, -0.98, 0.32), scale=(0.3, 0.06, 0.2), parent=root)
    part('cube', 'feed_on', loc=(0, -1.04, 0.45), scale=(0.22, 0.01, 0.02), parent=root)


def command_center_frame(root):
    """짓는 중인 사령부: 받침 + 낮게 올라간 본체 + 비계 기둥 + 경고등"""
    _command_center_base(root)
    body = part('cyl', 'hull', vertices=8, loc=(0, 0.05, 0.28), scale=(1.05, 1.05, 0.12), parent=root)
    common.bevel(body, 0.04, 1)
    for sx in (1, -1):
        for sy in (1, -1):
            part('cube', 'gun', loc=(0.95 * sx, 0.95 * sy, 0.75), scale=(0.035, 0.035, 0.6), parent=root)
            part('uv', 'ember', segments=8, ring_count=5, loc=(0.95 * sx, 0.95 * sy, 1.38),
                 scale=(0.05, 0.05, 0.05), parent=root)
    for z in (0.65, 1.2):
        for axis in ('x', 'y'):
            for side in (1, -1):
                loc = (0, 0.95 * side, z) if axis == 'x' else (0.95 * side, 0, z)
                scale = (0.95, 0.02, 0.02) if axis == 'x' else (0.02, 0.95, 0.02)
                part('cube', 'gun', loc=loc, scale=scale, parent=root)


# ---------- 3단계 건물 (모두 남북으로 늘려 찍음: 자리 한가운데 = 원점, 크기 N 이면 ±N/2) ----------
def _pad(root, size, height=0.06, material='pad'):
    p = part('cube', material, loc=(0, 0, height), scale=(size / 2 - 0.04, size / 2 - 0.04, height), parent=root)
    common.bevel(p, 0.03, 1)
    return p


def campfire(root):
    """모닥불: 돌 테두리 + 엇갈린 장작 + 빛나는 불씨와 불꽃"""
    random.seed(5)
    for i in range(8):
        a = i / 8 * math.tau
        s = part('ico', 'rock', subdivisions=1, loc=(math.cos(a) * 0.3, math.sin(a) * 0.3, 0.06),
                 scale=(0.09, 0.08, 0.06), rot=(0, 0, random.uniform(0, 3)), parent=root)
        common.flat_shading(s)
    for a in (0.4, 2.0):
        part('cyl', 'rust', vertices=6, loc=(0, 0, 0.09), scale=(0.035, 0.035, 0.24), rot=(math.pi / 2, 0, a), parent=root)
    part('ico', 'ember', subdivisions=1, loc=(0, 0, 0.1), scale=(0.15, 0.15, 0.07), parent=root)
    for (dx, dy, h) in ((0, 0, 0.42), (0.07, 0.04, 0.3), (-0.06, -0.03, 0.26)):
        c = part('cone', 'feed_on', vertices=5, radius1=0.08, radius2=0.0, depth=h, loc=(dx, dy, 0.12 + h / 2), parent=root)
        common.flat_shading(c)


def barricade(root):
    """간이벽: 녹슨 철판과 상자를 쌓은 바리케이드 (1칸)"""
    random.seed(9)
    _pad(root, 1.0, 0.03, 'rock')
    for i in range(3):
        p = part('cube', 'rust' if i != 1 else 'hull', loc=(random.uniform(-0.08, 0.08), 0, 0.14 + i * 0.16),
                 scale=(0.44, 0.2 - i * 0.03, 0.08), rot=(0, random.uniform(-0.12, 0.12), random.uniform(-0.2, 0.2)),
                 parent=root)
        common.bevel(p, 0.015, 1)
    for x in (-0.3, 0.3):
        part('cube', 'gun', loc=(x, -0.18, 0.3), scale=(0.025, 0.025, 0.3), rot=(0.35, 0, 0), parent=root)


def scrap_turret(root):
    """간이 포탑: 고철 상자 받침 + 작은 회전 총 (1칸)"""
    _pad(root, 1.0, 0.03, 'rock')
    for (x, y) in ((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)):
        b = part('cube', 'rust', loc=(x, y, 0.13), scale=(0.18, 0.18, 0.1), parent=root)
        common.bevel(b, 0.015, 1)
    part('cyl', 'hull', vertices=10, loc=(0, 0, 0.32), scale=(0.2, 0.2, 0.1), parent=root)
    part('cube', 'armor', loc=(0, 0, 0.47), scale=(0.16, 0.13, 0.08), parent=root)
    part('cyl', 'gun', vertices=8, loc=(0, -0.28, 0.48), scale=(0.035, 0.035, 0.2), rot=(math.pi / 2, 0, 0), parent=root)
    part('cube', 'ember', loc=(0.08, -0.12, 0.55), scale=(0.03, 0.01, 0.02), parent=root)


def supply_depot(root):
    """보급고: 빛 띠가 있는 화물 컨테이너 더미 (2x2)"""
    _pad(root, 2.0)
    for (x, y, z, sx) in ((-0.45, 0.25, 0.3, 0.5), (0.45, 0.25, 0.3, 0.5), (0.0, -0.35, 0.3, 0.85), (0.0, 0.25, 0.72, 0.85)):
        c = part('cube', 'armor_light', loc=(x, y, z), scale=(sx, 0.3, 0.2), parent=root)
        common.bevel(c, 0.025, 1)
        part('cube', 'visor', loc=(x, y - 0.305, z), scale=(sx * 0.8, 0.004, 0.025), parent=root)
    for (x, y) in ((-0.85, -0.85), (0.85, -0.85), (-0.85, 0.85), (0.85, 0.85)):
        part('cube', 'feed_on', loc=(x, y, 0.15), scale=(0.05, 0.05, 0.03), parent=root)


def barracks(root):
    """병영: 경사 지붕 막사 + 빛나는 창과 문 + 안테나 (3x3)"""
    _pad(root, 3.0)
    hall = part('cube', 'armor', loc=(0, 0.15, 0.45), scale=(1.25, 0.95, 0.38), parent=root)
    common.bevel(hall, 0.04, 2)
    roof = part('cube', 'hull', loc=(0, 0.15, 0.95), scale=(1.3, 1.0, 0.12), rot=(0.18, 0, 0), parent=root)
    common.bevel(roof, 0.03, 1)
    # 지붕이 밋밋한 판으로 보이지 않게: 등마루 + 환기구 + 앞 가장자리 빛 띠
    part('cube', 'armor_light', loc=(0, 0.2, 1.1), scale=(1.32, 0.08, 0.05), rot=(0.18, 0, 0), parent=root)
    for x in (-0.75, 0.0, 0.75):
        part('cyl', 'pad', vertices=8, loc=(x, 0.55, 1.1), scale=(0.13, 0.13, 0.08), parent=root)
        part('cyl', 'gun', vertices=8, loc=(x, 0.55, 1.19), scale=(0.08, 0.08, 0.01), parent=root)
    part('cube', 'visor', loc=(0, -0.83, 0.8), scale=(1.25, 0.01, 0.015), parent=root)
    for x in (-0.8, -0.27, 0.27, 0.8):
        part('cube', 'visor', loc=(x, -0.805, 0.55), scale=(0.16, 0.01, 0.06), parent=root)
    part('cube', 'pad', loc=(0, -0.85, 0.3), scale=(0.32, 0.06, 0.24), parent=root)
    part('cube', 'feed_on', loc=(0, -0.92, 0.56), scale=(0.24, 0.01, 0.02), parent=root)
    part('cyl', 'gun', vertices=6, loc=(1.0, 0.8, 1.35), scale=(0.025, 0.025, 0.35), parent=root)
    part('uv', 'ember', segments=8, ring_count=5, loc=(1.0, 0.8, 1.72), scale=(0.05, 0.05, 0.05), parent=root)


def turret(root):
    """포탑: 육각 장갑 받침 + 쌍열 포신 + 붉은 감지등 (2x2)"""
    _pad(root, 2.0)
    base = part('cyl', 'hull', vertices=6, loc=(0, 0, 0.3), scale=(0.75, 0.75, 0.24), parent=root)
    common.bevel(base, 0.04, 2)
    head = part('cube', 'armor', loc=(0, 0.05, 0.75), scale=(0.42, 0.38, 0.2), parent=root)
    common.bevel(head, 0.04, 2)
    for x in (-0.15, 0.15):
        part('cyl', 'gun', vertices=8, loc=(x, -0.6, 0.78), scale=(0.06, 0.06, 0.42), rot=(math.pi / 2, 0, 0), parent=root)
    part('cube', 'ember', loc=(0, -0.335, 0.86), scale=(0.12, 0.01, 0.04), parent=root)


def construction_frame(root, size):
    """짓는 중 (크기 공용): 받침 + 낮은 바닥판 + 네 귀퉁이 비계 기둥과 가로대 + 경고등"""
    _pad(root, size)
    half = size / 2 - 0.12
    height = 0.45 + size * 0.25
    part('cube', 'hull', loc=(0, 0, 0.16), scale=(half * 0.85, half * 0.85, 0.06), parent=root)
    for sx in (1, -1):
        for sy in (1, -1):
            part('cube', 'gun', loc=(half * sx, half * sy, height / 2 + 0.1), scale=(0.03, 0.03, height / 2), parent=root)
            part('uv', 'ember', segments=8, ring_count=5, loc=(half * sx, half * sy, height + 0.14),
                 scale=(0.045, 0.045, 0.045), parent=root)
    for z in (height * 0.45 + 0.1, height + 0.08):
        for side in (1, -1):
            part('cube', 'gun', loc=(0, half * side, z), scale=(half, 0.018, 0.018), parent=root)
            part('cube', 'gun', loc=(half * side, 0, z), scale=(0.018, half, 0.018), parent=root)


# ---------- 괴물 ----------
def _monster_leg(root, name, x, side, length, thick, material, height):
    """엉덩이 빈 객체에 매단 비스듬한 다리. 엉덩이를 Z 축으로 돌리면 다리가 앞뒤로 움직인다"""
    hip = empty(name, loc=(x, 0.08 * side, height), parent=root)
    tilt = math.atan2(length * 0.8, height)
    part('cyl', material, vertices=6, loc=(0, length * 0.4 * side, -height / 2), scale=(thick, thick, height * 0.62),
         rot=(side * tilt, 0, 0), parent=hip)
    return hip


def swarm(root):
    """떼거리: 작고 빠른 다리 여섯 벌레. 앞은 +X. 걷기용 다리 목록을 돌려준다"""
    body = part('uv', 'carapace', segments=10, ring_count=6, loc=(0, 0, 0.22), scale=(0.2, 0.13, 0.09), parent=root)
    common.flat_shading(body)
    belly = part('uv', 'carapace', segments=10, ring_count=6, loc=(-0.22, 0, 0.25), scale=(0.17, 0.13, 0.11), parent=root)
    common.flat_shading(belly)
    part('cube', 'monster_glow', loc=(-0.24, 0, 0.355), scale=(0.06, 0.01, 0.008), parent=root)
    head = part('uv', 'carapace_light', segments=8, ring_count=5, loc=(0.21, 0, 0.21), scale=(0.09, 0.09, 0.07), parent=root)
    common.flat_shading(head)
    for side in (1, -1):
        part('uv', 'monster_eye', segments=6, ring_count=4, loc=(0.28, 0.045 * side, 0.25), scale=(0.024, 0.024, 0.024), parent=root)
        part('cone', 'bone', vertices=6, radius1=0.025, radius2=0.0, depth=0.12, loc=(0.33, 0.04 * side, 0.17),
             rot=(0, math.pi / 2, 0.35 * side), parent=root)
    for i, x in enumerate((0.03, -0.08, -0.19)):
        part('cone', 'carapace_light', vertices=5, radius1=0.04, radius2=0.0, depth=0.1, loc=(x, 0, 0.33), parent=root)
    legs = []
    for i, x in enumerate((0.12, 0.0, -0.13)):
        for side in (1, -1):
            hip = _monster_leg(root, f'leg{i}{side}', x, side, 0.2, 0.018, 'carapace', 0.2)
            legs.append((hip, (i + (0 if side > 0 else 1)) % 2))
    return {'legs': legs}


def charger(root):
    """돌진형: 등이 판갑으로 덮인 뿔 달린 짐승. 앞은 +X"""
    body = part('uv', 'carapace', segments=12, ring_count=8, loc=(0, 0, 0.4), scale=(0.46, 0.3, 0.22), parent=root)
    common.flat_shading(body)
    # 등: 겹친 둥근 껍질 + 가시
    for i, x in enumerate((0.2, 0.0, -0.2)):
        shell = part('uv', 'carapace_light', segments=10, ring_count=6, loc=(x, 0, 0.5 - abs(x) * 0.2),
                     scale=(0.17, 0.27 - abs(x) * 0.15, 0.13), rot=(0, -0.2, 0), parent=root)
        common.flat_shading(shell)
        part('cone', 'bone', vertices=5, radius1=0.035, radius2=0.0, depth=0.12, loc=(x + 0.03, 0, 0.66 - abs(x) * 0.25),
             rot=(0, -0.4, 0), parent=root)
    # 껍질 사이로 비치는 붉은 빛
    for x in (0.1, -0.1):
        part('uv', 'monster_glow', segments=6, ring_count=4, loc=(x, 0, 0.52), scale=(0.03, 0.2, 0.06), parent=root)
    head = part('uv', 'carapace_light', segments=10, ring_count=6, loc=(0.45, 0, 0.36), scale=(0.18, 0.19, 0.15), parent=root)
    common.flat_shading(head)
    part('cone', 'bone', vertices=8, radius1=0.08, radius2=0.0, depth=0.34, loc=(0.66, 0, 0.44),
         rot=(0, math.pi / 2 - 0.35, 0), parent=root)
    for side in (1, -1):
        part('uv', 'monster_eye', segments=6, ring_count=4, loc=(0.57, 0.11 * side, 0.42), scale=(0.03, 0.03, 0.03), parent=root)
        part('cone', 'bone', vertices=6, radius1=0.04, radius2=0.0, depth=0.18, loc=(0.52, 0.17 * side, 0.3),
             rot=(0, math.pi / 2 + 0.3, 0.5 * side), parent=root)
    legs = []
    for i, x in enumerate((0.24, -0.26)):
        for side in (1, -1):
            hip = _monster_leg(root, f'leg{i}{side}', x, side, 0.14, 0.075, 'carapace', 0.3)
            legs.append((hip, (i + (0 if side > 0 else 1)) % 2))
    return {'legs': legs}


def pose_crawl(rig, phase):
    """다리 여럿 걷기: 두 무리가 번갈아 앞뒤로. phase 0 이면 서 있기"""
    swing = math.sin(phase * math.tau) * math.radians(24)
    for hip, group in rig['legs']:
        side = 1 if hip.location.y > 0 else -1
        hip.rotation_euler = (0, 0, (swing if group == 0 else -swing) * side)


def meat(root):
    """사냥감을 잡으면 남는 고기: 뼈에 붙은 붉은 덩어리"""
    chunk = part('uv', 'flesh', segments=10, ring_count=6, loc=(0, 0, 0.1), scale=(0.17, 0.12, 0.09), parent=root)
    common.flat_shading(chunk)
    part('cyl', 'bone', vertices=8, loc=(0.18, 0.04, 0.1), scale=(0.025, 0.025, 0.12), rot=(0, math.pi / 2, 0.3), parent=root)
    for dy in (0.03, -0.03):
        part('uv', 'bone', segments=6, ring_count=4, loc=(0.3, 0.08 + dy, 0.1), scale=(0.03, 0.03, 0.03), parent=root)
